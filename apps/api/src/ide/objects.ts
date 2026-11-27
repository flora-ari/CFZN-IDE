import type { Readable } from 'node:stream';
import { Client } from 'minio';
import { ApiError } from '../common/api-error';
import { OPENBLOCK_MEDIA_TYPE } from '../config';
import type { IdeConfig } from './config';

export interface ProjectObjects {
  probe(): Promise<void>;
  put(key: string, archive: Buffer): Promise<void>;
  get(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

export const storageUnavailable = () => new ApiError(503, 'STORAGE_UNAVAILABLE', 'Project object storage is unavailable.');

export class MinioProjectObjects implements ProjectObjects {
  private readonly client: Client;

  constructor(private readonly config: IdeConfig) {
    const endpoint = new URL(config.minioEndpoint);
    const useSSL = endpoint.protocol === 'https:';
    this.client = new Client({
      endPoint: endpoint.hostname.replace(/^\[|\]$/g, ''),
      port: endpoint.port ? Number(endpoint.port) : useSSL ? 443 : 80,
      useSSL,
      accessKey: config.minioAccessKey,
      secretKey: config.minioSecretKey,
    });
  }

  async probe(): Promise<void> {
    try {
      if (await this.client.bucketExists(this.config.minioBucket)) return;
    } catch {
      throw storageUnavailable();
    }
    throw storageUnavailable();
  }

  async put(key: string, archive: Buffer): Promise<void> {
    try {
      await this.client.putObject(this.config.minioBucket, key, archive, archive.length, {
        'Content-Type': OPENBLOCK_MEDIA_TYPE,
      });
    } catch {
      throw storageUnavailable();
    }
  }

  async get(key: string): Promise<Readable> {
    try {
      return await this.client.getObject(this.config.minioBucket, key);
    } catch {
      throw storageUnavailable();
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.config.minioBucket, key);
    } catch {
      throw storageUnavailable();
    }
  }
}
