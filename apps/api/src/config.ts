import { resolve } from 'node:path';

const MiB = 1024 * 1024;

export const MAX_ARCHIVE_BYTES = 20 * MiB;
export const MAX_EXPANDED_BYTES = 100 * MiB;
export const MAX_PROJECT_JSON_BYTES = 5 * MiB;
export const OPENBLOCK_MEDIA_TYPE = 'application/x.openblock.ob';
export const BINARY_MEDIA_TYPE = 'application/octet-stream';

export const LOCAL_HOST = '127.0.0.1';
export const DEFAULT_PORT = 3001;

export function projectDataDir(): string {
  return process.env.PROJECT_DATA_DIR
    ? resolve(process.env.PROJECT_DATA_DIR)
    : resolve(__dirname, '../../../.runtime/project-data');
}
