import { join } from 'node:path';

export const MAX_IDE_ARCHIVE_BYTES = 64 * 1024 ** 2;

export interface IdeConfig {
  stateDir: string;
  publicOrigin: string;
  portalOrigin: string;
  makerBaseUrl: string;
  makerHost?: string;
  sessionSecret: string;
  maxBytes: number;
  quotaBytes: number;
  maxCount: number;
  ticketTtl: number;
  minioEndpoint: string;
  minioBucket: string;
  minioAccessKey: string;
  minioSecretKey: string;
}

export function readIdeConfig(dataDir: string, env = process.env): IdeConfig | undefined {
  if (env.IDE_AUTH_MODE === undefined || env.IDE_AUTH_MODE === 'local') {
    if (env.NODE_ENV === 'production') throw new Error('Production requires IDE_AUTH_MODE=maker.');
    return undefined;
  }
  if (env.IDE_AUTH_MODE !== 'maker') throw new Error('IDE_AUTH_MODE must be local or maker.');

  function required(key: string): string {
    const value = env[key];
    if (!value?.trim()) throw new Error(`${key} is required when IDE authentication is enabled.`);
    return value;
  }

  function origin(key: string, value: string): string {
    const url = URL.parse(value);
    if (!url || !['https:', 'http:'].includes(url.protocol) || url.origin !== value) {
      throw new Error(`${key} must be an HTTP(S) origin without a trailing slash.`);
    }
    return value;
  }

  function integer(key: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new Error(`${key} must be an integer between 1 and ${maximum}.`);
    }
    return value;
  }

  const publicOrigin = origin('IDE_PUBLIC_ORIGIN', required('IDE_PUBLIC_ORIGIN'));
  if (env.NODE_ENV === 'production' && !publicOrigin.startsWith('https:')) {
    throw new Error('IDE_PUBLIC_ORIGIN must use HTTPS in production.');
  }
  const makerHost = env.IDE_MAKER_HOST;
  if (makerHost && !/^[a-z\d.-]+(?::\d+)?$/i.test(makerHost)) throw new Error('Invalid IDE_MAKER_HOST.');
  const sessionSecret = required('IDE_SESSION_SECRET');
  if (Buffer.byteLength(sessionSecret) < 32) throw new Error('IDE_SESSION_SECRET must be at least 32 bytes.');

  return {
    stateDir: join(dataDir, 'maker-ide'),
    publicOrigin,
    portalOrigin: origin('IDE_PORTAL_ORIGIN', env.IDE_PORTAL_ORIGIN ?? 'https://maker.xiaodaiyang.top'),
    makerBaseUrl: origin('IDE_MAKER_BASE_URL', required('IDE_MAKER_BASE_URL')),
    makerHost,
    sessionSecret,
    maxBytes: integer('IDE_PROJECT_MAX_BYTES', MAX_IDE_ARCHIVE_BYTES, MAX_IDE_ARCHIVE_BYTES),
    quotaBytes: integer('IDE_PROJECT_QUOTA_BYTES', 1024 ** 3),
    maxCount: integer('IDE_PROJECT_MAX_COUNT', 200),
    ticketTtl: integer('IDE_SSO_TICKET_TTL', 90, 600),
    minioEndpoint: origin('IDE_MINIO_ENDPOINT', required('IDE_MINIO_ENDPOINT')),
    minioBucket: required('IDE_MINIO_BUCKET'),
    minioAccessKey: required('IDE_MINIO_ACCESS_KEY'),
    minioSecretKey: required('IDE_MINIO_SECRET_KEY'),
  };
}
