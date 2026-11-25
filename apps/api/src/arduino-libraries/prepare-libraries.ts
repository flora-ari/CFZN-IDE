import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { ApiError } from '../common/api-error';
import { ArduinoLibraryIndex, readBoundedResponse, type ArduinoLibraryPackage } from './library-index';
import type { ArduinoLibraryReference } from './library-input';

const MIB = 1024 ** 2;
const MAX_PACKAGE_BYTES = 32 * MIB;
const MAX_DOWNLOAD_BYTES = 96 * MIB;
const MAX_EXPANDED_BYTES = 192 * MIB;
const MAX_ENTRIES = 20_000;
const MAX_PROPERTIES_BYTES = 64 * 1024;
const DOWNLOAD_TIMEOUT = 90_000;

export interface PreparedLibrary extends ArduinoLibraryReference { path: string; sha256: string }

function openArchive(bytes: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) reject(error);
      else resolve(zip);
    });
  });
}

interface ArchiveEntry { entry: Entry; segments: string[]; directory: boolean }
interface ArchiveBudget { bytes: number; entries: number }

function safeSegment(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !/[<>:"\\|?*\p{Cc}]/u.test(name) && !/[. ]$/.test(name) &&
    !/^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(name.split('.')[0].trimEnd());
}

function archiveEntries(zip: ZipFile, budget: ArchiveBudget, signal: AbortSignal): Promise<ArchiveEntry[]> {
  const paths = new Map<string, { path: string; directory: boolean; explicit: boolean }>();
  const entries: ArchiveEntry[] = [];
  return new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.once('end', () => resolve(entries));
    zip.on('entry', (entry: Entry) => {
      try {
        signal.throwIfAborted();
        budget.bytes -= entry.uncompressedSize;
        if (budget.bytes < 0) throw new Error('Extracted libraries exceed the job byte limit.');
        const directory = entry.fileName.endsWith('/');
        const path = directory ? entry.fileName.slice(0, -1) : entry.fileName;
        const segments = path.split('/');
        if (path.length > 900 || segments.length > 32 || segments.some((name) => !safeSegment(name))) {
          throw new Error('ZIP contains an unsafe library path.');
        }
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if ((mode && mode !== (directory ? 0o040000 : 0o100000)) ||
            (entry.externalFileAttributes & 0x400) || (directory && entry.uncompressedSize !== 0)) {
          throw new Error('ZIP contains a link or unsupported entry type.');
        }
        let prefix = '';
        for (const [index, segment] of segments.entries()) {
          prefix = prefix ? `${prefix}/${segment}` : segment;
          const key = prefix.toLowerCase().normalize('NFC');
          const explicit = index === segments.length - 1;
          const isDir = !explicit || directory;
          const previous = paths.get(key);
          if (previous && (previous.path !== prefix || previous.directory !== isDir || (previous.explicit && explicit))) {
            throw new Error('ZIP contains conflicting or duplicate paths.');
          }
          if (!previous && --budget.entries < 0) throw new Error('Extracted libraries exceed the job entry limit.');
          if (!previous || explicit) paths.set(key, { path: prefix, directory: isDir, explicit });
        }
        entries.push({ entry, segments, directory });
        zip.readEntry();
      } catch (error) { reject(error); }
    });
    zip.readEntry();
  });
}

function libraryPrefix(entries: ArchiveEntry[]): number {
  const properties = entries.filter(({ segments, directory }) => !directory &&
    segments.length <= 2 && segments.at(-1) === 'library.properties');
  if (properties.length !== 1 || properties[0].entry.uncompressedSize > MAX_PROPERTIES_BYTES) {
    throw new Error('ZIP must contain one valid library.properties file at its library root.');
  }
  const { segments } = properties[0];
  if (segments.length === 1) return 0;
  if (entries.some(({ segments: parts }) => parts[0] !== segments[0])) {
    throw new Error('ZIP must contain all files under one library root.');
  }
  return 1;
}

export async function readLibraryProperties(path: string, signal: AbortSignal): Promise<Map<string, string>> {
  const metadata = await readFile(join(path, 'library.properties'), { encoding: 'utf8', signal });
  const fields = new Map<string, string>();
  for (const line of metadata.split(/\r?\n/)) {
    const equals = line.indexOf('=');
    if (equals > 0) fields.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
  }
  return fields;
}

async function extractLibrary(bytes: Buffer, path: string, selected: ArduinoLibraryPackage, budget: ArchiveBudget, signal: AbortSignal) {
  const zip = await openArchive(bytes);
  try {
    const entries = await archiveEntries(zip, budget, signal);
    const prefix = libraryPrefix(entries);
    for (const { entry, segments, directory } of entries) {
      signal.throwIfAborted();
      const destination = join(path, ...segments.slice(prefix));
      if (directory) await mkdir(destination, { recursive: true });
      else {
        await mkdir(join(path, ...segments.slice(prefix, -1)), { recursive: true });
        const source = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
          zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream));
        });
        await pipeline(source, createWriteStream(destination, { flags: 'wx' }), { signal });
      }
    }
  } finally { zip.close(); }

  const fields = await readLibraryProperties(path, signal);
  if (fields.get('name') !== selected.name || fields.get('version') !== selected.version) {
    throw new Error('The library name or version in the ZIP does not match the official index.');
  }
}

export async function prepareLibraries(
  selections: ArduinoLibraryReference[], directory: string, index: ArduinoLibraryIndex, fetcher: typeof fetch, signal: AbortSignal,
): Promise<PreparedLibrary[]> {
  if (!selections.length) return [];
  const packages = await index.resolve(selections, signal);
  if (packages.some(({ size }) => size > MAX_PACKAGE_BYTES) ||
      packages.reduce((sum, { size }) => sum + size, 0) > MAX_DOWNLOAD_BYTES) {
    throw new ApiError(422, 'ARDUINO_LIBRARY_TOO_LARGE', 'Selected Arduino packages exceed the library download limits.');
  }
  const root = join(directory, 'l');
  const budget = { bytes: MAX_EXPANDED_BYTES, entries: MAX_ENTRIES };
  const prepared: PreparedLibrary[] = [];
  try {
    await mkdir(root, { mode: 0o700 });
    for (const [position, selected] of packages.entries()) {
      const { name, version, sha256, url, size } = selected;
      const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT)]);
      try {
        signal.throwIfAborted();
        const response = await fetcher(url, { redirect: 'error', signal: downloadSignal });
        const bytes = await readBoundedResponse(response, size, downloadSignal);
        if (bytes.length !== size || createHash('sha256').update(bytes).digest('hex') !== sha256) {
          throw new Error('Downloaded ZIP size or SHA-256 differs from the official index.');
        }
        const folderName = name.replace(/[^a-z0-9_.-]/gi, '_');
        const path = join(root, String(position), safeSegment(folderName) ? folderName : 'library');
        await extractLibrary(bytes, path, selected, budget, signal);
        prepared.push({ name, version, sha256, path });
      } catch (error) {
        signal.throwIfAborted();
        const message = error instanceof Error ? error.message : String(error);
        throw new ApiError(422, 'ARDUINO_LIBRARY_PREPARATION_FAILED', `Could not prepare ${name}@${version}: ${message}`);
      }
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return prepared;
}
