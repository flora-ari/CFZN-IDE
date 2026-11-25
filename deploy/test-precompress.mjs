import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, stat, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { precompressWeb } from './precompress.mjs';

test('HTTP gzip representations round-trip exactly without changing originals or compressing binary assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccraft-transfer-'));
  try {
    await mkdir(join(directory, 'nested'));
    const source = Buffer.from('const text = "用户源码 OpenBlock CCraft";\n'.repeat(300));
    const filename = join(directory, 'nested', 'gui.js');
    await writeFile(filename, source);
    const mtime = new Date('2026-11-23T00:00:00Z');
    await utimes(filename, mtime, mtime);
    await writeFile(join(directory, 'image.png'), source);
    await writeFile(join(directory, 'tiny.js'), 'small');
    await writeFile(join(directory, 'incompressible.txt'), randomBytes(8192));
    const totals = await precompressWeb(directory);
    assert.equal(totals.files, 1);
    assert.deepEqual(await readFile(filename), source);
    const compressed = await readFile(filename + '.gz');
    assert.deepEqual(gunzipSync(compressed), source);
    assert.ok(compressed.length < source.length / 2);
    assert.equal(totals.originalBytes, source.length);
    assert.equal(totals.gzipBytes, compressed.length);
    assert.equal((await stat(filename)).mtimeMs, mtime.getTime());
    assert.ok(Math.abs((await stat(filename + '.gz')).mtimeMs - mtime.getTime()) < 1);
    for (const excluded of ['image.png', 'tiny.js', 'incompressible.txt']) {
      await assert.rejects(stat(join(directory, excluded + '.gz')), { code: 'ENOENT' });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
