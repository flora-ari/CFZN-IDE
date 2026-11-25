import { readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const textExtensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.xml', '.txt']);

// Compression is an HTTP representation; never transform or replace source bytes.
export async function precompressWeb(directory) {
  const totals = { files: 0, originalBytes: 0, gzipBytes: 0 };
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await precompressWeb(filename);
      for (const key of Object.keys(totals)) totals[key] += nested[key];
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(extname(entry.name).toLowerCase())) continue;
    const metadata = await stat(filename);
    if (metadata.size < 1024) continue;
    const source = await readFile(filename);
    const compressed = gzipSync(source, { level: 6 });
    if (compressed.length >= source.length) continue;
    await writeFile(filename + '.gz', compressed);
    // Matching mtimes keep Last-Modified coherent for both negotiated representations.
    await utimes(filename + '.gz', metadata.atime, metadata.mtime);
    totals.files++;
    totals.originalBytes += source.length;
    totals.gzipBytes += compressed.length;
  }
  return totals;
}

// Only the bounded, content-addressed startup GUI gets a Brotli representation.
// This is generated offline and can be served as a static file by stock Nginx.
export async function precompressFastGui(directory) {
  const vendor = join(directory, 'openblock-vendor');
  const files = (await readdir(vendor)).filter(name => /^openblock-gui\.[a-f0-9]{16}\.js$/.test(name));
  const results = [];
  for (const name of files) {
    const file = join(vendor, name), source = await readFile(file), metadata = await stat(file);
    const compressed = brotliCompressSync(source, { params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    } });
    await writeFile(file + '.br', compressed);
    await utimes(file + '.br', metadata.atime, metadata.mtime);
    results.push({ path: '/openblock-vendor/' + name, originalBytes: source.length, brotliBytes: compressed.length });
  }
  return results;
}
