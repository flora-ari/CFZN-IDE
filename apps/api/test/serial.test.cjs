const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { mkdtemp, mkdir, realpath, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { SerialPortMock } = require('serialport');
const { createHardwareApp } = require('../dist/hardware/app.js');
const { SERIAL_MANAGER } = require('../dist/hardware/serial-controller.js');
const { PROFILES } = require('../dist/hardware/config.js');
const { toolIdentity } = require('../dist/hardware/toolchain.js');
const { ApiError } = require('../dist/common/api-error.js');

Logger.overrideLogger(false);
const origin = 'https://ide.example.test';
const otherOrigin = 'https://other.example.test';
const opts = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
const ports = [
  { portId: 'MOCK_A', displayName: 'Fixture A', usbVendorId: '10C4', usbProductId: 'EA60', identity: 'fixture-a' },
  { portId: 'MOCK_B', displayName: 'Fixture B', usbVendorId: '10C4', usbProductId: 'EA60', identity: 'fixture-b' },
];
const buildBody = { deviceId: 'arduinoEsp32', profileId: 'esp32-4mb-dio', code: 'void setup(){} void loop(){}' };
const ok = (stdout = '') => ({ stdout, stderr: '', code: 0, signal: null, cancelled: false, timedOut: false });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

class FakePort extends EventEmitter {
  isOpen = false;
  written = [];
  closeFails = false;
  openGate = undefined;
  writeGate = undefined;
  drainGate = undefined;
  closeGate = undefined;
  openError = undefined;
  open(callback) {
    Promise.resolve(this.openGate).then(() => {
      if (this.openError) return callback(this.openError);
      this.isOpen = true;
      callback();
    });
  }
  close(callback) {
    Promise.resolve(this.closeGate).then(() => {
      if (this.closeFails) return callback(new Error('fixture close failure'));
      this.isOpen = false;
      this.emit('close');
      callback();
    });
  }
  write(bytes, callback) {
    this.written.push(Buffer.from(bytes));
    Promise.resolve(this.writeGate).then(() => callback());
    return false;
  }
  drain(callback) { Promise.resolve(this.drainGate).then(() => callback()); }
}

async function fixture(t, options = {}) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, 'cfzn-serial-'));
  const state = { ports: structuredClone(ports), handles: [], calls: [], enumeration: undefined, runner: undefined, now: 1000 };
  const driver = options.driver === null ? null : options.driver ?? {
    list: async () => state.ports,
    create(path, serialOptions) {
      const handle = new FakePort();
      state.handles.push(handle);
      handle.path = path;
      handle.options = serialOptions;
      options.configureHandle?.(handle);
      return handle;
    },
  };
  const core = join(root, 'core');
  await mkdir(core);
  await writeFile(join(core, 'boards.txt'), 'esp32.name=Fixture ESP32\n');
  await writeFile(join(core, 'platform.txt'), 'name=fixture\n');
  const view = { ...PROFILES.find(profile => profile.id === buildBody.profileId), compileAvailable: true, uploadAvailable: true, realtimeAvailable: false };
  const profile = { view, binding: { toolchain: 'fixture', coreVersion: '1.0.6', libraries: [] },
    cliPath: process.execPath, configPath: join(root, 'cli.json'), platformPath: core, cliVersion: 'test', env: process.env };
  profile.identity = await toolIdentity(profile);
  const app = await createHardwareApp({ runtimeDir: root, profiles: {}, toolchains: {}, allowedOrigins: [origin, otherOrigin] }, {
    serialDriver: driver,
    serialOptions: { clock: () => state.now, ioTimeoutMs: options.ioTimeoutMs ?? 2000 },
    ports: async () => {
      if (state.enumeration) await state.enumeration.promise;
      if (state.enumerationError) throw state.enumerationError;
      return state.ports;
    },
    discovered: { views: [view], ready: new Map([[view.id, profile]]), cliVersion: 'test' },
    runner: async command => {
      state.calls.push(command);
      if (state.runner) return state.runner(command);
      if (command.args[0] === 'compile') {
        const path = command.args[command.args.indexOf('--build-path') + 1];
        for (const suffix of ['bin', 'partitions.bin', 'elf']) await writeFile(join(path, `sketch.ino.${suffix}`), suffix);
      }
      return ok('Hash of data verified.');
    },
  });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1/hardware`;
  async function send(path, { method = 'GET', body, token, from = origin, signal, headers = {} } = {}) {
    return fetch(base + path, { method, signal, headers: {
      ...(from ? { Origin: from } : {}), ...(token ? { 'X-CCraft-Serial-Token': token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  async function client(from = origin) {
    const { clientToken, instanceId } = await result(await send('/serial/clients', { method: 'POST', body: {}, from }), 201);
    return { token: clientToken, instanceId,
      send: (path, options = {}) => send(path, { ...options, from, token: clientToken }),
    };
  }
  t.after(async () => {
    for (const handle of state.handles) { handle.closeFails = false; handle.closeGate = undefined; }
    await app.close();
    assert.equal(dirname(await realpath(root)), parent);
    await rm(root, { recursive: true, force: true });
  });
  return { root, state, send, client, app, manager: app.get(SERIAL_MANAGER) };
}
async function result(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return body;
}
async function rejected(response, status, code) { assert.equal((await result(response, status)).error.code, code); }
async function devices(client) { return (await result(await client.send('/serial/devices'))).items; }
async function open(client, device, options = opts, requestId = randomUUID()) {
  return result(await client.send('/serial/sessions', { method: 'POST', body: { requestId, deviceRef: device.deviceRef, options } }), 201);
}
const close = (client, id) => client.send(`/serial/sessions/${id}/close`, { method: 'POST', body: {} });
const read = (client, id, after = 0, waitMs = 0, extra = {}) => client.send(`/serial/sessions/${id}/read?after=${after}&waitMs=${waitMs}`, extra);
const write = (client, id, sequence, bytes) => client.send(`/serial/sessions/${id}/write`, {
  method: 'POST', body: { sequence, dataBase64: Buffer.from(bytes).toString('base64') },
});
async function waitJob(send, id) {
  for (let i = 0; i < 300; i++) {
    const body = await result(await send(`/jobs/${id}`));
    if (body.job.stage === 'complete') return body.job;
    await nextTurn();
  }
  throw new Error('Fixture CLI did not finish');
}
async function build(send) {
  const { job } = await result(await send('/builds', { method: 'POST', body: buildBody }), 202);
  assert.equal((await waitJob(send, job.id)).state, 'succeeded');
  return job.id;
}

test('official MockBinding exchanges exact HTTP bytes with retryable RX cursors and drained TX deduplication', async t => {
  SerialPortMock.binding.reset();
  for (const port of ports) SerialPortMock.binding.createPort(port.portId, { record: true, echo: true, readyData: Buffer.from([0, 255, 195, 169]) });
  const handles = [];
  const driver = { list: async () => ports,
    create(path, options) {
      const handle = new SerialPortMock({ path, ...options, autoOpen: false });
      handles.push(handle);
      return handle;
    } };
  const f = await fixture(t, { driver });
  const client = await f.client();
  const listed = await devices(client);
  const { session } = await open(client, listed[0]);
  const first = await result(await read(client, session.id, 0, 100));
  assert.deepEqual(Buffer.from(first.dataBase64, 'base64'), Buffer.from([0, 255, 195, 169]));
  assert.equal(first.from, 0);
  const retry = await result(await read(client, session.id));
  assert.equal(retry.dataBase64, first.dataBase64);
  const bytes = Buffer.from([65, 0, 255, 13, 10]);
  const responses = await Promise.all([write(client, session.id, 1, bytes), write(client, session.id, 1, bytes)]);
  for (const response of responses) assert.deepEqual(await result(response), { sequence: 1, sizeBytes: bytes.length });
  assert.deepEqual(handles[0].port.recording, bytes);
  const echo = await result(await read(client, session.id, first.next, 100));
  assert.deepEqual(Buffer.from(echo.dataBase64, 'base64'), bytes);
  const quiet = await result(await read(client, session.id, echo.next, 5));
  assert.equal(quiet.next, echo.next);
  assert.equal(quiet.dataBase64, '');
  const status = await result(await client.send(`/serial/sessions/${session.id}`));
  assert.equal(status.session.nextWriteSequence, 2);
  assert.equal(status.pendingWriteSequence, undefined);
  assert.equal((await result(await close(client, session.id))).session.held, false);
  assert.equal((await result(await close(client, session.id))).session.state, 'closed');
});

test('binds clients to Origin and instance, keeps other sessions private and allows different ports', async t => {
  const f = await fixture(t);
  const a = await f.client();
  const b = await f.client();
  const list = await devices(a);
  assert.notEqual(list[0].deviceRef, list[1].deviceRef);
  assert.equal(f.state.handles.length, 0);
  const { session: first } = await open(a, list[0]);
  const { session: second } = await open(b, list[1], { ...opts, baudRate: 9600 });
  assert.equal(f.state.handles[1].options.baudRate, 9600);
  const listed = await devices(b);
  assert.equal(listed[0].ownership, 'other-client');
  assert.equal(listed[0].session, undefined);
  assert.equal(listed[1].session.id, second.id);
  await rejected(await b.send(`/serial/sessions/${first.id}`), 404, 'SERIAL_SESSION_NOT_FOUND');
  await rejected(await write(b, first.id, 1, 'bad'), 404, 'SERIAL_SESSION_NOT_FOUND');
  await rejected(await close(b, first.id), 404, 'SERIAL_SESSION_NOT_FOUND');
  await rejected(await openResponse(a, list[1]), 409, 'SERIAL_SESSION_STATE');
  const c = await f.client();
  await rejected(await openResponse(c, list[0]), 409, 'SERIAL_PORT_BUSY');
  await rejected(await f.send('/serial/devices', { token: a.token, from: otherOrigin }), 401, 'SERIAL_CLIENT_REQUIRED');
  await rejected(await f.send('/serial/devices'), 401, 'SERIAL_CLIENT_REQUIRED');
  await rejected(await f.send('/serial/devices', { token: 'f'.repeat(64) }), 401, 'SERIAL_CLIENT_REQUIRED');
  await rejected(await f.send('/serial/clients', { method: 'POST', body: {}, from: null }), 403, 'SERIAL_ORIGIN_FORBIDDEN');
  await rejected(await f.send('/serial/clients', { method: 'POST', body: {}, from: 'https://bad.example' }), 403, 'SERIAL_ORIGIN_FORBIDDEN');
  await rejected(await f.send('/SERIAL/clients', { method: 'POST', body: {}, from: null }), 403, 'SERIAL_ORIGIN_FORBIDDEN');
  await rejected(await f.send('/SERIAL/devices'), 401, 'SERIAL_CLIENT_REQUIRED');
  await result(await f.send('/SERIAL/clients/', { method: 'POST', body: {} }), 201);
  const cors = await f.send('/serial/devices', { method: 'OPTIONS', token: a.token });
  assert.equal(cors.status, 204);
  assert.equal(cors.headers.get('access-control-allow-origin'), origin);
  assert.match(cors.headers.get('access-control-allow-headers'), /X-CCraft-Serial-Token/i);
  assert.equal((await result(await f.send('/capabilities', { from: null }))).protocolVersion, 1);
});
const openResponse = (client, device, requestId = randomUUID(), options = opts) => client.send('/serial/sessions', {
  method: 'POST', body: { requestId, deviceRef: device.deviceRef, options },
});

test('open request retries share pending and terminal results and stale device generations cannot reopen paths', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const [device] = await devices(client);
  const requestId = randomUUID();
  const gate = deferred();
  f.state.enumeration = gate;
  const first = openResponse(client, device, requestId);
  const second = openResponse(client, device, requestId);
  await nextTurn();
  gate.resolve();
  const a = await result(await first, 201);
  const b = await result(await second, 201);
  assert.equal(a.session.id, b.session.id);
  assert.equal(f.state.handles.length, 1);
  await rejected(await openResponse(client, device, requestId, { ...opts, baudRate: 9600 }), 409, 'SERIAL_SEQUENCE_CONFLICT');
  await result(await close(client, a.session.id));
  const retry = await result(await openResponse(client, device, requestId), 201);
  assert.equal(retry.session.held, false);
  assert.equal(f.state.handles.length, 1);
  f.state.ports = [];
  await devices(client);
  f.state.ports = structuredClone(ports);
  const replacement = (await devices(client))[0];
  assert.notEqual(replacement.deviceRef, device.deviceRef);
  await rejected(await openResponse(client, device), 409, 'PORT_STALE');
  await open(client, replacement);
  assert.equal(f.state.handles.length, 2);
});

test('serial validation limits canonical bytes, request bodies, options and query values', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const [device] = await devices(client);
  for (const options of [{ ...opts, baudRate: 0 }, { ...opts, dataBits: 9 }, { ...opts, flowControl: 'software' }, { ...opts, extra: 1 }]) {
    await rejected(await openResponse(client, device, randomUUID(), options), 400, 'VALIDATION_ERROR');
  }
  const { session } = await open(client, device);
  for (const dataBase64 of ['Zg', '!!!', 'Zh==', 'YQ==\n', null]) {
    await rejected(await client.send(`/serial/sessions/${session.id}/write`, { method: 'POST', body: { sequence: 1, dataBase64 } }), 400, 'VALIDATION_ERROR');
  }
  await rejected(await write(client, session.id, 1, Buffer.alloc(65537)), 413, 'PAYLOAD_TOO_LARGE');
  await rejected(await client.send(`/serial/sessions/${session.id}/read?after=01&waitMs=0`), 400, 'VALIDATION_ERROR');
  await rejected(await read(client, session.id, 0, 15001), 400, 'VALIDATION_ERROR');
  await rejected(await client.send(`/serial/sessions/${session.id}/read?after=0&waitMs=0&extra=1`), 400, 'VALIDATION_ERROR');
  await rejected(await client.send('/serial/clients', { method: 'POST', body: { padding: 'x'.repeat(97 * 1024) } }), 413, 'PAYLOAD_TOO_LARGE');
  await rejected(await f.send('/SERIAL/clients', { method: 'POST', body: { padding: 'x'.repeat(97 * 1024) } }), 413, 'PAYLOAD_TOO_LARGE');
  assert.equal(f.state.handles[0].written.length, 0);
});

test('failed opens expose current ownership on same-ID retries after a lost error response', async t => {
  const f = await fixture(t, { configureHandle: handle => { handle.openError = new Error('fixture access denied'); } });
  const client = await f.client();
  const device = (await devices(client))[0];
  const requestId = randomUUID();
  // The first error response is discarded as if its body never reached the editor.
  const lost = await openResponse(client, device, requestId);
  assert.equal(lost.status, 503);
  await lost.arrayBuffer();
  const { error } = await result(await openResponse(client, device, requestId), 503);
  assert.equal(error.code, 'SERIAL_IO_ERROR');
  assert.match(error.message, /fixture access denied/);
  assert.equal(error.details.session.held, false);
  assert.equal(f.state.handles.length, 1);
  await result(await close(client, error.details.session.id));
  const conflict = await result(await openResponse(client, device, requestId, { ...opts, baudRate: 9600 }), 409);
  assert.equal(conflict.error.details.session.id, error.details.session.id);
  assert.equal(conflict.error.details.session.held, false);
});

test('unknown open responses and late driver completion keep a queryable held session until close succeeds', async t => {
  const opening = deferred();
  const f = await fixture(t, { ioTimeoutMs: 150, configureHandle: handle => { handle.openGate = opening.promise; handle.closeFails = true; } });
  const client = await f.client();
  const other = await f.client();
  const device = (await devices(client))[0];
  const requestId = randomUUID();
  const initial = await result(await openResponse(client, device, requestId), 504);
  const id = initial.error.details.session.id;
  assert.equal(initial.error.details.session.held, true);
  opening.resolve();
  for (let i = 0; i < 20; i++) await nextTurn();
  const retried = await result(await openResponse(client, device, requestId), 504);
  assert.equal(retried.error.details.session.id, id);
  assert.equal(retried.error.details.session.held, true);
  assert.equal(f.state.handles.length, 1);
  f.state.now += 120001;
  f.manager.sweep();
  assert.equal((await result(await openResponse(client, device, requestId), 504)).error.details.session.id, id);
  await rejected(await close(client, id), 503, 'SERIAL_IO_ERROR');
  const occupied = await result(await openResponse(other, device), 409);
  assert.equal(occupied.error.details.session, null);
  f.state.handles[0].closeFails = false;
  await result(await close(client, id));
  const released = await result(await openResponse(client, device, requestId), 504);
  assert.equal(released.error.details.session.id, id);
  assert.equal(released.error.details.session.held, false);
  assert.equal(f.state.handles.length, 1);
});

test('an aborted open response can be recovered without a second driver open and precondition failures confirm null', async t => {
  const gate = deferred();
  const f = await fixture(t, { configureHandle: handle => { handle.openGate = gate.promise; } });
  const client = await f.client();
  const device = (await devices(client))[0];
  const requestId = randomUUID();
  const abort = new AbortController();
  const lost = client.send('/serial/sessions', { method: 'POST', signal: abort.signal,
    body: { requestId, deviceRef: device.deviceRef, options: opts } });
  while (!f.state.handles.length) await nextTurn();
  abort.abort();
  await assert.rejects(lost, /abort/i);
  gate.resolve();
  const recovered = await result(await openResponse(client, device, requestId), 201);
  assert.equal(recovered.session.state, 'open');
  assert.equal(f.state.handles.length, 1);
  const held = await result(await openResponse(client, device, requestId, { ...opts, baudRate: 9600 }), 409);
  assert.equal(held.error.details.session.id, recovered.session.id);
  assert.equal(held.error.details.session.held, true);
  await result(await close(client, recovered.session.id));
  const stale = await result(await openResponse(client, { deviceRef: randomUUID() }), 409);
  assert.equal(stale.error.code, 'PORT_STALE');
  assert.equal(stale.error.details.session, null);
});

test('unplug, enumeration failures and transport restart invalidate only the affected references and tokens', async t => {
  const f = await fixture(t);
  const a = await f.client();
  const b = await f.client();
  const list = await devices(a);
  const first = (await open(a, list[0])).session;
  const second = (await open(b, list[1])).session;
  const pending = read(a, first.id, 0, 15000);
  for (let i = 0; i < 10; i++) await nextTurn();
  f.state.handles[0].isOpen = false;
  f.state.handles[0].emit('close', new Error('fixture USB disconnected'));
  await rejected(await pending, 503, 'SERIAL_IO_ERROR');
  const disconnected = (await result(await a.send(`/serial/sessions/${first.id}`))).session;
  assert.equal(disconnected.state, 'disconnected');
  assert.equal(disconnected.held, false);
  assert.equal((await result(await b.send(`/serial/sessions/${second.id}`))).session.state, 'open');
  await rejected(await openResponse(a, list[0]), 409, 'PORT_STALE');
  const fresh = (await devices(a))[0];
  assert.notEqual(fresh.deviceRef, list[0].deviceRef);
  f.state.enumerationError = new Error('fixture enumeration unavailable');
  await rejected(await a.send('/serial/devices'), 503, 'SERIAL_IO_ERROR');
  await rejected(await f.send('/ports'), 503, 'SERIAL_IO_ERROR');
  f.state.enumerationError = new ApiError(503, 'TOOLCHAIN_UNAVAILABLE', 'fixture legacy enumeration failure');
  await rejected(await f.send('/ports'), 503, 'TOOLCHAIN_UNAVAILABLE');
  await rejected(await a.send('/serial/devices'), 503, 'SERIAL_IO_ERROR');
  f.state.enumerationError = undefined;
  assert.equal((await devices(a))[0].deviceRef, fresh.deviceRef);
  const restarted = await fixture(t);
  assert.notEqual((await result(await restarted.send('/capabilities'))).serial.instanceId, a.instanceId);
  await rejected(await restarted.send('/serial/devices', { token: a.token }), 401, 'SERIAL_CLIENT_REQUIRED');
  const after = await restarted.client();
  await devices(after);
  const stale = await result(await openResponse(after, list[0]), 409);
  assert.equal(stale.error.code, 'PORT_STALE');
  assert.equal(stale.error.details.session, null);
});

test('RX replays 64 KiB chunks, rejects invalid cursors and closes overflowing streams', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const [device] = await devices(client);
  let { session } = await open(client, device);
  f.state.handles[0].emit('data', Buffer.alloc(70000, 123));
  const first = await result(await read(client, session.id));
  assert.equal(Buffer.from(first.dataBase64, 'base64').length, 65536);
  const second = await result(await read(client, session.id, first.next));
  assert.equal(Buffer.from(second.dataBase64, 'base64').length, 4464);
  await rejected(await read(client, session.id, 0), 409, 'SERIAL_CURSOR_INVALID');
  await nextTurn();
  assert.equal((await result(await client.send(`/serial/sessions/${session.id}`))).session.held, false);
  ({ session } = await open(client, device));
  f.state.handles[1].emit('data', Buffer.alloc(1048577));
  await rejected(await read(client, session.id), 413, 'PAYLOAD_TOO_LARGE');
  assert.equal((await result(await client.send(`/serial/sessions/${session.id}`))).session.held, false);
});

test('quiet reads renew the consumer lease and missing readers, interrupted reads and client TTL release sessions', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const [device] = await devices(client);
  let { session } = await open(client, device);
  f.state.now += 5001;
  f.manager.sweep();
  await nextTurn();
  assert.equal((await result(await client.send(`/serial/sessions/${session.id}`))).session.held, false);
  ({ session } = await open(client, device));
  for (let i = 0; i < 4; i++) {
    await result(await read(client, session.id, 0, 2));
    f.state.now += 40000;
    f.manager.sweep();
    assert.equal((await result(await client.send(`/serial/sessions/${session.id}`))).session.state, 'open');
  }
  f.state.now += 5001;
  f.manager.sweep();
  await nextTurn();
  assert.equal((await result(await client.send(`/serial/sessions/${session.id}`))).session.held, false);
  ({ session } = await open(client, device));
  const abort = new AbortController();
  const pending = read(client, session.id, 0, 15000, { signal: abort.signal });
  for (let i = 0; i < 10; i++) await nextTurn();
  await rejected(await read(client, session.id), 409, 'SERIAL_SESSION_STATE');
  abort.abort();
  await assert.rejects(pending, /abort/i);
  for (let i = 0; i < 30; i++) {
    const state = (await result(await client.send(`/serial/sessions/${session.id}`))).session;
    if (!state.held) break;
    await nextTurn();
  }
  assert.equal((await result(await client.send(`/serial/sessions/${session.id}`))).session.held, false);
  f.state.now += 120001;
  f.manager.sweep();
  await rejected(await client.send(`/serial/sessions/${session.id}`), 404, 'SERIAL_SESSION_NOT_FOUND');
  f.state.now += 1800001;
  f.manager.sweep();
  await rejected(await client.send('/serial/devices'), 401, 'SERIAL_CLIENT_REQUIRED');
});

test('write sequences are ordered, bounded, drained and retained for exactly the recent deduplication window', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const { session } = await open(client, (await devices(client))[0]);
  const handle = f.state.handles[0];
  const drain = deferred();
  handle.drainGate = drain.promise;
  const sent = write(client, session.id, 1, 'first');
  for (let i = 0; i < 15 && !handle.written.length; i++) await nextTurn();
  const status = await result(await client.send(`/serial/sessions/${session.id}`));
  assert.equal(status.pendingWriteSequence, 1);
  await rejected(await write(client, session.id, 1, 'different'), 409, 'SERIAL_SEQUENCE_CONFLICT');
  await rejected(await write(client, session.id, 3, 'skip'), 409, 'SERIAL_SEQUENCE_CONFLICT');
  drain.resolve();
  await result(await sent);
  for (let sequence = 2; sequence <= 65; sequence++) await result(await write(client, session.id, sequence, [sequence]));
  await rejected(await write(client, session.id, 1, 'first'), 409, 'SERIAL_SEQUENCE_CONFLICT');
  assert.equal(handle.written.length, 65);
  const queue = deferred();
  handle.drainGate = queue.promise;
  const pending = [];
  for (let sequence = 66; sequence <= 69; sequence++) {
    pending.push(write(client, session.id, sequence, Buffer.alloc(65536)));
    while ((await result(await client.send(`/serial/sessions/${session.id}`))).session.nextWriteSequence <= sequence) await nextTurn();
  }
  await rejected(await write(client, session.id, 70, [1]), 429, 'SERIAL_CAPACITY_EXCEEDED');
  queue.resolve();
  for (const response of await Promise.all(pending)) await result(response);
});

test('unconfirmed close and write timeout keep ownership until the driver confirms release', async t => {
  const f = await fixture(t, { ioTimeoutMs: 80 });
  const client = await f.client();
  const other = await f.client();
  const device = (await devices(client))[0];
  const { session } = await open(client, device);
  const handle = f.state.handles[0];
  handle.closeFails = true;
  await rejected(await close(client, session.id), 503, 'SERIAL_IO_ERROR');
  assert.equal((await result(await client.send(`/serial/sessions/${session.id}`))).session.held, true);
  await rejected(await openResponse(other, device), 409, 'SERIAL_PORT_BUSY');
  handle.closeFails = false;
  await result(await close(client, session.id));
  const next = (await open(client, device)).session;
  const second = f.state.handles[1];
  const blocked = deferred();
  second.drainGate = blocked.promise;
  second.closeFails = true;
  await rejected(await write(client, next.id, 1, 'maybe'), 504, 'SERIAL_IO_TIMEOUT');
  const status = await result(await client.send(`/serial/sessions/${next.id}`));
  assert.equal(status.session.held, true);
  assert.match(status.session.error.message, /ownership is retained/);
  assert.equal(second.written.length, 1);
  await rejected(await write(client, next.id, 1, 'maybe'), 504, 'SERIAL_IO_TIMEOUT');
  assert.equal(second.written.length, 1);
  second.closeFails = false;
  blocked.resolve();
  await result(await close(client, next.id));
});

test('compilation retains existing RX but excludes opens and TX, uploads respect locks through cancellation', async t => {
  const f = await fixture(t);
  const buildId = await build(f.send);
  const a = await f.client();
  const b = await f.client();
  const list = await devices(a);
  const { session } = await open(a, list[0]);
  await rejected(await f.send('/uploads', { method: 'POST', body: { buildId, portId: ports[0].portId } }), 409, 'SERIAL_PORT_BUSY');
  const running = deferred();
  f.state.runner = async command => { await running.promise; return { ...ok(), cancelled: command.signal.aborted }; };
  const compile = (await result(await f.send('/builds', { method: 'POST', body: buildBody }), 202)).job;
  f.state.handles[0].emit('data', Buffer.from('RX during compile'));
  assert.equal(Buffer.from((await result(await read(a, session.id))).dataBase64, 'base64').toString(), 'RX during compile');
  await rejected(await write(a, session.id, 1, 'blocked'), 409, 'HARDWARE_BUSY');
  await rejected(await openResponse(b, list[1]), 409, 'HARDWARE_BUSY');
  await result(await close(a, session.id));
  await result(await f.send(`/jobs/${compile.id}/cancel`, { method: 'POST', body: {} }));
  await rejected(await openResponse(b, list[1]), 409, 'HARDWARE_BUSY');
  running.resolve();
  assert.equal((await waitJob(f.send, compile.id)).state, 'cancelled');
  const uploadGate = deferred();
  f.state.runner = async command => { await uploadGate.promise; return { ...ok(), cancelled: command.signal.aborted }; };
  const upload = (await result(await f.send('/uploads', { method: 'POST', body: { buildId, portId: ports[0].portId } }), 202)).job;
  assert.equal((await devices(b))[0].ownership, 'uploading');
  await rejected(await openResponse(b, list[0]), 409, 'HARDWARE_BUSY');
  await result(await f.send(`/jobs/${upload.id}/cancel`, { method: 'POST', body: {} }));
  await rejected(await openResponse(b, list[0]), 409, 'HARDWARE_BUSY');
  uploadGate.resolve();
  assert.equal((await waitJob(f.send, upload.id)).state, 'cancelled');
  await open(b, list[0]);
});

test('asynchronous enumeration reserves hardware before open or upload and detects replacement identity', async t => {
  const f = await fixture(t);
  const buildId = await build(f.send);
  const client = await f.client();
  const device = (await devices(client))[0];
  const gate = deferred();
  f.state.enumeration = gate;
  const opening = openResponse(client, device);
  for (let i = 0; i < 10; i++) await nextTurn();
  await rejected(await f.send('/builds', { method: 'POST', body: buildBody }), 409, 'HARDWARE_BUSY');
  await rejected(await f.send('/uploads', { method: 'POST', body: { buildId, portId: ports[0].portId } }), 409, 'HARDWARE_BUSY');
  f.state.ports[0].identity = 'different-physical-device';
  gate.resolve();
  await rejected(await opening, 409, 'PORT_STALE');
  assert.equal(f.state.handles.length, 0);
  const fresh = (await devices(client))[0];
  assert.notEqual(fresh.deviceRef, device.deviceRef);
  const uploadGate = deferred();
  f.state.enumeration = uploadGate;
  const uploading = f.send('/uploads', { method: 'POST', body: { buildId, portId: ports[0].portId } });
  for (let i = 0; i < 10; i++) await nextTurn();
  await rejected(await openResponse(client, fresh), 409, 'HARDWARE_BUSY');
  uploadGate.resolve();
  assert.equal((await waitJob(f.send, (await result(await uploading, 202)).job.id)).state, 'succeeded');
});

test('closing an opening reservation prevents a late native open after enumeration or driver completion', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const device = (await devices(client))[0];
  const enumeration = deferred();
  f.state.enumeration = enumeration;
  const pending = openResponse(client, device);
  let current;
  while (!(current = f.manager.client(origin, client.token).current)) await nextTurn();
  await result(await close(client, current.view.id));
  enumeration.resolve();
  const stopped = await result(await pending, 409);
  assert.equal(stopped.error.details.session.held, false);
  assert.equal(f.state.handles.length, 0);
  const opening = deferred();
  const g = await fixture(t, { configureHandle: handle => { handle.openGate = opening.promise; } });
  const second = await g.client();
  const port = (await devices(second))[0];
  const starting = openResponse(second, port);
  while (!g.state.handles.length) await nextTurn();
  const session = (await devices(second))[0].session;
  const closing = close(second, session.id);
  for (let i = 0; i < 10; i++) await nextTurn();
  await rejected(await g.send('/builds', { method: 'POST', body: buildBody }), 409, 'HARDWARE_BUSY');
  opening.resolve();
  assert.equal((await result(await starting, 409)).error.details.session.id, session.id);
  assert.equal((await result(await closing)).session.held, false);
  assert.equal(g.state.handles[0].isOpen, false);
});

test('unavailable serial bindings preserve legacy ports and compiler capability', async t => {
  const f = await fixture(t, { driver: null });
  const capability = await result(await f.send('/capabilities'));
  assert.equal(capability.serial.available, false);
  assert.equal(capability.serial.version, 1);
  assert.equal(capability.profiles[0].compileAvailable, true);
  assert.deepEqual((await result(await f.send('/ports'))).items, ports.map(({ identity, ...port }) => port));
  const client = await f.client();
  await rejected(await openResponse(client, (await devices(client))[0]), 503, 'SERIAL_UNAVAILABLE');
  await build(f.send);
});

test('late events from a released native handle cannot invalidate a later connection on the same port', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const device = (await devices(client))[0];
  const first = (await open(client, device)).session;
  const oldHandle = f.state.handles[0];
  await result(await close(client, first.id));
  const second = (await open(client, device)).session;
  oldHandle.emit('error', Object.assign(new Error('old disconnected callback'), { disconnected: true }));
  oldHandle.emit('close', Object.assign(new Error('old close callback'), { disconnected: true }));
  assert.equal((await devices(client))[0].deviceRef, device.deviceRef);
  assert.equal((await result(await client.send(`/serial/sessions/${second.id}`))).session.state, 'open');
  assert.equal((await result(await client.send(`/serial/sessions/${first.id}`))).session.state, 'closed');
  f.state.handles[1].emit('data', Buffer.from('new handle'));
  assert.equal(Buffer.from((await result(await read(client, second.id))).dataBase64, 'base64').toString(), 'new handle');
});

test('active capacity counts held sessions and allows more than sixteen sequential reconnects', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const device = (await devices(client))[0];
  for (let i = 0; i < 20; i++) {
    const { session } = await open(client, device);
    assert.equal((await result(await close(client, session.id))).session.held, false);
  }
  f.state.ports = Array.from({ length: 17 }, (_, i) => ({ portId: `MOCK_${i}`, displayName: `Mock ${i}`, identity: String(i) }));
  const list = await devices(client);
  for (let i = 0; i < 16; i++) await open(await f.client(), list[i]);
  await rejected(await openResponse(await f.client(), list[16]), 429, 'SERIAL_CAPACITY_EXCEEDED');
});

test('client and request history limits expire independently of active-session capacity', async t => {
  const f = await fixture(t);
  const clients = [];
  for (let i = 0; i < 64; i++) clients.push(await f.client());
  await rejected(await f.send('/serial/clients', { method: 'POST', body: {} }), 429, 'SERIAL_CAPACITY_EXCEEDED');
  const client = clients[0];
  for (let i = 0; i < 64; i++) await rejected(await openResponse(client, { deviceRef: randomUUID() }), 409, 'PORT_STALE');
  const device = (await devices(client))[0];
  await rejected(await openResponse(client, device), 429, 'SERIAL_CAPACITY_EXCEEDED');
  f.state.now += 120001;
  f.manager.sweep();
  const { session } = await open(client, device);
  await result(await close(client, session.id));
  f.state.now += 1800001;
  f.manager.sweep();
  await f.client();
});

test('closing during a pending TX stops further writes and reports that bytes may have been sent', async t => {
  const f = await fixture(t);
  const client = await f.client();
  const { session } = await open(client, (await devices(client))[0]);
  const handle = f.state.handles[0];
  const gate = deferred();
  handle.drainGate = gate.promise;
  const tx = write(client, session.id, 1, 'in flight');
  while (!handle.written.length) await nextTurn();
  await rejected(await f.send('/builds', { method: 'POST', body: buildBody }), 409, 'HARDWARE_BUSY');
  const closing = close(client, session.id);
  const { error } = await result(await tx, 409);
  assert.match(error.message, /may already have been sent/);
  await result(await closing);
  gate.resolve();
  await rejected(await write(client, session.id, 2, 'later'), 409, 'SERIAL_SESSION_STATE');
  assert.equal(handle.written.length, 1);
});

test('shutdown waits for an asynchronous upload reservation and never launches a late uploader', async t => {
  const f = await fixture(t);
  const buildId = await build(f.send);
  const gate = deferred();
  f.state.enumeration = gate;
  const upload = f.send('/uploads', { method: 'POST', body: { buildId, portId: ports[0].portId } });
  for (let i = 0; i < 15; i++) await nextTurn();
  const stopping = f.app.close();
  await nextTurn();
  gate.resolve();
  await rejected(await upload, 409, 'HARDWARE_BUSY');
  await stopping;
  assert.equal(f.state.calls.length, 1);
});
