import { randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from '../common/api-error';
import { CUSTOM_MODULE_ID, type CustomModuleDefinition, type CustomModuleRecord } from './definition';
import type { OwnerScope } from './module-access';

export const CUSTOM_MODULE_STORE = Symbol('CUSTOM_MODULE_STORE');

const missing = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
const exists = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
const notFound = () => new ApiError(404, 'CUSTOM_MODULE_NOT_FOUND', 'Custom module not found.');

export class LocalModuleStore {
  private readonly owners: string;

  constructor(dataDir: string) {
    this.owners = join(dataDir, 'private-modules');
  }

  async initialize(): Promise<void> {
    await this.storage(() => mkdir(this.owners, { recursive: true, mode: 0o700 }));
  }

  async reserveBrowserOwner(owner: OwnerScope): Promise<boolean> {
    return this.storage(async () => {
      try {
        await mkdir(this.ownerDir(owner), { mode: 0o700 });
        return true;
      } catch (error) {
        if (exists(error)) return false;
        throw error;
      }
    });
  }

  hasBrowserOwner(owner: OwnerScope): Promise<boolean> {
    return this.storage(async () => (await this.entry(this.ownerDir(owner)))?.isDirectory() ?? false);
  }

  list(owner: OwnerScope): Promise<CustomModuleRecord[]> {
    return this.storage(async () => {
      const ownerDir = this.ownerDir(owner);
      const directory = await this.entry(ownerDir);
      if (!directory?.isDirectory()) return [];
      const entries = await readdir(ownerDir, { withFileTypes: true });
      const items: CustomModuleRecord[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !CUSTOM_MODULE_ID.test(entry.name)) continue;
        const versionDir = this.versionDir(owner, entry.name);
        if (await this.entry(join(versionDir, 'hidden'))) continue;
        items.push(await this.readSnapshot(versionDir, entry.name));
      }
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    });
  }

  create(owner: OwnerScope, definition: CustomModuleDefinition): Promise<CustomModuleRecord> {
    return this.storage(async () => {
      const directory = this.ownerDir(owner);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const item: CustomModuleRecord = {
        id: `custom${randomBytes(16).toString('hex')}`,
        definition,
        createdAt: new Date().toISOString(),
      };
      const staging = await mkdtemp(join(directory, '.stage-'));
      const temporarySnapshot = join(staging, 'version.json');
      try {
        await writeFile(temporarySnapshot, JSON.stringify(item), { flag: 'wx', flush: true, mode: 0o600 });
        // Only a fully written directory can become a version. Existing versions are nonempty.
        await rename(staging, this.versionDir(owner, item.id));
      } catch (error) {
        await rm(temporarySnapshot, { force: true }).catch(() => undefined);
        await rmdir(staging).catch(() => undefined);
        throw error;
      }
      return item;
    });
  }

  read(owner: OwnerScope, id: string): Promise<CustomModuleRecord> {
    return this.storage(async () => this.readSnapshot(await this.requireVersion(owner, id), id));
  }

  hide(owner: OwnerScope, id: string): Promise<void> {
    return this.storage(async () => {
      const directory = await this.requireVersion(owner, id);
      try {
        // The presence of the marker is the commit. The snapshot is never rewritten.
        await mkdir(join(directory, 'hidden'), { mode: 0o700 });
      } catch (error) {
        if (!exists(error)) throw error;
      }
    });
  }

  private ownerDir(owner: OwnerScope): string {
    if (!/^[0-9a-f]{64}$/.test(owner)) throw new Error('Invalid internal owner key.');
    return join(this.owners, owner);
  }

  private versionDir(owner: OwnerScope, id: string): string {
    if (!CUSTOM_MODULE_ID.test(id)) throw notFound();
    return join(this.ownerDir(owner), id);
  }

  private async requireVersion(owner: OwnerScope, id: string): Promise<string> {
    const directory = this.versionDir(owner, id);
    if (!(await this.entry(this.ownerDir(owner)))?.isDirectory() ||
        !(await this.entry(directory))?.isDirectory()) throw notFound();
    return directory;
  }

  private async readSnapshot(directory: string, id: string): Promise<CustomModuleRecord> {
    const item = JSON.parse(await readFile(join(directory, 'version.json'), 'utf8')) as CustomModuleRecord;
    if (item.id !== id || !item.definition || !Number.isFinite(Date.parse(item.createdAt))) {
      throw new Error('Invalid stored module snapshot.');
    }
    return { id, definition: item.definition, createdAt: item.createdAt };
  }

  private async entry(path: string) {
    try {
      return await lstat(path);
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }

  private async storage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'CUSTOM_MODULE_STORAGE_ERROR', 'The custom module storage operation failed.');
    }
  }
}
