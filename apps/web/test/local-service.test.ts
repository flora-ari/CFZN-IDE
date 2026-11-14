import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareController } from '../src/hardware-controller.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import type { HardwareCapabilities, HardwareJob } from '../src/hardware-types.ts';
import type { HardwareSource } from '../src/hardware-controller.ts';

const base = 'http://mock/api/v1/hardware/';
const source = (): HardwareSource => ({ deviceId: 'arduinoEsp32', code: 'void setup(){}', documentId: 7, editVersion: 11, moduleIds: [], realtime: false });
const capability = (): HardwareCapabilities => ({ protocolVersion: 1, executionHost: 'local',
  profiles: [{ id: 'esp32', deviceId: 'arduinoEsp32', label: 'ESP32', chip: 'esp32', fqbn: 'esp32:esp32:esp32', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false }],
  toolchain: { cliVersion: '1', description: 'mock local compiler' } });
const ports = { items: [{ portId: 'COM-MOCK', displayName: 'Mock OS serial' }] };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
function fixture(request: typeof fetch, session = new HardwareSession()) {
  const current = source();
  const hardware = new HardwareController(session, () => current, base, () => {}, request, async () => {});
  return { hardware, current, session };
}
const path = (url: RequestInfo | URL) => new URL(String(url)).pathname;
async function until(condition: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'expected controller transition did not finish');
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('local service starts unknown, publishes checking, and only performs a bounded GET against its configured address', async () => {
  const pending = deferred<Response>(), calls: { url: string; init?: RequestInit }[] = [];
  const { hardware, current } = fixture(async (url, init) => { calls.push({ url: String(url), init }); return pending.promise; });
  assert.equal(hardware.snapshot().localService.status, 'unknown');
  const before = structuredClone(current), states: string[] = [];
  hardware.subscribe(() => states.push(hardware.snapshot().localService.status));
  const checking = hardware.checkLocalService();
  assert.equal(hardware.snapshot().localService.status, 'checking');
  assert.equal(calls[0].url, `${base}capabilities`);
  assert.equal(calls[0].init?.method, 'GET');
  assert.equal(calls[0].init?.body, undefined);
  assert.ok(calls[0].init?.signal);
  pending.resolve(response(capability())); await checking;
  assert.deepEqual(states, ['checking', 'online']);
  assert.deepEqual(current, before);
  assert.equal(hardware.snapshot().localService.baseUrl, base);
  assert.equal(hardware.profileId, 'esp32');
  assert.equal(hardware.portId, '');
  const snapshot = hardware.snapshot(); snapshot.localService.status = 'offline';
  assert.equal(hardware.snapshot().localService.status, 'online', 'snapshot cannot mutate controller diagnostics');
});

test('missing compiler/core remains online and capabilities checks preserve explicit profile and OS port selections', async () => {
  let available = capability();
  const { hardware } = fixture(async url => response(path(url).endsWith('/ports') ? ports : available));
  await hardware.refresh(); hardware.configure('esp32', 'COM-MOCK');
  available = capability();
  available.profiles[0] = { ...available.profiles[0], compileAvailable: false, uploadAvailable: false, reason: '所需 core 未安装' };
  await hardware.checkLocalService();
  assert.equal(hardware.snapshot().localService.status, 'online');
  assert.equal(hardware.profiles[0].compileAvailable, false);
  assert.match(hardware.profiles[0].reason!, /core/);
  assert.throws(() => hardware.start(false), /core/);
  available = { ...available, profiles: [] }; await hardware.checkLocalService();
  assert.equal(hardware.profileId, 'esp32'); assert.equal(hardware.portId, 'COM-MOCK');
  assert.equal(hardware.snapshot().localService.status, 'online');
});

test('confirmed incompatible service cannot submit new jobs using previously cached profiles', async () => {
  let compatible = true, posts = 0;
  const { hardware } = fixture(async (url, init) => {
    if (init?.method === 'POST') posts++;
    return response(path(url).endsWith('/ports') ? ports : { ...capability(), protocolVersion: compatible ? 1 : 2 });
  });
  await hardware.refresh(); hardware.configure('esp32', 'COM-MOCK');
  compatible = false; await hardware.checkLocalService();
  assert.equal(hardware.profiles.length, 1, 'last known capabilities remain available for diagnostics');
  assert.throws(() => hardware.start(false), /协议不兼容/);
  assert.throws(() => hardware.start(true), /协议不兼容/);
  assert.equal(posts, 0); assert.equal(hardware.busy, false);
  assert.equal(hardware.profileId, 'esp32'); assert.equal(hardware.portId, 'COM-MOCK');
});

test('network and HTTP capability failures are offline while existing job and serial diagnostics are preserved', async () => {
  let offline = true;
  const { hardware, session } = fixture(async () => {
    if (offline) throw new TypeError('Failed to fetch');
    return response({ error: { code: 'TOOLS_FAILED', message: 'executor temporarily unavailable' } }, 503);
  });
  hardware.error = 'existing job error'; hardware.restoreError = 'existing restore error';
  session.serialError = 'existing serial error';
  await hardware.checkLocalService();
  assert.equal(hardware.snapshot().localService.status, 'offline');
  assert.match(hardware.snapshot().localService.message, /Failed to fetch/);
  offline = false; await hardware.checkLocalService();
  assert.equal(hardware.snapshot().localService.status, 'offline');
  assert.match(hardware.snapshot().localService.message, /TOOLS_FAILED/);
  assert.equal(hardware.error, 'existing job error'); assert.equal(hardware.restoreError, 'existing restore error');
  assert.equal(hardware.snapshot().serialError, 'existing serial error');
});

test('reachable incompatible protocols and malformed consumed fields are incompatible rather than offline', async t => {
  const cases: [string, unknown][] = [
    ['protocol', { ...capability(), protocolVersion: 2 }],
    ['host', { ...capability(), executionHost: 'remote' }],
    ['profiles', { ...capability(), profiles: null }],
    ['boolean', { ...capability(), profiles: [{ ...capability().profiles[0], compileAvailable: 'yes' }] }],
    ['reason', { ...capability(), profiles: [{ ...capability().profiles[0], reason: {} }] }],
    ['profile identity', { ...capability(), profiles: [{ ...capability().profiles[0], deviceId: 12 }] }],
    ['fqbn', { ...capability(), profiles: [{ ...capability().profiles[0], fqbn: null }] }],
    ['duplicate profile IDs', { ...capability(), profiles: [...capability().profiles, ...capability().profiles] }],
    ['toolchain', { ...capability(), toolchain: null }],
  ];
  for (const [name, value] of cases) await t.test(name, async () => {
    const { hardware } = fixture(async () => response(value));
    await hardware.checkLocalService();
    assert.equal(hardware.snapshot().localService.status, 'incompatible');
    assert.equal(hardware.profiles.length, 0);
    assert.equal(hardware.error, '');
  });
  const { hardware } = fixture(async () => new Response('<html>not capabilities</html>'));
  await hardware.checkLocalService();
  assert.equal(hardware.snapshot().localService.status, 'incompatible');
  assert.match(hardware.snapshot().localService.message, /JSON/);
});

test('OS port enumeration failures only update portError and retain browser serial and explicit choices', async () => {
  const session = new HardwareSession();
  // No physical port is opened; this verifies the controller leaves the existing session state alone.
  session.status = 'open'; session.portId = 'browser-mock'; session.sessionId = 'session-mock';
  let failPorts = false, listed = ports;
  const { hardware } = fixture(async url => {
    if (path(url).endsWith('/capabilities')) return response(capability());
    if (failPorts) throw new Error('OS enumeration denied');
    return response(listed);
  }, session);
  await hardware.refresh(); hardware.configure('esp32', 'COM-MOCK');
  hardware.error = 'job error'; failPorts = true; await hardware.refresh();
  let state = hardware.snapshot();
  assert.equal(state.localService.status, 'online'); assert.match(state.portError, /OS enumeration denied/);
  assert.deepEqual(state.ports, ports.items); assert.equal(state.portId, 'COM-MOCK');
  assert.equal(state.connection, 'open'); assert.equal(state.browserPortId, 'browser-mock'); assert.equal(state.sessionId, 'session-mock');
  assert.equal(state.error, 'job error');
  failPorts = false; listed = { items: [] }; await hardware.refreshUploadPorts(); state = hardware.snapshot();
  assert.equal(state.portError, ''); assert.deepEqual(state.ports, []);
  assert.equal(state.portId, 'COM-MOCK', 'disappearing OS port is not an implicit user selection change');
});

test('malformed OS port responses retain the prior list and stay separate from service compatibility', async t => {
  for (const value of [null, { items: {} }, { items: [null] }, { items: [{ portId: 'x', displayName: 3 }] },
    { items: [{ portId: 'x', displayName: 'x', usbVendorId: 1 }] }, { items: [...ports.items, ...ports.items] }]) {
    await t.test(JSON.stringify(value), async () => {
      const { hardware } = fixture(async url => response(path(url).endsWith('/capabilities') ? capability() : value));
      hardware.ports = ports.items; hardware.portId = 'COM-MOCK'; await hardware.refresh();
      assert.equal(hardware.snapshot().localService.status, 'online');
      assert.match(hardware.snapshot().portError, /字段无效/);
      assert.deepEqual(hardware.ports, ports.items); assert.equal(hardware.portId, 'COM-MOCK');
    });
  }
});

test('a later capability check supersedes both late successes and late errors without overwriting its result', async () => {
  const pending: ReturnType<typeof deferred<Response>>[] = [], signals: AbortSignal[] = [];
  const { hardware } = fixture(async (_url, init) => {
    const next = deferred<Response>(); pending.push(next); signals.push(init!.signal!); return next.promise;
  });
  const older = hardware.checkLocalService(), newer = hardware.checkLocalService();
  assert.equal(signals[0].aborted, true); await older;
  pending[1].reject(new Error('new service failure')); await newer;
  pending[0].resolve(response(capability())); await Promise.resolve();
  assert.equal(hardware.snapshot().localService.status, 'offline');
  assert.match(hardware.snapshot().localService.message, /new service failure/);
  assert.equal(hardware.profiles.length, 0);
  const lateFailure = hardware.checkLocalService(), newest = hardware.checkLocalService(); await lateFailure;
  pending[3].resolve(response(capability())); await newest;
  pending[2].reject(new Error('old service failure')); await Promise.resolve();
  assert.equal(hardware.snapshot().localService.status, 'online'); assert.equal(hardware.profiles.length, 1);
});

test('a check superseded synchronously by a subscriber also terminates without starting its stale transport', async () => {
  let calls = 0, retry = true;
  const { hardware } = fixture(async () => { calls++; return response(capability()); });
  let newest: Promise<void> | undefined;
  hardware.subscribe(() => {
    if (retry && hardware.snapshot().localService.status === 'checking') { retry = false; newest = hardware.checkLocalService(); }
  });
  await hardware.checkLocalService(); await newest;
  assert.equal(calls, 1); assert.equal(hardware.snapshot().localService.status, 'online');
});

test('a later port refresh supersedes late lists and late errors while keeping explicit selection', async () => {
  const pending: ReturnType<typeof deferred<Response>>[] = [];
  const { hardware } = fixture(async () => { const next = deferred<Response>(); pending.push(next); return next.promise; });
  hardware.portId = 'COM-MOCK';
  const older = hardware.refreshUploadPorts(), newer = hardware.refreshUploadPorts(); await older;
  pending[1].resolve(response(ports)); await newer;
  pending[0].resolve(response({ items: [{ portId: 'OLD', displayName: 'old result' }] })); await Promise.resolve();
  assert.deepEqual(hardware.ports, ports.items); assert.equal(hardware.portId, 'COM-MOCK');
  const lateFailure = hardware.refreshUploadPorts(), newest = hardware.refreshUploadPorts(); await lateFailure;
  pending[3].resolve(response({ items: [] })); await newest;
  pending[2].reject(new Error('old enumeration failure')); await Promise.resolve();
  assert.deepEqual(hardware.ports, []); assert.equal(hardware.snapshot().portError, ''); assert.equal(hardware.portId, 'COM-MOCK');
});

test('capability checks time out after eight seconds even when transport ignores abort, and late success cannot restore online', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred<Response>(); let signal: AbortSignal | undefined;
  const { hardware } = fixture(async (_url, init) => { signal = init!.signal!; return pending.promise; });
  const checking = hardware.checkLocalService();
  t.mock.timers.tick(7999); await Promise.resolve(); assert.equal(hardware.snapshot().localService.status, 'checking');
  t.mock.timers.tick(1); await checking;
  assert.equal(signal?.aborted, true); assert.equal(hardware.snapshot().localService.status, 'offline');
  assert.match(hardware.snapshot().localService.message, /超时/);
  pending.resolve(response(capability())); await Promise.resolve();
  assert.equal(hardware.snapshot().localService.status, 'offline');
});

test('port response-body reads are bounded too and do not change an online capability service', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hardware } = fixture(async url => path(url).endsWith('/capabilities') ? response(capability()) : new Response(new ReadableStream()));
  await hardware.checkLocalService(); hardware.ports = ports.items;
  const checking = hardware.refreshUploadPorts(); await Promise.resolve();
  t.mock.timers.tick(8000); await checking;
  assert.equal(hardware.snapshot().localService.status, 'online'); assert.match(hardware.snapshot().portError, /超时/);
  assert.deepEqual(hardware.ports, ports.items);
});

test('malformed upload preflight port lists are rejected before release and never replace the last valid list', async () => {
  let portCalls = 0, released = 0, uploads = 0;
  const build: HardwareJob = { id: 'build-mock', kind: 'build', state: 'running', stage: 'compiling', deviceId: 'arduinoEsp32', profileId: 'esp32', sourceHash: 'hash', createdAt: 'now' };
  const request: typeof fetch = async url => {
    const route = path(url);
    if (route.endsWith('/capabilities')) return response(capability());
    if (route.endsWith('/ports')) return response(++portCalls === 1 ? ports : { items: [{ portId: 'COM-MOCK', displayName: null }] });
    if (route.endsWith('/builds')) return response({ job: build });
    if (route.endsWith('/uploads')) { uploads++; return response({ job: build }); }
    return response({ job: { ...build, state: 'succeeded', stage: 'complete' }, logs: [], nextLog: 0 });
  };
  const hardware = new HardwareController(new HardwareSession(), source, base, () => { released++; }, request, async () => {});
  await hardware.refresh(); hardware.configure('esp32', 'COM-MOCK'); hardware.start(true);
  await until(() => !hardware.busy);
  assert.match(hardware.error, /端口列表字段无效/); assert.equal(released, 0); assert.equal(uploads, 0);
  assert.deepEqual(hardware.ports, ports.items); assert.equal(hardware.portId, 'COM-MOCK');
});

test('upload preflight and manual refresh share response generations while upload validates its own fresh result', async () => {
  const preflight = deferred<Response>(), staleHealth = deferred<Response>();
  let portCalls = 0, uploads = 0;
  const build: HardwareJob = { id: 'build-mock', kind: 'build', state: 'running', stage: 'compiling', deviceId: 'arduinoEsp32', profileId: 'esp32', sourceHash: 'hash', createdAt: 'now' };
  const request: typeof fetch = async url => {
    const route = path(url);
    if (route.endsWith('/capabilities')) return response(capability());
    if (route.endsWith('/ports')) {
      portCalls++;
      if (portCalls === 2) return staleHealth.promise;
      if (portCalls === 3) return preflight.promise;
      return response(portCalls === 1 ? ports : { items: [{ portId: 'COM-NEW', displayName: 'newest visible list' }] });
    }
    if (route.endsWith('/builds')) return response({ job: build });
    if (route.endsWith('/uploads')) { uploads++; return response({ job: { ...build, id: 'upload-mock', kind: 'upload', state: 'succeeded', stage: 'complete' } }); }
    return response({ job: { ...build, state: 'succeeded', stage: 'complete' }, logs: [], nextLog: 0 });
  };
  const { hardware } = fixture(request);
  await hardware.refresh(); hardware.configure('esp32', 'COM-MOCK');
  const olderHealth = hardware.refreshUploadPorts(); hardware.start(true);
  await until(() => portCalls === 3); await olderHealth;
  await hardware.refreshUploadPorts();
  preflight.resolve(response(ports)); await until(() => !hardware.busy);
  staleHealth.resolve(response({ items: [{ portId: 'COM-OLD', displayName: 'stale list' }] })); await Promise.resolve();
  assert.equal(uploads, 1); assert.equal(hardware.ports[0].portId, 'COM-NEW');
  assert.equal(hardware.portId, 'COM-MOCK'); assert.equal(hardware.error, '');
});

test('health checks do not release an active job or browser port when status polling and cancellation are interrupted', async () => {
  const polls: ReturnType<typeof deferred<Response>>[] = [], paths: string[] = [];
  let failHealth = false, stopped = 0, closed = 0;
  const session = new HardwareSession();
  session.status = 'open'; session.portId = 'browser-mock'; session.sessionId = 'session-mock';
  session.close = async () => { closed++; };
  const job: HardwareJob = { id: 'build-mock', kind: 'build', state: 'running', stage: 'compiling', deviceId: 'arduinoEsp32', profileId: 'esp32', sourceHash: 'hash', createdAt: 'now' };
  const request: typeof fetch = async (url, init) => {
    const route = path(url); paths.push(`${init?.method ?? 'GET'} ${route}`);
    if (route.endsWith('/capabilities')) { if (failHealth) throw new Error('health offline'); return response(capability()); }
    if (route.endsWith('/ports')) { if (failHealth) throw new Error('ports offline'); return response(ports); }
    if (route.endsWith('/builds')) return response({ job });
    if (route.endsWith('/cancel')) throw new Error('cancel offline');
    const pending = deferred<Response>(); polls.push(pending); return pending.promise;
  };
  const hardware = new HardwareController(session, source, base, () => { stopped++; }, request, async () => {});
  await hardware.refresh(); hardware.start(false);
  await until(() => polls.length > 0);
  failHealth = true; await hardware.refresh(); await hardware.cancel();
  assert.equal(hardware.busy, true); assert.equal(hardware.use, 'build'); assert.equal(hardware.job?.state, 'running');
  assert.equal(hardware.snapshot().localService.status, 'offline'); assert.match(hardware.snapshot().portError, /ports offline/);
  assert.match(hardware.error, /取消尚未确认/); assert.equal(stopped, 0); assert.equal(closed, 0);
  assert.equal(session.status, 'open'); assert.equal(session.portId, 'browser-mock');
  polls[0].reject(new Error('poll offline'));
  await until(() => polls.length >= 2);
  assert.equal(hardware.busy, true); assert.match(hardware.error, /仍等待工具退出/);
  polls[1].resolve(response({ job: { ...job, state: 'cancelled', stage: 'complete' }, logs: [], nextLog: 0 }));
  await until(() => !hardware.busy);
  assert.equal(hardware.job?.state, 'cancelled'); assert.equal(closed, 0);
  assert.equal(paths.filter(p => p.startsWith('POST ') && p.endsWith('/builds')).length, 1);
  assert.equal(paths.some(p => p.endsWith('/uploads')), false);
});
