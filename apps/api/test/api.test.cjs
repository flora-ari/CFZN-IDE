const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, readdir, rm } = require('node:fs/promises');
const fsPromises = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { basename, join } = require('node:path');
const { Readable } = require('node:stream');
const { buffer } = require('node:stream/consumers');
const { test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { ZipFile } = require('yazl');
const { createApp } = require('../dist/app.js');

const OB_TYPE = 'application/x.openblock.ob';
const ARCHIVE_LIMIT = 20 * 1024 ** 2;
const COSTUME = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#0071eb"/></svg>');
const SOUND = Buffer.from('524946462600000057415645666d74201000000001000100401f0000401f00000100080064617461020000008080', 'hex');
const PROJECT = {
  targets: [{
    isStage: true,
    name: 'Stage',
    variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
    currentCostume: 0,
    costumes: [{ name: 'Blue', assetId: 'blue', dataFormat: 'svg', md5ext: 'blue.svg' }],
    sounds: [{ name: 'Click', assetId: 'click', dataFormat: 'wav' }],
  }],
  meta: { semver: '3.0.0' },
};

Logger.overrideLogger(false);

async function zip(entries) {
  const archive = new ZipFile();
  for (const [name, data, options] of entries) {
    if (data instanceof Readable) archive.addReadStream(data, name, options);
    else archive.addBuffer(Buffer.from(data), name, options);
  }
  const bytes = buffer(archive.outputStream);
  archive.end();
  return bytes;
}

async function exampleArchive(marker = 'original') {
  return zip([
    ['project.json', JSON.stringify({ ...PROJECT, marker })],
    ['blue.svg', COSTUME],
    ['click.wav', SOUND],
  ]);
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'cfzn-api-'));
  let app;
  let base;
  async function start() {
    app = await createApp(dataDir);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  }
  t.after(async () => {
    if (app) await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  await start();
  return {
    request: (path, options) => fetch(`${base}${path}`, options),
    dataDir,
    restart: async () => { await app.close(); app = undefined; await start(); },
  };
}

async function create(request, archive, name = 'LED 调试', filename = 'source.ob') {
  const body = new FormData();
  body.set('name', name);
  body.set('file', new Blob([archive], { type: OB_TYPE }), filename);
  return request('/projects', { method: 'POST', body });
}

function replace(request, path, archive, ifMatch, type = 'application/octet-stream') {
  return request(`${path}/content`, {
    method: 'PUT', headers: { 'Content-Type': type, 'If-Match': ifMatch }, body: archive,
  });
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.ok(body.error.message.length > 0);
  return body.error;
}

async function expectProject(response, status, revision) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('etag'), `"${revision}"`);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['project']);
  const project = body.project;
  assert.deepEqual(Object.keys(project).sort(), ['createdAt', 'format', 'id', 'name', 'revision', 'sizeBytes', 'updatedAt']);
  assert.match(project.id, /^[0-9a-f-]{36}$/);
  assert.equal(project.revision, revision);
  assert.equal(project.format, 'openblock');
  for (const timestamp of [project.createdAt, project.updatedAt]) {
    assert.equal(new Date(timestamp).toISOString(), timestamp);
  }
  return project;
}

async function expectArchive(request, path, archive, revision, ifMatch) {
  const response = await request(`${path}/content`, { headers: ifMatch ? { 'If-Match': ifMatch } : undefined });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('etag'), `"${revision}"`);
  assert.equal(response.headers.get('content-type'), OB_TYPE);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-length'), String(archive.length));
  assert.match(response.headers.get('content-disposition') ?? '', /^attachment; filename="project\.ob"/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), archive);
}

test('creates, lists, reads, replaces, renames and deletes complete archives across restart', async (t) => {
  const { request, restart } = await fixture(t);
  const original = await exampleArchive();
  const replacement = await exampleArchive('changed');
  assert.deepEqual(await (await request('/health')).json(), { status: 'ok', storage: 'local', auth: 'none' });
  assert.deepEqual(await (await request('/projects')).json(), { items: [] });

  const saved = await expectProject(await create(request, original, '  LED 调试  ', 'import.sb3'), 201, 1);
  const path = `/projects/${saved.id}`;
  assert.equal(saved.name, 'LED 调试');
  assert.equal(saved.sizeBytes, original.length);
  assert.deepEqual(await expectProject(await request(path), 200, 1), saved);
  await expectArchive(request, path, original, 1, '"1"');

  const other = await expectProject(await create(request, original, 'Other'), 201, 1);
  assert.deepEqual((await (await request('/projects')).json()).items.map(({ id }) => id), [other.id, saved.id]);

  const updated = await expectProject(await replace(request, path, replacement, '"1"', OB_TYPE), 200, 2);
  assert.equal(updated.name, saved.name);
  assert.equal(updated.createdAt, saved.createdAt);
  assert.ok(updated.updatedAt > saved.updatedAt);
  assert.equal(updated.sizeBytes, replacement.length);
  await expectError(await request(`${path}/content`, { headers: { 'If-Match': '"1"' } }), 412, 'REVISION_CONFLICT');

  const renamed = await expectProject(await request(path, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': '"2"' },
    body: JSON.stringify({ name: '  新名称  ' }),
  }), 200, 3);
  assert.equal(renamed.name, '新名称');
  assert.equal(renamed.createdAt, saved.createdAt);
  assert.equal(renamed.sizeBytes, replacement.length);

  await restart();
  assert.deepEqual(await expectProject(await request(path), 200, 3), renamed);
  await expectArchive(request, path, replacement, 3);
  assert.deepEqual((await (await request('/projects')).json()).items.map(({ id }) => id), [saved.id, other.id]);

  const deleted = await request(path, { method: 'DELETE', headers: { 'If-Match': '"3"' } });
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  await expectError(await request(path), 404, 'PROJECT_NOT_FOUND');
  await expectError(await request(`${path}/content`), 404, 'PROJECT_NOT_FOUND');
  assert.deepEqual(await (await request('/projects')).json(), { items: [other] });
});

test('preserves controller, loaded modules, unknown extension IDs and assets through POST and PUT', async (t) => {
  const { request, restart } = await fixture(t);
  async function extensionArchive(pin, buzzerOpcode, costume, sound) {
    const project = {
      ...PROJECT,
      device: { deviceId: 'aijiteESP32S3', type: 'arduino' },
      programMode: 'upload',
      extensions: ['pen', 'music', 'futureStageExtension'],
      // These modules remain loaded even though only activateBuzzer has placed blocks.
      deviceExtensions: ['activateBuzzer', 'pirSensor', 'moreComments', 'futureDeviceExtension'],
      targets: [{
        ...PROJECT.targets[0],
        blocks: {
          buzzerInit: {
            opcode: 'activeBuzzer_init', next: 'buzzerState', parent: null,
            inputs: {}, fields: { PIN: [pin, null] }, shadow: false, topLevel: true, x: 32, y: 48,
          },
          buzzerState: {
            opcode: buzzerOpcode, next: null, parent: 'buzzerInit',
            inputs: {}, fields: {}, shadow: false, topLevel: false,
          },
          penClear: {
            opcode: 'pen_clear', next: null, parent: null,
            inputs: {}, fields: {}, shadow: false, topLevel: true, x: 240, y: 48,
          },
        },
      }],
    };
    return zip([
      ['project.json', JSON.stringify(project)],
      ['blue.svg', costume],
      ['click.wav', sound],
    ]);
  }

  const changedCostume = Buffer.from(COSTUME.toString('utf8').replace('#0071eb', '#ff8800'));
  const changedSound = Buffer.from(SOUND);
  changedSound[changedSound.length - 1] = 0x90;
  const original = await extensionArchive('13', 'activeBuzzer_on', COSTUME, SOUND);
  const replacement = await extensionArchive('14', 'activeBuzzer_off', changedCostume, changedSound);

  // Unknown ordinary/module IDs are valid archive state, independent of the site's catalog.
  const saved = await expectProject(await create(request, original, 'Aijite 多模块项目'), 201, 1);
  const path = `/projects/${saved.id}`;
  assert.equal(saved.sizeBytes, original.length);
  assert.deepEqual(await expectProject(await request(path), 200, 1), saved);
  await expectArchive(request, path, original, 1, '"1"');

  const updated = await expectProject(await replace(request, path, replacement, '"1"', OB_TYPE), 200, 2);
  assert.equal(updated.id, saved.id);
  assert.equal(updated.name, saved.name);
  assert.equal(updated.createdAt, saved.createdAt);
  assert.ok(updated.updatedAt > saved.updatedAt);
  assert.equal(updated.sizeBytes, replacement.length);
  assert.deepEqual(await expectProject(await request(path), 200, 2), updated);
  await expectArchive(request, path, replacement, 2, '"2"');

  await restart();
  assert.deepEqual(await expectProject(await request(path), 200, 2), updated);
  await expectArchive(request, path, replacement, 2, '"2"');
});

test('only one concurrent save can commit from a shared revision', async (t) => {
  const { request } = await fixture(t);
  const [original, first, second] = await Promise.all([
    exampleArchive(), exampleArchive('first'), exampleArchive('second'),
  ]);
  const saved = await expectProject(await create(request, original), 201, 1);
  const path = `/projects/${saved.id}`;
  const responses = await Promise.all([replace(request, path, first, '"1"'), replace(request, path, second, '"1"')]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 412]);
  const winner = responses.findIndex(({ status }) => status === 200);
  await expectProject(responses[winner], 200, 2);
  const conflict = await expectError(responses[1 - winner], 412, 'REVISION_CONFLICT');
  assert.deepEqual(conflict.details, { currentRevision: 2 });
  await expectArchive(request, path, [first, second][winner], 2, '"2"');
});

test('returns JSON validation errors and preserves the current archive', async (t) => {
  const { request } = await fixture(t);
  const original = await exampleArchive();
  const saved = await expectProject(await create(request, original), 201, 1);
  const path = `/projects/${saved.id}`;
  const missingAsset = await zip([['project.json', JSON.stringify(PROJECT)], ['blue.svg', COSTUME]]);
  const nestedProject = await zip([['nested/project.json', JSON.stringify(PROJECT)]]);
  const malformedProject = await zip([['project.json', '{ invalid']]);
  const damagedAsset = await zip([
    ['project.json', JSON.stringify(PROJECT)],
    ['blue.svg', COSTUME, { compress: false }],
    ['click.wav', SOUND],
  ]);
  const assetOffset = damagedAsset.indexOf(COSTUME);
  assert.ok(assetOffset >= 0);
  damagedAsset[assetOffset] ^= 1;

  for (const archive of [missingAsset, nestedProject, malformedProject, damagedAsset, Buffer.from('not a ZIP')]) {
    await expectError(await replace(request, path, archive, '"1"'), 422, 'INVALID_PROJECT');
  }
  await expectError(await create(request, missingAsset), 422, 'INVALID_PROJECT');
  await expectError(await create(request, original, ' '), 400, 'VALIDATION_ERROR');
  await expectError(await request('/projects', { method: 'POST', body: 'not multipart' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  await expectError(await request('/projects', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'no boundary' }), 400, 'VALIDATION_ERROR');
  await expectError(await replace(request, path, original, '"1"', 'text/plain'), 415, 'UNSUPPORTED_MEDIA_TYPE');
  await expectError(await request('/projects/../not-a-project'), 404, 'NOT_FOUND');
  await expectError(await request('/projects/not-a-uuid'), 400, 'VALIDATION_ERROR');
  await expectError(await request(`/projects/${randomUUID()}`), 404, 'PROJECT_NOT_FOUND');

  for (const method of ['PATCH', 'PUT', 'DELETE']) {
    await expectError(await request(method === 'PUT' ? `${path}/content` : path, { method }), 428, 'PRECONDITION_REQUIRED');
  }
  for (const invalid of ['1', '"01"', 'W/"1"', '*', '"1", "2"', '"9007199254740992"']) {
    await expectError(await request(path, { method: 'DELETE', headers: { 'If-Match': invalid } }), 400, 'VALIDATION_ERROR');
  }
  await expectError(await request(path, { method: 'DELETE', headers: { 'If-Match': '"2"' } }), 412, 'REVISION_CONFLICT');
  for (const body of ['{"name":', '{"name":99}', '{"name":"abc","revision":1}', JSON.stringify({ name: '界'.repeat(101) })]) {
    await expectError(await request(path, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' }, body,
    }), 400, 'VALIDATION_ERROR');
  }
  assert.deepEqual(await (await request('/projects')).json(), { items: [saved] });
  await expectArchive(request, path, original, 1, '"1"');
});

test('enforces compressed and expanded limits for upload and project.json', async (t) => {
  const { request } = await fixture(t);
  const original = await exampleArchive();
  const saved = await expectProject(await create(request, original), 201, 1);
  const path = `/projects/${saved.id}`;
  const oversized = Buffer.alloc(ARCHIVE_LIMIT + 1);
  await expectError(await create(request, oversized), 413, 'PAYLOAD_TOO_LARGE');
  await expectError(await replace(request, path, oversized, '"1"'), 413, 'PAYLOAD_TOO_LARGE');

  const withPadding = (length) => zip([
    ['project.json', JSON.stringify({ targets: [] })],
    ['padding.bin', Buffer.alloc(length), { compress: false }],
  ]);
  const maxArchive = await withPadding(ARCHIVE_LIMIT - (await withPadding(0)).length);
  assert.equal(maxArchive.length, ARCHIVE_LIMIT);
  const atLimit = await expectProject(await create(request, maxArchive), 201, 1);
  assert.equal(atLimit.sizeBytes, ARCHIVE_LIMIT);

  const oversizedJson = await zip([['project.json', Buffer.alloc(5 * 1024 ** 2 + 1, 32)]]);
  await expectError(await create(request, oversizedJson), 413, 'PAYLOAD_TOO_LARGE');

  function* repeatedBytes() {
    const block = Buffer.alloc(1024 ** 2);
    for (let i = 0; i < 100; i++) yield block;
  }
  const oversizedExpanded = await zip([
    ['project.json', JSON.stringify({ targets: [] })],
    ['large.bin', Readable.from(repeatedBytes())],
  ]);
  assert.ok(oversizedExpanded.length < ARCHIVE_LIMIT);
  await expectError(await replace(request, path, oversizedExpanded, '"1"'), 413, 'PAYLOAD_TOO_LARGE');
  await expectArchive(request, path, original, 1);
});

test('retains the original archive and revision when the metadata commit fails', async (t) => {
  const { request, dataDir } = await fixture(t);
  const original = await exampleArchive();
  const saved = await expectProject(await create(request, original), 201, 1);
  const path = `/projects/${saved.id}`;
  const originalRename = fsPromises.rename;
  const mocked = t.mock.method(fsPromises, 'rename', async (source, destination) => {
    if (basename(destination) === 'metadata.json') throw Object.assign(new Error('simulated write failure'), { code: 'EACCES' });
    await originalRename(source, destination);
  });
  await expectError(await replace(request, path, await exampleArchive('failed'), '"1"'), 500, 'STORAGE_ERROR');
  mocked.mock.restore();
  await expectArchive(request, path, original, 1, '"1"');
  assert.deepEqual(await expectProject(await request(path), 200, 1), saved);
  const files = await readdir(join(dataDir, 'projects', saved.id));
  assert.equal(files.length, 2);
  assert.equal(files.filter((name) => name.endsWith('.ob')).length, 1);
});
