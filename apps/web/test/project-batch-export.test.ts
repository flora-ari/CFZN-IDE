import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import type { Project } from '../src/api.ts';
import { exportSavedProjects } from '../src/project-batch-export.ts';

function project(id: string, name: string, revision = 1): Project {
  return { id, name, revision, format: 'openblock', sizeBytes: 3, createdAt: '', updatedAt: '' };
}

test('one saved project downloads as an unchanged .ob archive', async () => {
  const bytes = Uint8Array.of(0x50, 0x4b, 0x03);
  const saved = project('id-one', '示例', 4);
  const file = await exportSavedProjects([saved], async requested => {
    assert.equal(requested, saved);
    assert.equal(requested.revision, 4);
    return bytes.buffer;
  });
  assert.equal(file.name, '示例.ob');
  assert.deepEqual(new Uint8Array(await file.blob.arrayBuffer()), bytes);
});

test('multiple projects produce a ZIP of unique safe filenames and unchanged .ob bytes', async () => {
  const longName = '工'.repeat(100);
  const projects = ['项目 A', '项目 a', '项目 A (2)', '项目 A', '../CON\\板子', longName, longName]
    .map((name, index) => project(String(index), name));
  let requestCount = 0;
  const file = await exportSavedProjects(projects, async requested => {
    assert.equal(requested, projects[requestCount]);
    return Uint8Array.of(++requestCount, 9, 7).buffer;
  });
  assert.equal(file.name, 'CCraft项目.zip');
  const entries = Object.entries(unzipSync(new Uint8Array(await file.blob.arrayBuffer())));
  assert.equal(entries.length, projects.length);
  assert.deepEqual(entries.slice(0, 4).map(([name]) => name), ['项目 A.ob', '项目 a (2).ob', '项目 A (2) (2).ob', '项目 A (3).ob']);
  assert.equal(new Set(entries.map(([name]) => name.toLowerCase())).size, projects.length);
  for (const [index, [name, bytes]] of entries.entries()) {
    assert.doesNotMatch(name, /[/\\]/);
    assert.ok(new TextEncoder().encode(name).length <= 255);
    assert.deepEqual(bytes, Uint8Array.of(index + 1, 9, 7));
  }
});

test('a failed saved revision aborts the ZIP before reading later projects', async () => {
  const requests: string[] = [];
  await assert.rejects(exportSavedProjects([project('one', 'A'), project('two', 'B'), project('three', 'C')], async requested => {
    requests.push(requested.id);
    if (requested.id === 'two') throw new Error('revision changed');
    return Uint8Array.of(1).buffer;
  }), /revision changed/);
  assert.deepEqual(requests, ['one', 'two']);
});
