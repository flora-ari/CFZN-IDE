import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { addEditorMetadata, readEditorMetadata } from '../src/editor-archive.ts';

const archive = () => new Blob([zipSync({ 'project.json': strToU8('{"targets":[]}'), 'asset.svg': strToU8('<svg>fixture</svg>'), 'sound.wav': Uint8Array.of(0, 1, 255) }).buffer as ArrayBuffer]);
test('editor draft round trip preserves native entries and JSON escaping at the exact source limit', async () => {
  const source = '\u0000\n"\\'.repeat(262144); // 1 MiB source, considerably larger when JSON encoded.
  assert.equal(new TextEncoder().encode(source).length, 1024 * 1024);
  const original = archive(); const saved = await addEditorMetadata(Promise.resolve(original), { version: 1, codeMode: 'manual', manualSource: source });
  const bytes = await saved.arrayBuffer();
  assert.equal(readEditorMetadata(bytes).manualSource, source);
  const before = unzipSync(new Uint8Array(await original.arrayBuffer())), after = unzipSync(new Uint8Array(bytes));
  for (const name of Object.keys(before)) assert.deepEqual(after[name], before[name]);
  assert.throws(() => readEditorMetadata(zipSync({ 'cfzn/editor.json': strToU8('{"version":2,"codeMode":"manual"}') }).buffer as ArrayBuffer), /无效|不受支持/);
});
test('historical archive clears inherited draft; invalid metadata is rejected before loading', async () => {
  assert.deepEqual(readEditorMetadata(await archive().arrayBuffer()), { version: 1, codeMode: 'generated' });
  for (const entry of ['{', '{"version":1,"codeMode":"manual"}', '{"version":1,"codeMode":"unknown"}']) {
    assert.throws(() => readEditorMetadata(zipSync({ 'cfzn/editor.json': strToU8(entry) }).buffer as ArrayBuffer), /草稿/);
  }
  await assert.rejects(addEditorMetadata(Promise.resolve(archive()), { version: 1, codeMode: 'manual', manualSource: 'a'.repeat(1024 * 1024 + 1) }), /无效|版本/);
});
