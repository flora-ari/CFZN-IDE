import { ApiError, invalid } from '../common/api-error';
import { isLibraryName, isLibraryVersion, type ArduinoLibraryReference } from './library-input';

const OFFICIAL_ORIGIN = 'https://downloads.arduino.cc';
const INDEX_URL = `${OFFICIAL_ORIGIN}/libraries/library_index.json`;
const INDEX_LIMIT = 96 * 1024 ** 2;
const INDEX_TIMEOUT = 60_000;
const CACHE_TIME = 30 * 60_000;
const RETRY_DELAY = 30_000;
const MAX_RESULTS = 50;
const versions = new Intl.Collator('en', { numeric: true });

export const ARDUINO_LIBRARY_INDEX = Symbol('ARDUINO_LIBRARY_INDEX');

export interface ArduinoLibraryPackage extends ArduinoLibraryReference {
  author: string;
  description: string;
  architectures: string[];
  url: string;
  sha256: string;
  size: number;
}

type Catalog = Map<string, Map<string, ArduinoLibraryPackage | null>>;

export async function readBoundedResponse(response: Response, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Download returned HTTP ${response.status}.`);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('Download exceeds the allowed byte size.');
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks, bytes);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function downloadUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1024) return undefined;
  const url = URL.parse(value);
  if (url?.origin !== OFFICIAL_ORIGIN || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith('/libraries/') || !url.pathname.endsWith('.zip')) return undefined;
  return url.href;
}

function parsePackage(value: unknown): ArduinoLibraryPackage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const { name, version, author, sentence, architectures, checksum, size } = data;
  const url = downloadUrl(data.url);
  if (!isLibraryName(name) || !isLibraryVersion(version) || !url || typeof checksum !== 'string' ||
      !/^SHA-256:[0-9a-f]{64}$/i.test(checksum) || typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    return undefined;
  }
  return {
    name, version, url, size,
    sha256: checksum.slice(8).toLowerCase(),
    author: typeof author === 'string' ? author.slice(0, 512) : '',
    description: typeof sentence === 'string' ? sentence.slice(0, 1024) : '',
    architectures: Array.isArray(architectures)
      ? architectures.filter((architecture): architecture is string => typeof architecture === 'string' && architecture.length <= 64)
      : [],
  };
}

function parseIndex(bytes: Buffer): Catalog {
  const index = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(index?.libraries)) throw new Error('Unexpected Arduino library index format.');
  const catalog: Catalog = new Map();
  for (const value of index.libraries) {
    const entry = parsePackage(value);
    if (!entry) continue;
    let group = catalog.get(entry.name);
    if (!group) {
      group = new Map();
      catalog.set(entry.name, group);
    }
    const previous = group.get(entry.version);
    if (previous === undefined) group.set(entry.version, entry);
    else if (previous && (previous.sha256 !== entry.sha256 || previous.size !== entry.size)) group.set(entry.version, null);
  }
  if (catalog.size === 0) throw new Error('The Arduino library index contains no usable packages.');
  return catalog;
}

function compareVersions(a: ArduinoLibraryPackage, b: ArduinoLibraryPackage): number {
  const [aBase, aPre] = a.version.split('+', 1)[0].split(/-(.*)/s, 2);
  const [bBase, bPre] = b.version.split('+', 1)[0].split(/-(.*)/s, 2);
  return versions.compare(bBase, aBase) || Number(aPre !== undefined) - Number(bPre !== undefined) ||
    versions.compare(bPre ?? '', aPre ?? '') || a.version.localeCompare(b.version, 'en');
}

function unavailable() {
  return new ApiError(503, 'ARDUINO_LIBRARY_INDEX_UNAVAILABLE', 'The Arduino Library Manager index is unavailable. Try again in a moment.');
}

export class ArduinoLibraryIndex {
  private cached?: Catalog;
  private refresh?: Promise<Catalog>;
  private refreshAt = 0;

  constructor(private readonly fetcher = globalThis.fetch) {}

  async search(query: unknown) {
    const value = query === undefined ? '' : query;
    if (typeof value !== 'string' || value.length > 120 || /\p{Cc}/u.test(value)) {
      throw invalid('Provide a search term up to 120 characters.', 'q');
    }
    const term = value.trim().toLowerCase();
    if (!term) return [];
    const matches = [];
    for (const [name, group] of await this.snapshot()) {
      const entries = [...group.values()].filter((entry) => entry !== null);
      const folded = name.toLowerCase();
      const rank = folded === term ? 0 : folded.startsWith(term) ? 1 : folded.includes(term) ? 2 : 3;
      if (entries.length && (rank < 3 || entries.some(({ author, description }) =>
        author.toLowerCase().includes(term) || description.toLowerCase().includes(term)))) {
        matches.push({ name, rank, entries });
      }
    }
    matches.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'en'));
    return matches.slice(0, MAX_RESULTS).map(({ name, entries }) => {
      entries.sort(compareVersions);
      const { author, description } = entries[0];
      return { name, author, description, versions: entries.map(({ version, architectures }) => ({ version, architectures })) };
    });
  }

  async resolve(references: ArduinoLibraryReference[], signal: AbortSignal): Promise<ArduinoLibraryPackage[]> {
    const catalog = await this.snapshot(signal);
    return references.map(({ name, version }) => {
      const entry = catalog.get(name)?.get(version);
      if (entry === null) {
        throw new ApiError(422, 'ARDUINO_LIBRARY_AMBIGUOUS', `The Arduino index contains conflicting packages for ${name}@${version}. Choose a different version.`);
      }
      if (!entry) throw new ApiError(422, 'ARDUINO_LIBRARY_NOT_FOUND', `Arduino library ${name}@${version} is unavailable in the official index.`);
      return entry;
    });
  }

  private async snapshot(signal?: AbortSignal): Promise<Catalog> {
    signal?.throwIfAborted();
    if (!this.refresh && Date.now() >= this.refreshAt) {
      this.refresh = this.load().finally(() => { this.refresh = undefined; });
    }
    const pending = this.refresh;
    if (!pending) {
      if (this.cached) return this.cached;
      throw unavailable();
    }
    if (!signal) return pending;
    // Cancelling one job releases its wait while any other caller can still use the shared refresh.
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    });
  }

  private async load(): Promise<Catalog> {
    try {
      const signal = AbortSignal.timeout(INDEX_TIMEOUT);
      const response = await this.fetcher(INDEX_URL, { redirect: 'error', signal });
      this.cached = parseIndex(await readBoundedResponse(response, INDEX_LIMIT, signal));
      this.refreshAt = Date.now() + CACHE_TIME;
      return this.cached;
    } catch {
      this.refreshAt = Date.now() + RETRY_DELAY;
      if (this.cached) return this.cached;
      throw unavailable();
    }
  }
}
