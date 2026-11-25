import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareController } from '../src/hardware-controller.ts';
import type { HardwareSource } from '../src/hardware-controller.ts';
import type { HardwareCapabilities, HardwareJob } from '../src/hardware-types.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import { UploadProgressModel, renderUploadProgress } from '../src/upload-progress.ts';
import { BrowserPortMock, defaults, until } from './local-serial-fixture.ts';

type Element = { type: string; props: Record<string, any>; children: any[] };
const R = { createElement: (type: string, props: any, ...children: any[]): Element => ({ type, props: props ?? {}, children }) };
const elements = (root: Element): Element[] => [root, ...root.children.filter(value => value && typeof value === 'object').flatMap(elements)];
const text = (root: Element): string => root.children.map(value => value && typeof value === 'object' ? text(value) : typeof value === 'string' ? value : '').join('');
const button = (tree: Element, label: string) => elements(tree).find(node => node.type === 'button' && text(node) === label)!;
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const capability = (): HardwareCapabilities => ({ protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: 'mock', description: 'mock compiler' }, profiles: [
  { id: 'esp32', deviceId: 'arduinoEsp32', label: 'ESP32', chip: 'esp32', fqbn: 'esp32:esp32:esp32', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false },
  { id: 'esp32-explicit', deviceId: 'arduinoEsp32', label: 'ESP32 explicit', chip: 'esp32', fqbn: 'esp32:esp32:esp32', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false },
  { id: 'uno', deviceId: 'arduinoUno', label: 'Uno', chip: 'avr', fqbn: 'arduino:avr:uno', compileAvailable: true, uploadAvailable: true, realtimeAvailable: true },
] });
const job = (kind: HardwareJob['kind'], state: HardwareJob['state'] = 'succeeded'): HardwareJob => ({ id: kind, kind, state, stage: 'complete', deviceId: 'arduinoEsp32', profileId: 'esp32', sourceHash: 'mock-hash', createdAt: '2026-11-24T00:00:00Z' });
async function fixture() {
  const port = new BrowserPortMock(); let chooser = 0, stopped = 0, failCaps = false, failPorts = false;
  let caps: unknown = capability(), pendingCaps: Promise<Response> | undefined;
  const current: HardwareSource = { deviceId: 'arduinoEsp32', code: 'void setup(){} void loop(){}', moduleIds: [], documentId: 1, editVersion: 1, realtime: false };
  const session = new HardwareSession({ getPorts: async () => [port], requestPort: async () => { chooser++; return port; } });
  await session.refresh(); await session.open(session.ports[0].id, defaults);
  const calls: { path: string; method: string; body?: any }[] = [];
  const request: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path.endsWith('/capabilities')) {
      if (pendingCaps) return pendingCaps;
      if (failCaps) throw new TypeError('Failed to fetch');
      return Response.json(caps);
    }
    if (path.endsWith('/ports')) { if (failPorts) throw new Error('mock OS enumeration denied'); return Response.json({ items: [{ portId: 'COM-MOCK', displayName: 'Mock OS device' }] }); }
    return Response.json({ job: job(path.endsWith('/builds') ? 'build' : 'upload') });
  };
  const hardware = new HardwareController(session, () => current, 'http://mock/api', () => { stopped++; }, request);
  const model = new UploadProgressModel(hardware);
  const view = () => renderUploadProgress(R, model, { start: upload => { model.start(upload); }, onClose: () => {} });
  return { hardware, session, model, port, current, calls, view, chooser: () => chooser, stopped: () => stopped,
    failCaps: (value: boolean) => { failCaps = value; }, failPorts: (value: boolean) => { failPorts = value; }, caps: (value: unknown) => { caps = value; }, pending: (value?: Promise<Response>) => { pendingCaps = value; },
    posts: () => calls.filter(call => call.method === 'POST'), close: () => session.close() };
}

test('connected terminals get service-specific unknown/checking/offline/incompatible blockers before empty Profile, with no POST or close', async () => {
  const f = await fixture(), pending = deferred<Response>();
  const blocked = (reason: RegExp) => {
    for (const upload of [false, true]) {
      assert.match(f.hardware.startDisabledReason(upload), reason);
      assert.throws(() => f.model.start(upload), reason);
    }
    const tree = f.view(), [body, actions] = tree.children as Element[];
    assert.equal(button(tree, '编译检查').props.disabled, true); assert.equal(button(tree, '编译并上传').props.disabled, true);
    assert.match(text(body), reason); assert.match(text(actions), reason);
    assert.match(text(body), /终端：已连接 · 编译上传：等待本机服务/);
    assert.doesNotMatch(text(actions), /请先选择当前主控的 Profile/);
    assert.equal(f.port.closes, 0); assert.equal(f.session.status, 'open'); assert.equal(f.posts().length, 0); assert.equal(f.stopped(), 0);
  };
  try {
    blocked(/尚未检测本机编译服务/);
    f.pending(pending.promise); const checking = f.hardware.checkLocalService(); blocked(/正在检测本机编译服务/);
    pending.reject(new TypeError('Failed to fetch')); await checking; f.pending(); blocked(/无法访问本机编译服务.*Failed to fetch/);
    assert.match(text(f.view()), /安装并启动 CCraft Link/); assert.doesNotMatch(text(f.view()), /npm run hardware/); assert.match(text(f.view()), /本地网络访问权限/);
    f.hardware.busy = true; assert.match(f.hardware.startDisabledReason(true), /硬件作业仍在进行/); f.hardware.busy = false;
    f.current.programming = true; assert.match(f.hardware.startDisabledReason(true), /上传模式/); f.current.programming = false;
    f.current.generationError = 'mock code generation failed'; assert.match(f.hardware.startDisabledReason(true), /无法访问本机编译服务/); f.current.generationError = '';
    f.caps({ ...capability(), protocolVersion: 2 }); await f.hardware.checkLocalService(); blocked(/协议不兼容/);
    assert.equal(f.chooser(), 0);
  } finally { f.hardware.busy = false; await f.close(); }
});

test('offline recovery repairs the current Profile and clears preflight feedback, but requires an explicit OS choice and explicit upload', async () => {
  const f = await fixture(), pending = deferred<Response>();
  try {
    f.failCaps(true); await f.hardware.refresh(); assert.throws(() => f.model.start(true), /Failed to fetch/);
    f.hardware.profileId = 'removed-profile';
    f.pending(pending.promise); const recovering = f.hardware.refresh();
    assert.equal(f.hardware.snapshot().localService.status, 'checking'); assert.equal(f.model.message, '');
    pending.resolve(Response.json(capability())); await recovering; f.pending(); f.failCaps(false);
    assert.equal(f.hardware.profileId, 'esp32'); assert.equal(f.hardware.portId, ''); assert.equal(f.model.message, '');
    assert.match(f.hardware.startDisabledReason(true), /明确选择本机烧录端口/); assert.equal(f.hardware.startDisabledReason(false), '');
    assert.equal(f.posts().length, 0); assert.equal(f.port.closes, 0);
    f.model.configure('esp32', 'COM-MOCK'); assert.match(text(f.view()), /当前配置已就绪/);
    button(f.view(), '编译并上传').props.onClick(); await until(() => !f.hardware.busy);
    assert.deepEqual(f.posts().map(call => call.path), ['/api/builds', '/api/uploads']);
    assert.deepEqual(f.posts()[1].body, { buildId: 'build', portId: 'COM-MOCK' });
    assert.equal(f.port.closes, 1); assert.equal(f.port.opens, 2); assert.equal(f.session.status, 'open'); assert.equal(f.chooser(), 0);
  } finally { await f.close(); }
});

test('health checks preserve a valid explicit unavailable Profile and repair only empty, removed or cross-board choices', async () => {
  const f = await fixture();
  try {
    await f.hardware.refresh(); f.hardware.configure('esp32-explicit', 'COM-MOCK');
    const unavailable = capability(); Object.assign(unavailable.profiles[1], { compileAvailable: false, uploadAvailable: false, reason: 'mock required core missing' });
    f.caps(unavailable); await f.hardware.checkLocalService();
    assert.equal(f.hardware.profileId, 'esp32-explicit'); assert.match(f.hardware.startDisabledReason(false), /mock required core missing/);
    for (const previous of ['', 'removed-profile', 'uno']) {
      f.hardware.profileId = previous; await f.hardware.checkLocalService(); assert.equal(f.hardware.profileId, 'esp32'); assert.equal(f.hardware.portId, 'COM-MOCK');
    }
    f.current.deviceId = 'arduinoUno'; await f.hardware.checkLocalService(); assert.equal(f.hardware.profileId, 'uno');
    f.current.deviceId = 'arduinoEsp32'; f.caps({ ...capability(), profiles: [capability().profiles[2]] }); await f.hardware.checkLocalService();
    assert.equal(f.hardware.profileId, ''); assert.match(f.hardware.startDisabledReason(false), /本机服务没有当前主控的 Profile/);
    assert.equal(f.posts().length, 0); assert.equal(f.port.closes, 0);
  } finally { await f.close(); }
});

test('a delayed successful health response cannot change busy captured configuration or erase actual job diagnostics', async () => {
  const f = await fixture(), pending = deferred<Response>();
  try {
    await f.hardware.refresh(); f.hardware.configure('esp32-explicit', 'COM-MOCK');
    f.hardware.profileId = 'captured-legacy-profile';
    f.pending(pending.promise); const checking = f.hardware.checkLocalService();
    f.hardware.busy = true; f.hardware.use = 'build'; f.hardware.job = job('build', 'running');
    f.hardware.error = '提交结果未知：mock actual execution'; f.hardware.restoreError = 'mock real restore failure';
    f.hardware.logs = [{ index: 0, stream: 'stderr', text: 'mock retained tool log' }];
    const originalJob = f.hardware.job, originalLogs = f.hardware.logs;
    f.current.deviceId = 'arduinoUno'; f.hardware.changed();
    pending.resolve(Response.json(capability())); await checking; f.pending();
    assert.equal(f.hardware.profileId, 'captured-legacy-profile'); assert.equal(f.hardware.portId, 'COM-MOCK');
    assert.equal(f.hardware.job, originalJob); assert.equal(f.hardware.logs, originalLogs);
    assert.equal(f.hardware.error, '提交结果未知：mock actual execution'); assert.equal(f.hardware.restoreError, 'mock real restore failure');
    assert.equal(f.hardware.busy, true); assert.match(f.hardware.startDisabledReason(false), /硬件作业/);
    assert.equal(f.posts().length, 0); assert.equal(f.port.closes, 0);
    f.hardware.busy = false; await f.hardware.checkLocalService(); assert.equal(f.hardware.profileId, 'uno');
    assert.equal(f.hardware.error, '提交结果未知：mock actual execution'); assert.equal(f.hardware.logs, originalLogs);
  } finally { f.hardware.busy = false; await f.close(); }
});

test('ports failure blocks upload with its real diagnostic while compile remains available and the terminal stays open', async () => {
  const f = await fixture();
  try {
    await f.hardware.refresh(); f.hardware.configure('esp32', 'COM-MOCK');
    f.failPorts(true); await f.hardware.refresh();
    const reason = f.hardware.startDisabledReason(true);
    assert.match(reason, /mock OS enumeration denied.*刷新烧录端口/);
    f.hardware.portId = ''; assert.equal(f.hardware.startDisabledReason(true), reason, 'enumeration failure precedes a missing selection');
    const tree = f.view(); assert.equal(button(tree, '编译检查').props.disabled, false); assert.equal(button(tree, '编译并上传').props.disabled, true);
    assert.match(text(tree.children[1]), /mock OS enumeration denied/); assert.match(text(tree.children[1]), /可先使用“编译检查”/);
    assert.throws(() => f.model.start(true), /mock OS enumeration denied/); assert.equal(f.posts().length, 0);
    button(tree, '编译检查').props.onClick(); await until(() => !f.hardware.busy);
    assert.deepEqual(f.posts().map(call => call.path), ['/api/builds']); assert.equal(f.port.closes, 0); assert.equal(f.session.status, 'open');
    f.hardware.error = 'real prior job failure'; f.hardware.restoreError = 'real restore failure'; const previousJob = f.hardware.job;
    f.failPorts(false); await f.hardware.refreshUploadPorts();
    assert.equal(f.hardware.snapshot().portError, ''); assert.equal(f.hardware.portId, ''); assert.match(f.hardware.startDisabledReason(true), /明确选择/);
    assert.equal(f.hardware.job, previousJob); assert.equal(f.hardware.error, 'real prior job failure'); assert.equal(f.hardware.restoreError, 'real restore failure');
    assert.equal(f.chooser(), 0);
  } finally { await f.close(); }
});
