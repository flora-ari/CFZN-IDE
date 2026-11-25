import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { join, resolve } from 'node:path';
import { HardwareController, profileUnavailableReason } from '../apps/web/src/hardware-controller.ts';
import { HardwareSession, describeError } from '../apps/web/src/hardware-session.ts';
import { renderLocalService } from '../apps/web/src/local-service-view.ts';
import { UploadProgressModel, makeUploadProgressView } from '../apps/web/src/upload-progress.ts';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'tests/evidence/upload-port-recovery-20261123');
const require = createRequire(import.meta.url);
const ts = require('../apps/web/node_modules/typescript');
const path = join(root, 'apps/web/src/native-hardware.ts');
const source = await readFile(path, 'utf8');
const compiled = ts.transpileModule(source.replace('import.meta', '({ env: {} })'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
// Exercise the shipped native entry and renderer in Node. Only unrelated browser integrations are stubbed.
const native = new Module(path);
const imports = {
  './hardware-controller': { HardwareController, profileUnavailableReason },
  './hardware-session': { HardwareSession, describeError },
  './native-serial-socket': { NativeSerialSocket: class {} },
  './terminal-model': { TerminalModel: class {} },
  './extensions/catalog': { controllerIds: ['arduinoUno', 'arduinoEsp32S3', 'aijiteESP32S3', 'arduinoEsp32', 'firebeetleEsp32E'] },
  './connection-modal': { makeConnectionView: () => () => null },
  './local-service-view': { renderLocalService },
  './upload-progress': { UploadProgressModel, makeUploadProgressView },
  './native-hardware.css': {},
};
native.require = id => {
  assert.ok(Object.hasOwn(imports, id), 'Unexpected native entry dependency ' + id);
  return imports[id];
};
native._compile(compiled, path);
const results = { scope: 'Node simulated render tree using production nativeHardware and HardwareController', cases: [] };
const profile = (compileAvailable = true, uploadAvailable = true, reason) => ({
  id: 'firebeetle-esp32e-4mb', deviceId: 'firebeetleEsp32E', label: 'FireBeetle ESP32-E', chip: 'esp32',
  fqbn: 'esp32:esp32:dfrobot_firebeetle2_esp32e', compileAvailable, uploadAvailable, realtimeAvailable: false,
  ...(reason ? { reason } : {}),
});
const flush = () => new Promise(done => setImmediate(done));
const textOf = node => node == null || node === false ? '' : typeof node === 'object'
  ? (node.children ?? []).map(textOf).join('') : String(node);
function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...(node.children ?? []).flatMap(flatten)];
}
const React = {
  createElement(type, props, ...children) {
    const args = { ...props, children };
    return typeof type === 'function' ? type(args) : { type, props: args, children: children.flat(Infinity) };
  },
  useState(value) { return [value, () => {}]; },
  useEffect() {},
};
const Modal = props => props.children[0];
function fixture() {
  const current = { deviceId: 'firebeetleEsp32E', code: 'void setup(){} void loop(){}', documentId: 1,
    editVersion: 1, moduleIds: [], realtime: false, programming: false };
  const calls = [];
  const response = { profiles: [profile()], ports: [{ portId: 'COM-ISOLATED', displayName: 'Isolated test port' }], protocolVersion: 1, runJobs: false };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ path: new URL(url).pathname, method: init?.method });
    if (response.runJobs && (init?.method === 'POST' || String(url).includes('/jobs/'))) {
      const kind = String(url).endsWith('/uploads') || String(url).endsWith('/upload') ? 'upload' : 'build';
      const job = { id: kind, kind, state: init?.method === 'POST' ? 'running' : 'succeeded',
        stage: init?.method === 'POST' ? 'compiling' : 'complete', deviceId: current.deviceId,
        profileId: profile().id, sourceHash: 'mock-source', createdAt: '2026-11-23T00:00:00Z' };
      return Response.json({ job, logs: [{ index: 0, stream: 'stdout', text: 'isolated job log' }], nextLog: 1 });
    }
    assert.equal(init?.method, 'GET', 'preflight and detection must never create a job');
    return Response.json(String(url).endsWith('/ports') ? { items: response.ports } :
      { protocolVersion: response.protocolVersion, executionHost: 'local', toolchain: { cliVersion: null, description: 'simulation' }, profiles: response.profiles });
  };
  const dispatched = [];
  let api;
  try {
    api = native.exports.nativeHardware({
      runtime: { getScratchLinkSocket: () => ({ constructor: class {} }) },
      configureScratchLinkSocketFactory() {}, on() {}, stopAll() {},
    }, () => current, () => ({ dispatch: action => dispatched.push(action), getState: () => ({ scratchGui: null }) }));
  } finally { globalThis.fetch = originalFetch; }
  api.hardware.profiles = response.profiles;
  api.hardware.ports = response.ports;
  api.hardware.profileId = profile().id;
  api.hardware.portId = 'COM-ISOLATED';
  const render = () => api.renderProgress(React, Modal, { oncloseUploadProgress() {} });
  return { ...api, current, calls, response, dispatched, render };
}
async function check(name, run) {
  const detail = await run();
  results.cases.push({ name, detail });
  console.log('PASS', name);
}
await mkdir(out, { recursive: true });
try {
  await check('native upload preserves specific preflight failures and previous job error', async () => {
    const cases = [
      ['missing board', f => { f.current.deviceId = null; }, /从主控扩展选择主控/],
      ['missing profile', f => { f.hardware.profileId = ''; }, /选择当前主控的 Profile/],
      ['stale profile', f => { f.hardware.profileId = 'removed'; }, /Profile 已失效/],
      ['wrong-board profile', f => { f.current.deviceId = 'arduinoUno'; }, /不属于当前主控/],
      ['missing port', f => { f.hardware.portId = ''; }, /明确选择本机烧录端口/],
      ['stale port', f => { f.hardware.portId = 'removed'; }, /烧录端口已失效/],
      ['toolchain unavailable', f => { f.response.profiles[0] = profile(false, false, 'No toolchain configured for this profile.'); f.hardware.profiles = f.response.profiles; },
        /尚未配置本机工具链.*No toolchain configured/],
      ['upload unavailable', f => { f.response.profiles[0] = profile(true, false, 'fixture uploader missing'); f.hardware.profiles = f.response.profiles; },
        /上传工具不可用.*fixture uploader missing/],
      ['generation failure', f => { f.current.generationError = 'GENERATION_FIXTURE_DETAIL'; }, /GENERATION_FIXTURE_DETAIL/],
      ['mode guard', f => { f.current.programming = true; }, /切换到上传模式/],
      ['mutation guard', f => { f.hardware.setMutationGuard(() => 'MUTATION_FIXTURE_DETAIL'); }, /MUTATION_FIXTURE_DETAIL/],
      ['busy guard', f => { f.hardware.busy = true; }, /硬件作业仍在进行/],
      ['retained serial owner', f => { f.session.portId = 'isolated-owner'; f.session.status = 'error'; }, /串口仍被持有/],
      ['incompatible protocol', f => { f.response.protocolVersion = 2; }, /协议不兼容/],
    ];
    const evidence = [];
    for (const [label, change, expected] of cases) {
      const f = fixture();
      f.hardware.error = 'PREVIOUS_JOB_ERROR';
      f.hardware.job = { state: 'failed', kind: 'build', error: { code: 'COMPILE_FAILED', message: 'PREVIOUS_COMPILER_LOG' } };
      change(f);
      if (label === 'incompatible protocol') await f.hardware.refresh();
      f.nativeUpload();
      if (label === 'incompatible protocol') await flush();
      const view = textOf(f.render());
      assert.match(view, expected, label);
      if (label !== 'incompatible protocol') assert.match(view, /上次上传未开始/);
      assert.match(view, /PREVIOUS_JOB_ERROR/);
      assert.equal(f.hardware.job.error.message, 'PREVIOUS_COMPILER_LOG');
      await flush();
      if (label === 'missing profile') assert.doesNotMatch(textOf(f.render()), /上次上传未开始/);
      assert.ok(f.dispatched.some(action => action.modal === 'uploadProgress'));
      assert.ok(f.calls.every(call => call.method === 'GET'));
      assert.equal(f.session.portId, label === 'retained serial owner' ? 'isolated-owner' : null);
      evidence.push({ label, expected: expected.source });
    }
    return evidence;
  });
  await check('progress buttons distinguish compile and upload availability, and render actual job failure', async () => {
    const evidence = [];
    for (const [compile, upload, port, compileDisabled, uploadDisabled] of [
      [false, false, true, true, true], [false, true, true, true, true],
      [true, false, true, false, true], [true, true, false, false, true], [true, true, true, false, false],
    ]) {
      const f = fixture();
      f.hardware.profiles = [profile(compile, upload, compile && upload ? undefined : 'FIXTURE_TOOL_DETAIL')];
      if (!port) f.hardware.portId = '';
      f.hardware.job = { state: 'failed', kind: 'build', error: { code: 'COMPILE_FAILED', message: 'REAL_JOB_ERROR_MESSAGE' } };
      f.hardware.logs = [{ text: 'ACTUAL_COMPILER_LOG' }];
      const view = f.render();
      const buttons = flatten(view).filter(node => node.type === 'button');
      assert.equal(buttons.find(node => textOf(node) === '编译检查').props.disabled, compileDisabled);
      assert.equal(buttons.find(node => textOf(node) === '编译并上传').props.disabled, uploadDisabled);
      assert.match(textOf(view), /REAL_JOB_ERROR_MESSAGE/);
      assert.match(textOf(view), /ACTUAL_COMPILER_LOG/);
      if (!compile || !upload) assert.match(textOf(view), /FIXTURE_TOOL_DETAIL/);
      evidence.push({ compile, upload, port, compileDisabled, uploadDisabled });
    }
    return evidence;
  });
  await check('retry refreshes both GET endpoints and preserves choice, job and logs while showing current readiness', async () => {
    const f = fixture();
    f.hardware.profiles = [profile(false, false, 'No toolchain configured for this profile.')];
    f.response.profiles = f.hardware.profiles;
    f.nativeUpload();
    await flush();
    assert.match(textOf(f.render()), /上次上传未开始.*No toolchain configured/);
    f.hardware.error = '';
    f.hardware.job = { state: 'failed', kind: 'build', error: { message: 'KEPT_JOB_ERROR' } };
    f.hardware.logs = [{ text: 'KEPT_LOG' }];
    f.session.serialError = 'KEPT_SERIAL_ERROR';
    f.response.profiles = [profile()];
    const before = f.calls.length;
    flatten(f.render()).find(node => node.type === 'button' && textOf(node) === '重新检测').props.onClick();
    await flush();
    assert.deepEqual(f.calls.slice(before).map(call => call.path.split('/').at(-1)).sort(), ['capabilities', 'ports']);
    assert.equal(f.hardware.profileId, profile().id);
    assert.equal(f.hardware.portId, 'COM-ISOLATED');
    assert.match(textOf(f.render()), /编译：可用.*上传：可用/);
    assert.doesNotMatch(textOf(f.render()), /上次上传未开始/);
    assert.match(textOf(f.render()), /当前配置已就绪/);
    assert.match(textOf(f.render()), /KEPT_JOB_ERROR/);
    assert.match(textOf(f.render()), /KEPT_LOG/);
    assert.equal(f.session.serialError, 'KEPT_SERIAL_ERROR');
    assert.equal(f.session.portId, null);
    assert.ok(f.calls.every(call => call.method === 'GET'));
    return { methods: f.calls, profile: f.hardware.profileId, port: f.hardware.portId, noSerialOwner: true };
  });
  await check('native missing-port attempt recovers through the rendered selector and starts only on explicit retry', async () => {
    const f = fixture();
    f.hardware.portId = '';
    f.nativeUpload();
    await flush();
    assert.match(textOf(f.render()), /上次上传未开始.*明确选择本机烧录端口/);
    const portSelector = flatten(f.render()).find(node => node.type === 'select' && node.props.value === '');
    portSelector.props.onChange({ target: { value: 'COM-ISOLATED' } });
    const ready = f.render();
    assert.doesNotMatch(textOf(ready), /上次上传未开始/);
    assert.match(textOf(ready), /当前配置已就绪/);
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
    f.response.runJobs = true;
    flatten(ready).find(node => node.type === 'button' && textOf(node) === '编译并上传').props.onClick();
    const deadline = Date.now() + 2000;
    while (f.hardware.busy) {
      assert.ok(Date.now() < deadline, 'mock upload must terminate');
      await flush();
    }
    assert.deepEqual(f.calls.filter(call => call.method === 'POST').map(call => call.path.split('/').at(-1)), ['builds', 'uploads']);
    assert.equal(f.hardware.job.state, 'succeeded');
    assert.equal(f.session.portId, null);
    return { posts: f.calls.filter(call => call.method === 'POST'), state: f.hardware.job.state };
  });
} catch (error) {
  results.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(join(out, 'native-entry-simulation.json'), JSON.stringify(results, null, 2));
}
