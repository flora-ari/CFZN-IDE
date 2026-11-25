import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { HardwareSession, defaultSerialOptions } from '../apps/web/src/hardware-session.ts';
import { HardwareController } from '../apps/web/src/hardware-controller.ts';
import { UploadProgressModel, renderUploadProgress } from '../apps/web/src/upload-progress.ts';
import { NativeSerialSocket } from '../apps/web/src/native-serial-socket.ts';

// Real frontend state machines, fake fetch and Streams. No network or physical serial operations.
const root = resolve(import.meta.dirname, '..'), out = join(root, 'tests/evidence/upload-service-recovery-20261124');
const evidence = { date: '2026-11-24', scope: 'actual frontend objects + simulated HTTP and browser serial', cases: [] };
const sha = value => createHash('sha256').update(value).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function until(predicate) { for (let i = 0; i < 300; i++) { if (predicate()) return; await pause(5); } assert.fail('fixture condition timed out'); }
const R = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter(x => x != null && x !== false) }) };
const nodes = n => n && typeof n === 'object' ? [n, ...n.children.flatMap(nodes)] : [];
const text = n => typeof n === 'string' ? n : n && typeof n === 'object' ? n.children.map(text).join('') : '';
const button = (tree, label) => nodes(tree).find(n => n.type === 'button' && text(n) === label);
const capabilities = () => ({ protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: 'fixture', description: 'simulated compiler' }, profiles: [
  { id: 'esp-default', deviceId: 'arduinoEsp32', label: 'ESP default', chip: 'esp32', fqbn: 'esp32:esp32:esp32', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false },
  { id: 'esp-explicit', deviceId: 'arduinoEsp32', label: 'ESP explicit', chip: 'esp32', fqbn: 'esp32:esp32:esp32', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false },
  { id: 'uno', deviceId: 'arduinoUno', label: 'Uno', chip: 'avr', fqbn: 'arduino:avr:uno', compileAvailable: true, uploadAvailable: true, realtimeAvailable: true },
] });
const job = (kind, state) => ({ id: 'fixture-' + kind, kind, state, stage: state === 'running' ? 'building' : 'complete', deviceId: 'arduinoEsp32', profileId: 'esp-explicit', sourceHash: 'fixture', createdAt: '2026-11-24T00:00:00Z', ...(state === 'failed' ? { error: { code: 'FIXTURE_TOOL_FAILED', message: 'fixture actual tool failure' } } : {}) });
class Port extends EventTarget {
  opens = 0; closes = 0; isOpen = false; reopenFails = false;
  getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
  async open(options) { if (this.reopenFails) throw new Error('fixture restore denied'); this.opens++; this.isOpen = true; this.options = { ...options }; this.readable = new ReadableStream(); this.writable = new WritableStream(); }
  async close() { this.closes++; this.isOpen = false; this.readable = null; this.writable = null; }
}
async function fixture(t) {
  const port = new Port(), state = { caps: capabilities(), mode: 'online', calls: [], capGate: undefined, portsGate: undefined, pollGate: undefined, portsFail: false, buildState: 'succeeded', uploadState: 'succeeded', lose: '', failRestore: false, chooser: 0, stopped: 0 };
  let current = { deviceId: 'arduinoEsp32', code: 'void setup(){} void loop(){}', documentId: 1, editVersion: 1, moduleIds: [], realtime: false };
  const session = new HardwareSession({ getPorts: async () => [port], requestPort: async () => { state.chooser++; return port; } });
  await session.refresh(); await session.open(session.ports[0].id, { ...defaultSerialOptions, baudRate: 9600 });
  const request = async (url, init = {}) => {
    const path = new URL(url).pathname.replace('/api', ''), method = init.method ?? 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    state.calls.push({ path, method, body });
    if (path === '/capabilities') { if (state.capGate) return state.capGate.promise; if (state.mode === 'offline') throw new TypeError('fixture Failed to fetch'); return Response.json(state.mode === 'incompatible' ? { ...state.caps, protocolVersion: 9 } : state.caps); }
    if (path === '/ports') { if (state.portsGate) return state.portsGate.promise; if (state.portsFail) return Response.json({ error: { code: 'SERIAL_IO_ERROR', message: 'fixture OS enumeration denied' } }, { status: 503 }); return Response.json({ items: [{ portId: 'MOCK_UPLOAD', displayName: 'Fake OS upload port' }] }); }
    if (path === '/builds' || path === '/uploads') { if (state.lose === path) throw new TypeError('fixture response disappeared'); const kind = path === '/builds' ? 'build' : 'upload'; if (kind === 'upload' && state.failRestore) port.reopenFails = true; return Response.json({ job: job(kind, kind === 'build' ? state.buildState : state.uploadState) }); }
    if (path.startsWith('/jobs/')) { if (state.pollGate) return state.pollGate.promise; return Response.json({ job: job('build', 'succeeded'), logs: [], nextLog: 0 }); }
    throw new Error('unexpected simulated request ' + path);
  };
  const hardware = new HardwareController(session, () => current, 'http://fixture.invalid/api', () => { state.stopped++; }, request, async () => pause(1));
  const model = new UploadProgressModel(hardware), view = () => renderUploadProgress(R, model, { start: upload => model.start(upload), onClose: () => {} });
  const socket = new NativeSerialSocket(hardware, () => true, () => false, () => false), messages = []; socket.setHandleMessage(m => messages.push(m)); socket.open();
  async function nativeStart(id) { socket.sendMessage({ id, method: 'upload', params: { message: current.code } }); await until(() => messages.some(m => m.id === id)); return messages.find(m => m.id === id); }
  t.after(async () => { socket.close(); hardware.busy = false; port.reopenFails = false; await session.close(); });
  return { port, state, session, hardware, model, view, nativeStart, setCurrent: v => { current = { ...current, ...v }; }, posts: () => state.calls.filter(c => c.method === 'POST') };
}
function check(name, run) { test(name, async t => { try { const detail = await run(t); evidence.cases.push({ name, passed: true, detail }); } catch (e) { evidence.cases.push({ name, passed: false, error: e.stack }); throw e; } }); }

check('all unavailable service states win over empty Profile across start, native upload and both rendered buttons', async t => {
  const f = await fixture(t), statuses = [];
  async function blocked(pattern) {
    statuses.push(f.hardware.snapshot().localService.status); assert.equal(f.hardware.profileId, '');
    for (const upload of [false, true]) { const reason = f.hardware.startDisabledReason(upload); assert.match(reason, pattern); assert.throws(() => f.model.start(upload), e => e.message === reason); }
    const reply = await f.nativeStart(statuses.length); assert.match(reply.error.message, pattern);
    const tree = f.view(); for (const label of ['编译检查', '编译并上传']) { assert.equal(button(tree, label).props.disabled, true); assert.match(button(tree, label).props.title, pattern); }
    assert.match(text(tree.children[0]), pattern); assert.match(text(tree.children[1]), pattern); assert.match(text(tree), /终端：已连接 · 编译上传：等待本机服务/);
    assert.equal(f.posts().length, 0); assert.equal(f.port.closes, 0); assert.equal(f.state.stopped, 0); assert.equal(f.session.status, 'open');
  }
  await blocked(/尚未检测本机编译服务/);
  f.state.capGate = deferred(); const checking = f.hardware.checkLocalService(); await blocked(/正在检测本机编译服务/);
  f.state.capGate.resolve(Response.json({ error: { code: 'UNAVAILABLE', message: 'fixture offline diagnostic' } }, { status: 503 })); await checking; f.state.capGate = undefined;
  await blocked(/无法访问本机编译服务.*fixture offline diagnostic/); assert.match(text(f.view()), /npm run hardware/); assert.match(text(f.view()), /本地网络访问权限/);
  f.state.mode = 'incompatible'; await f.hardware.checkLocalService(); await blocked(/协议不兼容/);
  f.hardware.busy = true; assert.match(f.hardware.startDisabledReason(true), /作业/); f.hardware.busy = false;
  f.setCurrent({ realtime: true }); assert.match(f.hardware.startDisabledReason(true), /上传模式/); f.setCurrent({ realtime: false });
  assert.equal(f.state.chooser, 0); return { statuses, posts: 0, terminalCloses: 0, nativeErrorsMatchButtons: true };
});

check('recovery GETs run together, repair default Profile and clear stale preflight feedback without choosing OS or starting a job', async t => {
  const f = await fixture(t); f.state.mode = 'offline'; await f.hardware.refresh(); assert.throws(() => f.model.start(true)); assert.match(f.model.message, /fixture Failed to fetch/);
  f.hardware.profileId = 'removed'; f.state.mode = 'online'; f.state.capGate = deferred(); f.state.portsGate = deferred(); const before = f.state.calls.length;
  const recovering = f.hardware.refresh(); assert.equal(f.model.message, '');
  assert.deepEqual(f.state.calls.slice(before).map(c => c.path).sort(), ['/capabilities', '/ports']);
  f.state.capGate.resolve(Response.json(capabilities())); f.state.portsGate.resolve(Response.json({ items: [{ portId: 'MOCK_UPLOAD', displayName: 'Fake OS upload port' }] })); await recovering; f.state.capGate = f.state.portsGate = undefined;
  assert.equal(f.hardware.profileId, 'esp-default'); assert.equal(f.hardware.portId, ''); assert.equal(f.model.message, ''); assert.equal(f.hardware.startDisabledReason(false), ''); assert.match(f.hardware.startDisabledReason(true), /明确选择/);
  assert.equal(f.posts().length, 0); assert.equal(f.port.closes, 0);
  button(f.view(), '编译检查').props.onClick(); await until(() => !f.hardware.busy); assert.deepEqual(f.posts().map(c => c.path), ['/builds']); assert.equal(f.port.closes, 0);
  f.model.configure('esp-default', 'MOCK_UPLOAD'); assert.equal(f.hardware.startDisabledReason(true), ''); assert.equal(f.posts().length, 1);
  return { parallelGETs: true, repairedProfile: 'esp-default', automaticOSSelection: false, automaticJobs: 0, explicitCompilePosts: 1, terminalCloses: 0 };
});

check('valid unavailable selection is preserved; invalid or cross-device selection repairs; busy response cannot alter captured job settings', async t => {
  const f = await fixture(t); await f.hardware.refresh(); f.hardware.configure('esp-explicit', 'MOCK_UPLOAD');
  Object.assign(f.state.caps.profiles[1], { compileAvailable: false, uploadAvailable: false, reason: 'fixture missing required core' }); await f.hardware.refresh(); assert.equal(f.hardware.profileId, 'esp-explicit'); assert.match(f.hardware.startDisabledReason(false), /fixture missing required core/);
  for (const id of ['', 'gone', 'uno']) { f.hardware.profileId = id; await f.hardware.checkLocalService(); assert.equal(f.hardware.profileId, 'esp-default'); assert.equal(f.hardware.portId, 'MOCK_UPLOAD'); }
  f.state.caps = capabilities(); await f.hardware.checkLocalService(); f.hardware.configure('esp-explicit', 'MOCK_UPLOAD');
  f.state.buildState = 'running'; f.state.pollGate = deferred(); f.model.start(false); await until(() => f.state.calls.some(c => c.path.startsWith('/jobs/')));
  f.state.capGate = deferred(); const pending = f.hardware.checkLocalService(); f.setCurrent({ deviceId: 'arduinoUno', code: 'replacement code', editVersion: 2 }); f.hardware.changed();
  f.state.capGate.resolve(Response.json({ ...capabilities(), profiles: [capabilities().profiles[2]] })); await pending; f.state.capGate = undefined;
  assert.equal(f.hardware.profileId, 'esp-explicit'); assert.equal(f.hardware.portId, 'MOCK_UPLOAD'); assert.equal(f.hardware.busy, true);
  assert.equal(f.posts()[0].body.profileId, 'esp-explicit'); assert.equal(f.posts()[0].body.deviceId, 'arduinoEsp32'); assert.equal(f.posts()[0].body.code, 'void setup(){} void loop(){}');
  f.state.pollGate.resolve(Response.json({ job: job('build', 'succeeded'), logs: [], nextLog: 0 })); await until(() => !f.hardware.busy); f.state.pollGate = undefined;
  await f.hardware.checkLocalService(); assert.equal(f.hardware.profileId, 'uno'); f.setCurrent({ deviceId: 'arduinoEsp32' }); f.state.caps.profiles = [capabilities().profiles[2]]; await f.hardware.checkLocalService();
  assert.equal(f.hardware.profileId, ''); assert.match(f.hardware.startDisabledReason(false), /没有当前主控的 Profile/);
  return { explicitUnavailablePreserved: true, repairs: ['empty', 'removed', 'cross-device'], busyCapturedProfile: 'esp-explicit', capturedDevice: 'arduinoEsp32', noMatchingProfileDiagnosed: true };
});

check('port enumeration error precedes absent OS choice, leaves compile enabled and preserves actual failed job diagnostics on recovery', async t => {
  const f = await fixture(t); await f.hardware.refresh(); f.state.portsFail = true; await f.hardware.refresh(); const reason = f.hardware.startDisabledReason(true);
  assert.match(reason, /SERIAL_IO_ERROR.*fixture OS enumeration denied/); assert.equal(f.hardware.portId, ''); assert.equal(f.hardware.startDisabledReason(false), '');
  const tree = f.view(); assert.equal(button(tree, '编译检查').props.disabled, false); assert.equal(button(tree, '编译并上传').props.disabled, true); assert.match(text(tree.children[1]), /fixture OS enumeration denied/);
  assert.throws(() => f.model.start(true), e => e.message === reason); assert.equal(f.posts().length, 0);
  f.state.buildState = 'failed'; f.model.start(false); await until(() => !f.hardware.busy); assert.match(text(f.view()), /fixture actual tool failure/);
  f.hardware.logs.push({ index: 99, stream: 'stderr', text: 'fixture preserved tool output' }); f.hardware.restoreError = 'fixture existing restore error';
  const oldJob = f.hardware.job, oldLogs = f.hardware.logs; f.state.portsFail = false; await f.hardware.refresh();
  assert.equal(f.hardware.job, oldJob); assert.equal(f.hardware.logs, oldLogs); assert.equal(f.hardware.restoreError, 'fixture existing restore error'); assert.match(text(f.view()), /fixture actual tool failure/); assert.match(text(f.view()), /fixture preserved tool output/);
  assert.equal(f.port.closes, 0); assert.equal(f.hardware.portId, ''); assert.match(f.hardware.startDisabledReason(true), /明确选择/);
  return { compileDuringPortsFailure: true, uploadDiagnostic: reason, failedJobAndLogsRetained: true, restoreErrorRetained: true, terminalCloses: 0 };
});

check('real simulated upload failure plus failed terminal restoration survive service refresh', async t => {
  const f = await fixture(t); await f.hardware.refresh(); f.model.configure('esp-default', 'MOCK_UPLOAD'); f.state.uploadState = 'failed'; f.state.failRestore = true;
  f.model.start(true); await until(() => !f.hardware.busy); assert.deepEqual(f.posts().map(c => c.path), ['/builds', '/uploads']); assert.deepEqual(f.posts()[1].body, { buildId: 'fixture-build', portId: 'MOCK_UPLOAD' });
  assert.equal(f.hardware.job.kind, 'upload'); assert.equal(f.hardware.job.state, 'failed'); assert.match(f.hardware.restoreError, /fixture restore denied/); assert.equal(f.port.closes, 1);
  const previous = { job: f.hardware.job, logs: f.hardware.logs, restore: f.hardware.restoreError }; await f.hardware.refresh(); assert.equal(f.hardware.job, previous.job); assert.equal(f.hardware.logs, previous.logs); assert.equal(f.hardware.restoreError, previous.restore);
  assert.match(text(f.view()), /fixture actual tool failure/); assert.match(text(f.view()), /fixture restore denied/);
  return { uploadSchema: ['buildId', 'portId'], failedUploadRetained: true, actualRestorationFailureRetained: true, terminalReopens: f.port.opens - 1 };
});

check('unknown upload submission remains busy and is not retried or restored by successful service detection', async t => {
  const f = await fixture(t); await f.hardware.refresh(); f.model.configure('esp-default', 'MOCK_UPLOAD'); f.state.lose = '/uploads'; f.model.start(true);
  await until(() => /提交结果未知/.test(f.hardware.error)); assert.equal(f.hardware.busy, true); assert.equal(f.port.closes, 1); assert.equal(f.port.opens, 1);
  const previous = { error: f.hardware.error, logs: f.hardware.logs, job: f.hardware.job }; await f.hardware.refresh();
  assert.equal(f.hardware.busy, true); assert.equal(f.hardware.error, previous.error); assert.equal(f.hardware.logs, previous.logs); assert.equal(f.hardware.job, previous.job);
  assert.throws(() => f.model.start(true), /作业/); assert.deepEqual(f.posts().map(c => c.path), ['/builds', '/uploads']); assert.equal(f.port.opens, 1);
  return { submissionUnknownRetained: true, busyRetained: true, automaticRetry: false, automaticRestore: false, posts: 2 };
});

check('final entry, protected upstream modules, licenses and original PNG retain agreed bytes', async () => {
  const dist = join(root, 'apps/web/dist'), html = await readFile(join(dist, 'openblock.html'), 'utf8'); assert.ok(html.includes('editor-DUATB_QJ.js')); assert.ok(html.includes('editor-CwQOS_yH.css'));
  const editor = await readFile(join(dist, 'assets/editor-DUATB_QJ.js')); assert.ok(editor.toString().includes('终端：')); assert.ok(editor.toString().includes('连接新设备'));
  const gui = await readFile(join(dist, 'openblock-vendor/openblock-gui.js')); assert.equal(sha(gui), '78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5');
  const archive = join(root, '.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz'), extract = name => execFileSync('tar', ['-xOf', archive, 'package/' + name], { maxBuffer: 100 * 1024 * 1024 });
  const chunks = value => { const all = [...value.matchAll(/^\/\* (\d+) \*\//gm)]; return new Map(all.map((m, i) => [m[1], value.slice(m.index, all[i + 1]?.index ?? value.length)])); };
  const shipped = chunks(gui.toString()), upstream = chunks(extract('dist/openblock-gui.js').toString()), manifest = JSON.parse(await readFile(join(root, 'apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json'), 'utf8'));
  assert.equal(manifest.vm.length, 178); assert.equal(manifest.blockly.length, 15); for (const part of [...manifest.vm, ...manifest.blockly]) { assert.equal(shipped.get(part.id), upstream.get(part.id)); assert.equal(sha(shipped.get(part.id)), part.sha256); }
  for (const name of ['LICENSE', 'LICENSE.MIT', 'TRADEMARK']) assert.deepEqual(await readFile(join(dist, 'openblock-vendor', name)), extract(name));
  for (const path of ['apps/web/public/branding/ccraft-logo.png', 'apps/web/dist/branding/ccraft-logo.png']) assert.equal(sha(await readFile(join(root, path))), 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2');
  return { editor: 'editor-DUATB_QJ.js', css: 'editor-CwQOS_yH.css', editorSHA256: sha(editor), guiSHA256: sha(gui), vmModules: 178, blocklyModules: 15, licenses: 3, pngSHA256: 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2' };
});

after(async () => { await mkdir(out, { recursive: true }); await writeFile(join(out, 'independent-checks.json'), JSON.stringify(evidence, null, 2)); });
