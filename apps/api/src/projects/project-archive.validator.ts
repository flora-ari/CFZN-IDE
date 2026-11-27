import type { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { ApiError, invalidProject, tooLarge } from '../common/api-error';
import { MAX_ARCHIVE_BYTES, MAX_EXPANDED_BYTES, MAX_PROJECT_JSON_BYTES } from '../config';

function openZip(archive: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(archive, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error) reject(error);
      else resolve(zip);
    });
  });
}

function openEntry(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

function eachEntry(zip: ZipFile, visit: (entry: Entry) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.once('end', resolve);
    zip.on('entry', (entry: Entry) => {
      void visit(entry).then(() => zip.readEntry()).catch(reject);
    });
    zip.readEntry();
  });
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function checkAssets(project: unknown, files: ReadonlySet<string>): void {
  const targets = asObject(project)?.targets;
  if (!Array.isArray(targets)) throw invalidProject('project.json must contain a targets array.');

  for (const target of targets) {
    for (const type of ['costumes', 'sounds'] as const) {
      const assets = asObject(target)?.[type];
      if (!Array.isArray(assets)) continue;
      for (const value of assets) {
        const asset = asObject(value);
        if (!asset) continue;
        const { md5ext, assetId, dataFormat } = asset;
        if (md5ext === undefined && assetId === undefined && dataFormat === undefined) continue;
        const filename = typeof md5ext === 'string' && md5ext
          ? md5ext
          : typeof assetId === 'string' && assetId && typeof dataFormat === 'string' && dataFormat
            ? `${assetId}.${dataFormat}`
            : undefined;
        if (!filename || !files.has(filename)) {
          throw invalidProject('A costume or sound referenced by project.json is missing from the archive.');
        }
      }
    }
  }
}

/** Inspect ZIP entries in memory and preserve the uploaded archive unchanged. */
export async function validateProjectArchive(archive: Buffer, maxBytes = MAX_ARCHIVE_BYTES): Promise<void> {
  if (archive.length > maxBytes) {
    const label = maxBytes % (1024 ** 2) === 0 ? (maxBytes / (1024 ** 2)) + ' MiB' : maxBytes + ' bytes';
    throw tooLarge('The project archive exceeds ' + label + '.');
  }
  let zip: ZipFile | undefined;
  try {
    const opened = await openZip(archive);
    zip = opened;
    const entries = new Set<string>();
    const files = new Set<string>();
    const projectChunks: Buffer[] = [];
    let expandedBytes = 0;

    await eachEntry(opened, async (entry) => {
      const filename = entry.fileName;
      if (entries.has(filename)) throw invalidProject('The archive contains duplicate ZIP entries.');
      entries.add(filename);
      if (!filename.endsWith('/')) files.add(filename);

      const isProjectJson = filename === 'project.json';
      if (isProjectJson && entry.uncompressedSize > MAX_PROJECT_JSON_BYTES) {
        throw tooLarge('project.json exceeds 5 MiB.');
      }
      if (entry.uncompressedSize > MAX_EXPANDED_BYTES - expandedBytes) {
        throw tooLarge('The expanded project archive exceeds 100 MiB.');
      }

      const stream = await openEntry(opened, entry);
      let crc = 0;
      let entryBytes = 0;
      for await (const chunk of stream) {
        const bytes: Buffer = chunk;
        crc = crc32(bytes, crc);
        entryBytes += bytes.length;
        expandedBytes += bytes.length;
        if (expandedBytes > MAX_EXPANDED_BYTES) throw tooLarge('The expanded project archive exceeds 100 MiB.');
        if (isProjectJson) {
          if (entryBytes > MAX_PROJECT_JSON_BYTES) throw tooLarge('project.json exceeds 5 MiB.');
          projectChunks.push(bytes);
        }
      }
      if (crc !== entry.crc32) throw invalidProject('The archive contains a damaged ZIP entry.');
    });

    if (!files.has('project.json')) throw invalidProject('The archive must contain project.json at its root.');
    let project: unknown;
    try {
      project = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(projectChunks)));
    } catch {
      throw invalidProject('project.json is not valid UTF-8 JSON.');
    }
    checkAssets(project, files);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidProject('The project archive is not a readable ZIP file.');
  } finally {
    zip?.close();
  }
}
