import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, conflict, notFound, storageError } from '../common/api-error';
import { UUID_PATTERN } from './project-input';
import type { Project, ProjectContent, ProjectStore } from './project-store';

interface StoredProject {
  project: Project;
  archiveFile: string;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

export class LocalProjectStore implements ProjectStore {
  private readonly projects: string;
  private readonly staging: string;
  private readonly trash: string;
  private readonly locks = new Map<string, Promise<void>>();
  private readonly logger = new Logger(LocalProjectStore.name);

  constructor(dataDir: string) {
    this.projects = join(dataDir, 'projects');
    this.staging = join(dataDir, 'staging');
    this.trash = join(dataDir, 'trash');
  }

  async initialize(): Promise<void> {
    await Promise.all([this.projects, this.staging, this.trash].map((directory) => mkdir(directory, { recursive: true })));
  }

  list(): Promise<Project[]> {
    return this.storage(async () => {
      const entries = await readdir(this.projects, { withFileTypes: true });
      const items: Project[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !UUID_PATTERN.test(entry.name)) continue;
        const stored = await this.locked(entry.name, () => this.readStored(entry.name));
        if (stored) items.push(stored.project);
      }
      return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    });
  }

  read(id: string): Promise<Project> {
    return this.storage(() => this.locked(id, async () => (await this.requireStored(id)).project));
  }

  readContent(id: string, expectedRevision?: number): Promise<ProjectContent> {
    return this.storage(() => this.locked(id, async () => {
      const { project, archiveFile } = await this.requireStored(id, expectedRevision);
      const archive = await readFile(join(this.projects, id, archiveFile));
      if (archive.length !== project.sizeBytes) throw new Error('Archive size differs from project metadata');
      return { project, archive };
    }));
  }

  create(name: string, archive: Buffer): Promise<Project> {
    return this.storage(async () => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const project: Project = {
        id, name, revision: 1, format: 'openblock', sizeBytes: archive.length, createdAt: now, updatedAt: now,
      };
      const archiveFile = `${randomUUID()}.ob`;
      const stagingDir = await mkdtemp(join(this.staging, 'project-'));
      try {
        await this.writeNew(join(stagingDir, archiveFile), archive);
        await this.writeNew(join(stagingDir, 'metadata.json'), this.serialize({ project, archiveFile }));
        // Only fully written directories become visible to list and reads.
        await rename(stagingDir, join(this.projects, id));
      } catch (error) {
        await this.cleanup(stagingDir, true);
        throw error;
      }
      return project;
    });
  }

  rename(id: string, expectedRevision: number, name: string): Promise<Project> {
    return this.storage(() => this.locked(id, async () => {
      const stored = await this.requireStored(id, expectedRevision);
      const project = { ...this.advance(stored.project), name };
      await this.commitMetadata(join(this.projects, id), { ...stored, project });
      return project;
    }));
  }

  replaceContent(id: string, expectedRevision: number, archive: Buffer): Promise<Project> {
    return this.storage(() => this.locked(id, async () => {
      const stored = await this.requireStored(id, expectedRevision);
      const project = { ...this.advance(stored.project), sizeBytes: archive.length };
      const directory = join(this.projects, id);
      const archiveFile = `${randomUUID()}.ob`;
      const archivePath = join(directory, archiveFile);
      try {
        await this.writeNew(archivePath, archive);
        // Replacing this pointer is the single commit step. The old archive is still readable until then.
        await this.commitMetadata(directory, { project, archiveFile });
      } catch (error) {
        await this.cleanup(archivePath);
        throw error;
      }
      await this.cleanup(join(directory, stored.archiveFile));
      return project;
    }));
  }

  delete(id: string, expectedRevision: number): Promise<void> {
    return this.storage(() => this.locked(id, async () => {
      await this.requireStored(id, expectedRevision);
      const deleted = join(this.trash, randomUUID());
      await rename(join(this.projects, id), deleted);
      await this.cleanup(deleted, true);
    }));
  }

  private async locked<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id);
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(id, current);
    try {
      await previous;
      return await operation();
    } finally {
      release();
      if (this.locks.get(id) === current) this.locks.delete(id);
    }
  }

  private async requireStored(id: string, expectedRevision?: number): Promise<StoredProject> {
    const stored = await this.readStored(id);
    if (!stored) throw notFound();
    if (expectedRevision !== undefined && stored.project.revision !== expectedRevision) {
      throw conflict(stored.project.revision);
    }
    return stored;
  }

  private async readStored(id: string): Promise<StoredProject | undefined> {
    const directory = join(this.projects, id);
    let json: string;
    try {
      json = await readFile(join(directory, 'metadata.json'), 'utf8');
    } catch (error) {
      if (!isMissing(error)) throw error;
      try {
        await stat(directory);
      } catch (directoryError) {
        if (isMissing(directoryError)) return undefined;
        throw directoryError;
      }
      throw error;
    }

    const { project, archiveFile } = JSON.parse(json);
    const { id: storedId, name, revision, format, sizeBytes, createdAt, updatedAt } = project;
    if (storedId !== id || typeof name !== 'string' || !Number.isSafeInteger(revision) || revision < 1 ||
        format !== 'openblock' || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 ||
        typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) ||
        typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)) ||
        typeof archiveFile !== 'string' || !archiveFile.endsWith('.ob') ||
        !UUID_PATTERN.test(archiveFile.slice(0, -3))) {
      throw new Error('Invalid stored project metadata');
    }
    return { project: { id, name, revision, format, sizeBytes, createdAt, updatedAt }, archiveFile };
  }

  private advance(project: Project): Project {
    return {
      ...project,
      revision: project.revision + 1,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(project.updatedAt) + 1)).toISOString(),
    };
  }

  private writeNew(path: string, value: string | Buffer): Promise<void> {
    return writeFile(path, value, { flag: 'wx', flush: true });
  }

  private serialize(value: StoredProject): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  private async commitMetadata(directory: string, value: StoredProject): Promise<void> {
    const pending = join(directory, `${randomUUID()}.tmp`);
    try {
      await this.writeNew(pending, this.serialize(value));
      await rename(pending, join(directory, 'metadata.json'));
    } catch (error) {
      await this.cleanup(pending);
      throw error;
    }
  }

  private async cleanup(path: string, recursive = false): Promise<void> {
    try {
      await rm(path, { force: true, recursive });
    } catch (error) {
      this.logger.warn('Could not remove an unreferenced project file or directory.', error);
    }
  }

  private async storage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      this.logger.error('Project file operation failed', error instanceof Error ? error.stack : undefined);
      throw storageError();
    }
  }
}
