import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export async function openIdeState(directory: string): Promise<DatabaseSync> {
  await mkdir(directory, { mode: 0o700, recursive: true });
  const database = new DatabaseSync(join(directory, 'state.sqlite'));
  try {
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS ide_sessions (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, maker_credentials TEXT NOT NULL,
        access_nonce TEXT NOT NULL, refresh_digest TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ide_sso_tickets (
        digest TEXT PRIMARY KEY, owner TEXT NOT NULL UNIQUE, maker_credentials TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ide_projects (
        owner TEXT NOT NULL, id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL, revision INTEGER NOT NULL, size INTEGER NOT NULL, checksum TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, saved_at TEXT NOT NULL,
        PRIMARY KEY (owner, id)
      );
      CREATE TABLE IF NOT EXISTS ide_object_cleanup (object_key TEXT PRIMARY KEY);
    `);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export class SerialQueue {
  private readonly pending = new Map<string, Promise<void>>();

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const preceding = this.pending.get(key);
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.pending.set(key, current);
    try {
      await preceding;
      return await work();
    } finally {
      release();
      if (this.pending.get(key) === current) this.pending.delete(key);
    }
  }
}
