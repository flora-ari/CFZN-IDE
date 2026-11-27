import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ApiError } from '../common/api-error';
import { OPENBLOCK_MEDIA_TYPE } from '../config';
import type { IdeConfig } from './config';
import type { ProjectObjects } from './objects';
import { SerialQueue, transaction } from './state';

interface ProjectRow {
  id: string;
  owner: string;
  name: string;
  revision: number;
  size: number;
  checksum: string;
  object_key: string;
  created_at: string;
  updated_at: string;
  saved_at: string;
}

const checksum = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function project(row: ProjectRow) {
  return {
    id: row.id, name: row.name, revision: row.revision, size: row.size, checksum: row.checksum,
    contentType: OPENBLOCK_MEDIA_TYPE, createdAt: row.created_at, updatedAt: row.updated_at, savedAt: row.saved_at,
  };
}

function updatedAt(row: ProjectRow): string {
  return new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
}

export class MinioProjects {
  private readonly queue = new SerialQueue();
  private readonly logger = new Logger(MinioProjects.name);

  constructor(
    private readonly db: DatabaseSync,
    private readonly config: IdeConfig,
    private readonly objects: ProjectObjects,
  ) {}

  async initialize(): Promise<void> {
    await this.objects.probe();
    const abandoned = this.db.prepare('SELECT object_key FROM ide_object_cleanup').all() as { object_key: string }[];
    for (const row of abandoned) await this.cleanup(row.object_key);
  }

  async health() {
    await this.objects.probe();
    return { status: 'ok', storage: 'minio', auth: 'maker' } as const;
  }

  list(owner: string) {
    return this.db.prepare(
      'SELECT id, name, revision, size, updated_at AS updatedAt FROM ide_projects WHERE owner = ? ORDER BY updated_at DESC, id ASC',
    ).all(owner);
  }

  read(owner: string, id: string) {
    return project(this.require(owner, id));
  }

  async readContent(owner: string, id: string, expected?: number) {
    return this.queue.run(owner, async () => {
      const row = this.require(owner, id, expected);
      return { project: project(row), archive: await this.objects.get(row.object_key) };
    });
  }

  async create(owner: string, name: string, archive: Buffer) {
    const id = randomUUID();
    return this.queue.run(owner, async () => {
      this.checkQuota(owner, archive.length, true);
      return this.upload(owner, id, archive, (key, hash) => {
        this.checkQuota(owner, archive.length, true);
        const now = new Date().toISOString();
        this.db.prepare('INSERT INTO ide_projects VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)').run(
          owner, id, key, name, archive.length, hash, now, now, now,
        );
        return { result: project(this.require(owner, id)) };
      });
    });
  }

  async rename(owner: string, id: string, expected: number | undefined, name: string) {
    return this.queue.run(owner, async () => transaction(this.db, () => {
      const row = this.require(owner, id, expected);
      this.db.prepare('UPDATE ide_projects SET name = ?, updated_at = ? WHERE owner = ? AND id = ?')
        .run(name, updatedAt(row), owner, id);
      return project(this.require(owner, id));
    }));
  }

  async replace(owner: string, id: string, expected: number, archive: Buffer) {
    return this.queue.run(owner, async () => {
      const prior = this.require(owner, id, expected);
      this.checkQuota(owner, archive.length - prior.size);
      return this.upload(owner, id, archive, (key, hash) => {
        const row = this.require(owner, id, expected);
        this.checkQuota(owner, archive.length - row.size);
        const updated = updatedAt(row);
        this.db.prepare(
          'UPDATE ide_projects SET object_key = ?, revision = revision + 1, size = ?, checksum = ?, updated_at = ?, saved_at = ? WHERE owner = ? AND id = ?',
        ).run(key, archive.length, hash, updated, updated, owner, id);
        return { result: project(this.require(owner, id)), retired: row.object_key };
      });
    });
  }

  async delete(owner: string, id: string, expected?: number): Promise<void> {
    await this.queue.run(owner, async () => {
      const key = transaction(this.db, () => {
        const row = this.require(owner, id, expected);
        this.db.prepare('DELETE FROM ide_projects WHERE owner = ? AND id = ?').run(owner, id);
        this.pendingCleanup(row.object_key);
        return row.object_key;
      });
      await this.cleanup(key);
    });
  }

  private require(owner: string, id: string, expected?: number): ProjectRow {
    const row = this.db.prepare('SELECT * FROM ide_projects WHERE owner = ? AND id = ?')
      .get(owner, id) as unknown as ProjectRow | undefined;
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Project not found.');
    if (expected !== undefined && expected !== row.revision) {
      throw new ApiError(412, 'REVISION_MISMATCH', 'The project changed. Reload and try again.', { currentRevision: row.revision });
    }
    return row;
  }

  private checkQuota(owner: string, change: number, adding = false): void {
    const usage = this.db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM ide_projects WHERE owner = ?')
      .get(owner) as { count: number; bytes: number };
    if (adding && usage.count >= this.config.maxCount) {
      throw new ApiError(409, 'PROJECT_LIMIT_REACHED', 'The project count limit has been reached.');
    }
    if (change > 0 && usage.bytes + change > this.config.quotaBytes) {
      throw new ApiError(413, 'STORAGE_QUOTA_EXCEEDED', 'The account storage quota has been reached.');
    }
  }

  private async upload<T>(
    owner: string, id: string, archive: Buffer, commit: (key: string, hash: string) => { result: T; retired?: string },
  ): Promise<T> {
    const key = 'projects/v1/' + checksum(owner) + '/' + id + '/' + randomUUID() + '.ob';
    this.pendingCleanup(key);
    let committed: { result: T; retired?: string };
    try {
      const hash = checksum(archive);
      await this.objects.put(key, archive);
      committed = transaction(this.db, () => {
        const value = commit(key, hash);
        this.db.prepare('DELETE FROM ide_object_cleanup WHERE object_key = ?').run(key);
        if (value.retired) this.pendingCleanup(value.retired);
        return value;
      });
    } catch (error) {
      await this.cleanup(key);
      throw error;
    }
    if (committed.retired) await this.cleanup(committed.retired);
    return committed.result;
  }

  private pendingCleanup(key: string): void {
    this.db.prepare('INSERT OR IGNORE INTO ide_object_cleanup VALUES (?)').run(key);
  }

  private async cleanup(key: string): Promise<void> {
    try {
      if (!this.db.prepare('SELECT 1 FROM ide_projects WHERE object_key = ?').get(key)) {
        await this.objects.remove(key);
      }
      this.db.prepare('DELETE FROM ide_object_cleanup WHERE object_key = ?').run(key);
    } catch {
      this.logger.warn('A project object remained queued for cleanup after storage failed.');
    }
  }
}
