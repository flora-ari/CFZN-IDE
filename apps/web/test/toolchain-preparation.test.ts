import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareController } from '../src/hardware-controller.ts';
import type { HardwareSource } from '../src/hardware-controller.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import type { LinkGuard } from '../src/ccraft-link.ts';
import type { HardwareJob, HardwareProfile, ToolchainJob } from '../src/hardware-types.ts';
import { renderUploadProgress, UploadProgressModel } from '../src/upload-progress.ts';
import { boardSelectionHint, boardToolchainState, renderBoardToolchain } from '../src/board-toolchain-card.ts';

const esp32 = 'esp32-4mb-dio';
const s3 = 'aijite-esp32s3';
const uno = 'arduino-uno';
const plan = 'esp32-2.0.17';
const date = '2026-11-25T00:00:00Z';
const esp32Profile = { id: esp32, deviceId: 'arduinoEsp32', label: 'ESP32', chip: 'esp32', fqbn: 'esp32:esp32:esp32',
  compileAvailable: false, uploadAvailable: false, realtimeAvailable: false } satisfies HardwareProfile;

function makeJob(id: string, profileId = esp32, state: ToolchainJob['state'] = 'running'): ToolchainJob {
  return { id, profileId, planId: plan, state, createdAt: date,
    ...(state === 'running' || state === 'cancelling' ? { phase: 'downloading', progress: { downloadedBytes: 128 } } : { phase: 'complete' }) };
}

type Node = { type: string; props: Record<string, any>; children: unknown[] };
const R = { createElement: (type: string, props: Record<string, any>, ...children: unknown[]): Node => ({ type, props, children }) };
function nodes(root: Node): Node[] {
  return [root, ...root.children.filter((value): value is Node => !!value && typeof value === 'object' && 'type' in value).flatMap(nodes)];
}
const text = (root: Node): string => root.children.map(value => value && typeof value === 'object' && 'type' in value ? text(value as Node) : typeof value === 'string' ? value : '').join('');
function button(root: Node, label: string) { return nodes(root).find(node => node.type === 'button' && (text(node) === label || node.props?.['aria-label']?.startsWith(label + ' '))); }
const deferred = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'expected toolchain observation to complete');
    await new Promise(resolve => setImmediate(resolve));
  }
}

type FixtureState = {
  ready: boolean; catalogMode: 'current' | 'legacy'; activeId: string | null; currentJob?: ToolchainJob; expired: boolean;
  postLost: boolean; cancelLost: boolean; readsOffline: boolean; overrideJobRead?: () => Promise<Response>;
  overridePortsRead?: () => Promise<Response>;
  overrideCatalogRead?: () => Promise<Response>;
  overrideCapabilitiesRead?: () => Promise<Response>;
  catalogState?: 'missing' | 'ready' | 'failed';
  deviceId: string | null; code: string; generationError?: string; ports: { portId: string; displayName: string }[];
  holdSerial: boolean;
  s3Plan?: string;
};

async function fixture(initial: Partial<FixtureState> = {}) {
  const state: FixtureState = {
    ready: false, catalogMode: 'current', activeId: null, expired: false, postLost: false, cancelLost: false,
    readsOffline: false, deviceId: 'arduinoEsp32', code: '', generationError: '无源码',
    ports: [{ portId: 'COM-MOCK', displayName: 'Mock serial port' }], holdSerial: false, ...initial,
  };
  const source: HardwareSource = {
    deviceId: state.deviceId, code: state.code, documentId: 1, editVersion: 1, moduleIds: [], realtime: false,
    ...(state.generationError ? { generationError: state.generationError } : {}),
  };
  const calls: { method: string; path: string; afterLog: string | null; body?: unknown }[] = [];
  let buildSeq = 0;
  let uploadSeq = 0;
  const hwJobs = new Map<string, HardwareJob>();
  const request: typeof fetch = async (url, init) => {
    const address = new URL(String(url)), path = address.pathname, method = init?.method ?? 'GET';
    calls.push({ method, path, afterLog: address.searchParams.get('afterLog'), body: init?.body && JSON.parse(String(init.body)) });
    const capability = {
      protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: '1.4.1', description: '' },
      profiles: [
        { ...esp32Profile, compileAvailable: state.ready, uploadAvailable: state.ready },
        { ...esp32Profile, id: s3, deviceId: 'aijiteESP32S3', label: 'Aijite ESP32-S3', chip: 'esp32s3',
          compileAvailable: state.ready, uploadAvailable: state.ready },
        { ...esp32Profile, id: uno, deviceId: 'arduinoUno', label: 'Arduino Uno', chip: 'avr',
          compileAvailable: true, uploadAvailable: true },
      ],
    };
    if (path === '/capabilities') return state.overrideCapabilitiesRead ? state.overrideCapabilitiesRead() : Response.json(capability);
    if (path === '/ports') return state.overridePortsRead ? state.overridePortsRead() : Response.json({ items: state.ports });
    if (path === '/toolchains') {
      if (state.overrideCatalogRead) return state.overrideCatalogRead();
      if (state.catalogMode === 'legacy') return new Response(null, { status: 404 });
      const currentState = (profileId: string) => state.catalogState ?? (state.ready ? 'ready' :
        state.activeId && state.currentJob?.profileId === profileId ? 'preparing' :
        state.currentJob?.profileId === profileId && state.currentJob.state === 'failed' ? 'failed' : 'missing');
      return Response.json({ supported: true, activeJobId: state.activeId, profiles: [
        ...[esp32, s3].map(profileId => ({ profileId, planId: profileId === s3 ? state.s3Plan ?? plan : plan, state: currentState(profileId), installable: true })),
        { profileId: uno, planId: 'avr-1.8.6', state: 'ready', installable: false, reason: '已有自定义绑定' },
      ] });
    }
    if (path === '/toolchains/prepare') {
      const body = init?.body ? JSON.parse(String(init.body)) : { profileId: esp32 };
      state.activeId = 'task';
      state.currentJob = { ...makeJob('task', body.profileId ?? esp32), planId: body.profileId === s3 ? state.s3Plan ?? plan : plan };
      if (state.postLost) throw new TypeError('prepare response lost');
      return Response.json({ job: state.currentJob }, { status: 202 });
    }
    if (path.endsWith('/cancel') && path.startsWith('/toolchains/jobs/')) {
      if (state.cancelLost) throw new TypeError('cancel response lost');
      state.currentJob = { ...state.currentJob!, state: 'cancelling' };
      return Response.json({ job: state.currentJob });
    }
    if (path.startsWith('/toolchains/jobs/')) {
      if (state.overrideJobRead) return state.overrideJobRead();
      if (state.readsOffline) throw new TypeError('read unavailable');
      if (state.expired) return new Response(null, { status: 404 });
      const afterLog = Number(address.searchParams.get('afterLog'));
      return Response.json({ job: state.currentJob, logs: afterLog === 0 ? [{ index: 0, stream: 'stdout', text: 'download\n' }] : [], nextLog: 1 });
    }
    if (path === '/builds') {
      const id = `build-${++buildSeq}`;
      const body = JSON.parse(String(init?.body ?? '{}'));
      const job: HardwareJob = { id, kind: 'build', state: 'succeeded', stage: 'complete',
        deviceId: body.deviceId, profileId: body.profileId, sourceHash: 'h', createdAt: date };
      hwJobs.set(id, job);
      return Response.json({ job }, { status: 202 });
    }
    if (path === '/uploads') {
      const id = `upload-${++uploadSeq}`;
      const body = JSON.parse(String(init?.body ?? '{}'));
      const job: HardwareJob = { id, kind: 'upload', state: 'succeeded', stage: 'complete',
        deviceId: source.deviceId as any, profileId: esp32, sourceHash: 'h', createdAt: date, buildId: body.buildId, portId: body.portId };
      hwJobs.set(id, job);
      return Response.json({ job }, { status: 202 });
    }
    if (path.startsWith('/jobs/')) {
      const id = path.slice('/jobs/'.length);
      return Response.json({ job: hwJobs.get(id), logs: [], nextLog: 0 });
    }
    throw new Error(`unexpected request ${method} ${path}`);
  };
  let instance: string | undefined = 'first';
  let publish: () => void = () => {};
  const link: LinkGuard = {
    get instanceId() { return instance; },
    get reason() { return instance ? '' : 'link offline'; },
    async ensureReady() { if (!instance) throw new Error('link offline'); },
    subscribe(listener) { publish = listener; return () => {}; },
  };
  let serialClosed = 0;
  let serialReopened = 0;
  const mockPort: any = {
    readable: new ReadableStream({ start() {} }),
    writable: new WritableStream({ write() {} }),
    open: async () => { serialReopened++; },
    close: async () => { serialClosed++; },
    addEventListener() {},
    removeEventListener() {},
    getInfo: () => ({}),
    connectionInfo: { id: 'local:COM-MOCK', label: 'COM-MOCK', name: 'Mock', source: 'local', portId: 'COM-MOCK', confirmed: true },
  };
  const session = new HardwareSession({ getPorts: async () => [mockPort], requestPort: async () => mockPort });
  if (state.holdSerial) {
    await session.refresh();
    await session.open('local:COM-MOCK', session.options);
    serialReopened = 0;
  }
  const hardware = new HardwareController(session, () => source, 'http://link.test', () => {}, request, async () => {});
  hardware.setLinkGuard(link);
  const model = new UploadProgressModel(hardware);
  const view = () => renderUploadProgress(R, model, { start: upload => model.start(upload), onClose: () => {},
    downloadUrl: '/downloads/CCraft-Link-Setup.exe' });
  await hardware.refresh();
  await new Promise(resolve => setImmediate(resolve));
  const cardView = (deviceId = source.deviceId!) => { const card = renderBoardToolchain(R, hardware, deviceId, deviceId, () => {}); return R.createElement('div', {}, card.decoration); };
  return {
    hardware, session, state, source, calls, view, cardView, model, toolchains: hardware.toolchains,
    get serialClosed() { return serialClosed; }, get serialReopened() { return serialReopened; },
    setInstance: (id?: string) => { instance = id; publish(); },
  };
}

test('current-board auto download moves real progress to its card and refreshes capabilities', async () => {
  const { hardware, session, source, state, calls, toolchains, view, cardView } = await fixture();
  try {
    // Existing auto preparation for the current board is displayed on its card.
    await until(() => toolchains.busy && calls.some(call => call.path === '/toolchains/prepare'));
    assert.equal(hardware.portId, '');
    assert.equal(hardware.profileId, esp32);
    assert.equal(hardware.job, null);
    // Missing/preparing profile no longer blocks compile/upload due to missing toolchain; only source/port guards apply.
    assert.equal(hardware.startDisabledReason(false), '无源码');
    await assert.rejects(hardware.applySerialSettings({ options: session.options }), /正在安装/);
    await assert.rejects(session.write(new Uint8Array([1])), /正在安装/);
    assert.doesNotThrow(() => hardware.assertDocumentIdle());
    assert.equal(nodes(cardView()).find(node => node.type === 'progress')?.props.value, undefined, 'unknown total is indeterminate');
    state.currentJob = { ...makeJob('task'), progress: { downloadedBytes: 512, totalBytes: 2048 } };
    await toolchains.refresh();
    assert.equal(nodes(cardView()).find(node => node.type === 'progress')?.props.value, 512);
    assert.equal(nodes(cardView()).find(node => node.type === 'progress')?.props.max, 2048);
    assert.match(text(cardView()), /25%/);
    assert.equal(toolchains.snapshot().logs.length, 1);
    assert.deepEqual(calls.filter(call => call.path === '/toolchains/jobs/task').map(call => call.afterLog), ['0', '1']);
    source.deviceId = 'aijiteESP32S3';
    source.code = 'void setup(){} void loop(){}';
    source.generationError = undefined;
    hardware.changed();
    hardware.configure(s3, 'COM-MOCK');
    assert.equal(toolchains.snapshot().job?.profileId, esp32, 'task remains associated with its original profile');
    state.currentJob = makeJob('task', esp32, 'succeeded'); state.activeId = null; state.ready = true;
    await toolchains.refresh();
    assert.equal(toolchains.busy, false);
    assert.equal(hardware.startDisabledReason(true), '');
    // Simplified modal: ready profile hides install/retry buttons.
    assert.equal(button(view(), '安装此主控编译环境'), undefined);
    assert.equal(button(view(), '重试下载'), undefined);
    assert.deepEqual([hardware.profileId, hardware.portId, source.code], [s3, 'COM-MOCK', 'void setup(){} void loop(){}']);
    assert.deepEqual(calls.filter(call => call.method === 'POST').map(({ path, body }) => [path, body]),
      [['/toolchains/prepare', { profileId: esp32 }]]);
  } finally { toolchains.dispose(); }
});

test('card download never closes serial and refresh alone cannot retry cancelled/failed tasks', async () => {
  const { hardware, session, source, state, calls, toolchains, view, cardView } = await fixture({ holdSerial: true });
  try {
    // Active serial session blocks background auto-prepare.
    assert.equal(calls.filter(call => call.path === '/toolchains/prepare').length, 0);
    assert.equal(toolchains.busy, false);
    assert.match(hardware.prepareDisabledReason(), /请先断开串口/);
    await assert.rejects(hardware.prepareToolchain(), /断开串口/);
    await session.close();
    // The already-authorized current-board auto prepare still runs on a board switch.
    source.deviceId = 'aijiteESP32S3';
    hardware.changed();

    await until(() => calls.filter(call => call.path === '/toolchains/prepare').length === 1);
    assert.deepEqual(calls.find(call => call.path === '/toolchains/prepare')?.body, { profileId: s3 });
    // User cancels -> card shows retry, and repeated refreshes do not auto-retry in a loop.
    await toolchains.cancel();
    await toolchains.refresh();
    state.activeId = null; state.currentJob = makeJob('task', s3, 'cancelled');
    await toolchains.refresh();
    assert.equal(toolchains.busy, false);
    assert.ok(button(cardView(), '重试下载'), 'cancelled install shows retry button');
    await hardware.refresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.filter(call => call.path === '/toolchains/prepare').length, 1, 'no auto-retry loop after cancel');
    // Switching away and back permits one fresh auto attempt, as before.
    source.deviceId = 'arduinoUno';
    hardware.changed();
    await new Promise(resolve => setImmediate(resolve));
    source.deviceId = 'aijiteESP32S3';
    hardware.changed();

    await until(() => calls.filter(call => call.path === '/toolchains/prepare').length === 2);
    // Failure also stops auto-retry loop.
    state.activeId = null; state.currentJob = { ...makeJob('task', s3, 'failed'), error: { code: 'NET', message: '下载失败' } };
    await toolchains.refresh();
    await hardware.refresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.filter(call => call.path === '/toolchains/prepare').length, 2, 'no auto-retry loop after failure');
    assert.ok(button(cardView(), '重试下载'), 'failed install shows retry button');
  } finally { toolchains.dispose(); }
});

test('one-click upload releases serial, prepares missing profile, refreshes capabilities, and continues to build and upload', async () => {
  const f = await fixture({
    holdSerial: true,
    code: 'void setup(){} void loop(){}',
    generationError: undefined,
  });
  const { hardware, state, calls, toolchains, view } = f;
  try {
    hardware.configure(esp32, 'COM-MOCK');
    // Buttons are enabled even while profile is missing & installable.
    assert.equal(hardware.startDisabledReason(false), '');
    assert.equal(hardware.startDisabledReason(true), '');
    assert.equal(button(view(), '编译检查')?.props.disabled, false);
    assert.equal(button(view(), '编译并上传')?.props.disabled, false);

    // Click upload once -> releases serial -> prepares -> waits -> builds -> uploads -> restores serial.
    await hardware.start(true);
    await until(() => calls.some(call => call.path === '/toolchains/prepare'));
    assert.equal(f.serialClosed, 1, 'serial released before prepare');
    assert.equal(hardware.snapshot().use, 'preparing');
    assert.equal(hardware.snapshot().pendingAction, 'upload');
    assert.match(text(view()), /编译环境准备完成后将自动开始编译并上传/);

    // Complete prepare -> capabilities become ready -> continuation runs build + upload automatically.
    state.activeId = null;
    state.currentJob = makeJob('task', esp32, 'succeeded');
    state.ready = true;
    await toolchains.refresh();
    await until(() => !hardware.busy);

    assert.equal(hardware.error, '');
    assert.equal(hardware.job?.kind, 'upload');
    assert.equal(hardware.job?.state, 'succeeded');
    assert.equal(f.serialReopened, 1, 'serial restored after upload');
    assert.deepEqual(
      calls.filter(call => call.method === 'POST').map(call => call.path),
      ['/toolchains/prepare', '/builds', '/uploads'],
    );
  } finally { toolchains.dispose(); }
});

test('one-click compile joins in-flight card prepare without duplicate POST and continues automatically', async () => {
  const { hardware, state, calls, toolchains, view } = await fixture({
    code: 'void setup(){} void loop(){}',
    generationError: undefined,
  });
  try {
    await until(() => toolchains.busy && calls.filter(call => call.path === '/toolchains/prepare').length === 1);
    // Compile button is enabled while background prepare for the same profile is running.
    assert.equal(hardware.startDisabledReason(false), '');
    await hardware.start(false);
    assert.equal(hardware.snapshot().use, 'preparing');
    assert.equal(hardware.snapshot().pendingAction, 'compile');
    assert.match(text(view()), /编译环境准备完成后将自动开始编译检查/);
    assert.equal(calls.filter(call => call.path === '/toolchains/prepare').length, 1, 'joins active prepare without second POST');

    state.activeId = null;
    state.currentJob = makeJob('task', esp32, 'succeeded');
    state.ready = true;
    await toolchains.refresh();
    await until(() => !hardware.busy);

    assert.equal(hardware.error, '');
    assert.equal(hardware.job?.kind, 'build');
    assert.equal(hardware.job?.state, 'succeeded');
    assert.deepEqual(
      calls.filter(call => call.method === 'POST').map(call => call.path),
      ['/toolchains/prepare', '/builds'],
    );
  } finally { toolchains.dispose(); }
});

test('continuation aborts safely on cancel, Link offline, or context change without posting stale build/upload', async () => {
  // 1. User cancels during preparation -> no build/upload posted.
  {
    const { hardware, state, calls, toolchains } = await fixture({
      code: 'void setup(){} void loop(){}',
      generationError: undefined,
    });
    try {
      await until(() => toolchains.busy);
      await hardware.start(false);
      await hardware.cancel();
      state.activeId = null; state.currentJob = makeJob('task', esp32, 'cancelled');
      await toolchains.refresh();
      await until(() => !hardware.busy);
      assert.match(hardware.error, /已取消/);
      assert.equal(calls.some(call => call.path === '/builds' || call.path === '/uploads'), false);
    } finally { toolchains.dispose(); }
  }

  // 2. Link goes offline during preparation -> waitUntilIdle unblocks and aborts cleanly.
  {
    const { hardware, calls, toolchains, setInstance } = await fixture({
      code: 'void setup(){} void loop(){}',
      generationError: undefined,
    });
    try {
      await until(() => toolchains.busy);
      await hardware.start(false);
      setInstance(undefined);
      await until(() => !hardware.busy);
      assert.match(hardware.error, /已离线/);
      assert.equal(calls.some(call => call.path === '/builds'), false);
    } finally { toolchains.dispose(); }
  }

  // 3. Code changes during preparation -> aborts continuation cleanly.
  {
    const { hardware, source, state, calls, toolchains } = await fixture({
      code: 'void setup(){} void loop(){}',
      generationError: undefined,
    });
    try {
      await until(() => toolchains.busy);
      await hardware.start(false);
      source.code = 'void setup(){ pinMode(2, OUTPUT); } void loop(){}';
      source.editVersion = 2;
      state.activeId = null; state.currentJob = makeJob('task', esp32, 'succeeded'); state.ready = true;
      await toolchains.refresh();
      await until(() => !hardware.busy);
      assert.match(hardware.error, /已变化/);
      assert.equal(calls.some(call => call.path === '/builds'), false);
    } finally { toolchains.dispose(); }
  }
});

test('lost prepare and cancelling responses reconcile by active task, holding ownership until a terminal read', async () => {
  const { hardware, state, calls, toolchains } = await fixture({ postLost: true, cancelLost: true });
  try {
    // The explicit fixture action posted once and reconciled its lost response.
    await until(() => toolchains.snapshot().job?.id === 'task');
    assert.equal(toolchains.busy, true);
    state.readsOffline = true;
    await toolchains.cancel();
    await toolchains.refresh();
    assert.match(toolchains.snapshot().error, /结果尚未确认|取消尚未确认/);
    assert.equal(toolchains.busy, true);
    await hardware.prepareToolchain(); // Same-profile requests observe the existing job without another POST.
    state.readsOffline = false; state.cancelLost = false;
    await toolchains.cancel();
    await toolchains.refresh();
    assert.equal(toolchains.snapshot().job?.state, 'cancelling');
    assert.equal(toolchains.snapshot().cancelAvailable, false);
    assert.equal(toolchains.busy, true);
    state.activeId = null; state.currentJob = makeJob('task', esp32, 'cancelled');
    await toolchains.refresh();
    assert.equal(toolchains.busy, false);
    assert.match(toolchains.snapshot().message, /已取消/);
    assert.deepEqual(calls.filter(call => call.method === 'POST').map(({ path, body }) => [path, body]), [
      ['/toolchains/prepare', { profileId: esp32 }], ['/toolchains/jobs/task/cancel', {}], ['/toolchains/jobs/task/cancel', {}],
    ]);
  } finally { toolchains.dispose(); }
});

test('unknown task history checks its own profile, and a failed install can be retried explicitly', async () => {
  const { hardware, state, calls, toolchains } = await fixture();
  try {
    await until(() => toolchains.busy && calls.filter(call => call.path === '/toolchains/prepare').length === 1);
    const initialChecks = calls.filter(call => call.path === '/capabilities').length;
    state.activeId = null; state.expired = true;
    await toolchains.refresh();
    assert.match(toolchains.snapshot().error, /没有正在进行的安装任务/);
    assert.equal(toolchains.snapshot().job, null);
    assert.equal(calls.filter(call => call.path === '/capabilities').length, initialChecks, 'unrelated ready Uno does not validate ESP32');
    assert.equal(toolchains.busy, false);
    state.expired = false;
    await hardware.prepareToolchain();
    state.activeId = null; state.currentJob = { ...makeJob('task', esp32, 'failed'),
      error: { code: 'CHECKSUM', message: '摘要校验失败' } };
    await toolchains.refresh();
    assert.equal(toolchains.snapshot().job?.error?.message, '摘要校验失败');
    assert.equal(hardware.prepareDisabledReason(), '');
    assert.equal(calls.filter(call => call.path === '/toolchains/prepare').length, 2);
  } finally { toolchains.dispose(); }
});

test('other clients are observed; Link restart rejects stale responses and an old version offers the installer', async () => {
  const { hardware, state, calls, toolchains, setInstance, view } = await fixture({ activeId: 'external', currentJob: makeJob('external', s3) });
  try {
    assert.equal(toolchains.snapshot().job?.profileId, s3);
    assert.equal(hardware.prepareDisabledReason(), '', 'same shared plan may observe the existing task');
    const pending = deferred();
    state.overrideJobRead = () => pending.promise;
    const previous = toolchains.refresh();
    await until(() => calls.filter(call => call.path === '/toolchains/jobs/external').length === 2);
    setInstance();
    assert.equal(toolchains.busy, true);
    assert.match(toolchains.snapshot().message, /等待 CCraft Link 恢复/);
    state.overrideJobRead = undefined; state.catalogMode = 'legacy'; state.activeId = null;
    setInstance('second');
    await toolchains.refresh();
    assert.equal(toolchains.snapshot().support, 'legacy');
    assert.equal(toolchains.busy, false);
    assert.match(toolchains.snapshot().message, /请更新 CCraft Link/);
    pending.resolve(Response.json({ job: makeJob('external', s3, 'succeeded'), logs: [], nextLog: 1 }));
    await previous;
    assert.equal(toolchains.snapshot().job, null);
    assert.equal(nodes(view()).find(node => node.type === 'a')?.props.href, '/downloads/CCraft-Link-Setup.exe');
    // Simplified modal: legacy Link shows upgrade download link, no install button.
    assert.equal(button(view(), '安装此主控编译环境'), undefined);
    assert.equal(button(view(), '重试下载'), undefined);
    assert.equal(calls.some(call => call.method === 'POST'), false);
  } finally { toolchains.dispose(); }
});

test('target card download leaves current board/profile/port/source intact, and completion never selects it', async () => {
  const f = await fixture({ deviceId: 'arduinoUno', generationError: undefined, code: '// retain this work' });
  const { hardware, source, state, calls, toolchains, cardView, view } = f;
  try {
    hardware.configure(uno, 'COM-MOCK');
    const before = JSON.stringify(source);
    assert.match(boardSelectionHint(hardware, 'arduinoEsp32'), /请先点击/);
    assert.equal(boardSelectionHint(hardware, 'arduinoNano'), '', 'unsupported profiles keep original offline editing');
    const download = button(cardView('arduinoEsp32'), '下载')!;
    assert.equal(download.props.disabled, false);
    download.props.onClick({ stopPropagation() {} });
    download.props.onClick({ stopPropagation() {} });
    await until(() => toolchains.snapshot().job?.profileId === esp32);
    assert.equal(calls.filter(c => c.path === '/toolchains/prepare').length, 1);
    assert.deepEqual([source.deviceId, hardware.profileId, hardware.portId], ['arduinoUno', uno, 'COM-MOCK']);
    assert.equal(JSON.stringify(source), before);
    assert.equal(boardToolchainState(hardware, 'arduinoUno').busy, false);
    assert.equal(boardToolchainState(hardware, 'arduinoEsp32').busy, true);
    assert.equal(boardToolchainState(hardware, 'aijiteESP32S3').shared, true);
    // Recreating a card view does not destroy/duplicate its task or its unknown-total progress.
    assert.equal(nodes(cardView('arduinoEsp32')).find(n => n.type === 'progress')?.props.value, undefined);
    await hardware.prepareBoardToolchain('aijiteESP32S3');
    assert.equal(calls.filter(c => c.path === '/toolchains/prepare').length, 1, 'same plan observes original task');
    assert.equal(nodes(view()).some(n => n.props?.['data-testid'] === 'toolchain-preparation'), false);
    assert.equal(nodes(view()).some(n => n.props?.['aria-label'] === '编译环境安装日志'), false);
    f.setInstance(undefined);
    assert.match(boardToolchainState(hardware, 'arduinoEsp32').message, /等待 CCraft Link 恢复/);
    assert.equal(boardSelectionHint(hardware, 'arduinoNano'), '');
    assert.equal(boardToolchainState(hardware, 'arduinoEsp32').ready, false);
    f.setInstance('first'); await toolchains.refresh();
    state.ready = true; state.activeId = null; state.currentJob = makeJob('task', esp32, 'succeeded');
    await toolchains.refresh();
    assert.equal(boardSelectionHint(hardware, 'arduinoEsp32'), '', 'only a later user click can now take the original select path');
    assert.equal(button(cardView('arduinoEsp32'), '下载'), undefined);
    await hardware.prepareBoardToolchain('arduinoEsp32');
    assert.equal(calls.filter(c => c.path === '/toolchains/prepare').length, 1, 'ready target never redownloads');
    assert.deepEqual([source.deviceId, hardware.profileId, hardware.portId, JSON.stringify(source)], ['arduinoUno', uno, 'COM-MOCK', before]);
  } finally { toolchains.dispose(); }
});

test('different-plan card is blocked without cancelling a job; serial-held download cannot close the port', async () => {
  const f = await fixture({ deviceId: 'arduinoUno', s3Plan: 'independent-s3-plan', holdSerial: true });
  try {
    await assert.rejects(f.hardware.prepareBoardToolchain('arduinoEsp32'), /先断开串口/);
    assert.equal(f.serialClosed, 0);
    assert.equal(f.calls.some(c => c.method === 'POST'), false);
    await f.session.close();
    await f.hardware.prepareBoardToolchain('arduinoEsp32');
    assert.equal(boardToolchainState(f.hardware, 'aijiteESP32S3').busy, false);
    await assert.rejects(f.hardware.prepareBoardToolchain('aijiteESP32S3'), /正在安装/);
    assert.equal(f.toolchains.snapshot().profileId, esp32);
    assert.equal(f.calls.some(c => c.path.endsWith('/cancel')), false);
  } finally { f.toolchains.dispose(); }
});

test('compile waits for a shared-plan task without a duplicate prepare, then uses its own profile', async () => {
  const f = await fixture({ deviceId: 'aijiteESP32S3', code: 'void setup(){}', generationError: undefined,
    activeId: 'external', currentJob: makeJob('external', esp32) });
  try {
    assert.equal(f.hardware.startDisabledReason(false), '');
    await f.hardware.start(false);
    assert.equal(f.hardware.snapshot().pendingAction, 'compile');
    assert.equal(f.calls.some(c => c.method === 'POST'), false);
    f.state.activeId = null; f.state.currentJob = makeJob('external', esp32, 'succeeded'); f.state.ready = true;
    await f.toolchains.refresh(); await until(() => !f.hardware.busy);
    const build = f.calls.find(c => c.path === '/builds');
    assert.equal((build?.body as any)?.profileId, s3);
    assert.equal(f.calls.filter(c => c.path === '/toolchains/prepare').length, 0);
    assert.equal(f.hardware.error, '');
  } finally { f.toolchains.dispose(); }
});

test('a restarted Link or project change during the final port read aborts the prepared continuation', async () => {
  const f = await fixture({ code: 'void setup(){}', generationError: undefined });
  try {
    await f.hardware.start(false);
    f.state.ready = true; f.state.activeId = null; f.state.currentJob = makeJob('task', esp32, 'succeeded');
    f.setInstance('new-instance'); await f.toolchains.refresh();
    await until(() => !f.hardware.busy);
    assert.match(f.hardware.error, /实例已变化|状态已变化/);
    assert.equal(f.calls.some(c => c.path === '/builds'), false);
  } finally { f.toolchains.dispose(); }
  const g = await fixture({ code: 'void setup(){}', generationError: undefined });
  try {
    g.hardware.configure(esp32, 'COM-MOCK');
    await g.hardware.start(true);
    const ports = deferred(); g.state.overridePortsRead = () => ports.promise;
    const reads = g.calls.filter(c => c.path === '/ports').length;
    g.state.ready = true; g.state.activeId = null; g.state.currentJob = makeJob('task', esp32, 'succeeded');
    await g.toolchains.refresh();
    await until(() => g.calls.filter(c => c.path === '/ports').length > reads);
    g.source.editVersion++;
    ports.resolve(Response.json({ items: g.state.ports }));
    await until(() => !g.hardware.busy);
    assert.match(g.hardware.error, /已变化/);
    assert.equal(g.calls.some(c => c.path === '/builds' || c.path === '/uploads'), false);
  } finally { g.toolchains.dispose(); }
});

test('card downloads in programming/realtime modes without a selected board, source or OS port', async () => {
  for (const realtime of [false, true]) {
    const f = await fixture({ deviceId: null, code: '' });
    try {
      f.source.programming = true; f.source.realtime = realtime;
      const before = JSON.stringify(f.source);
      assert.equal(f.hardware.profileId, ''); assert.equal(f.hardware.portId, '');
      await f.hardware.prepareBoardToolchain('arduinoEsp32');
      assert.equal(f.toolchains.snapshot().profileId, esp32);
      assert.equal(JSON.stringify(f.source), before);
      assert.equal(f.hardware.profileId, ''); assert.equal(f.hardware.portId, '');
      assert.deepEqual(f.calls.filter(c => c.method === 'POST').map(c => c.path), ['/toolchains/prepare']);
    } finally { f.toolchains.dispose(); }
  }
});

test('only confirmed missing cards have download controls; ready and unknown cards have no decoration', async () => {
  const f = await fixture({ deviceId: 'arduinoUno' });
  const render = (id: string) => renderBoardToolchain(R, f.hardware, id, id, () => {});
  try {
    const missing = render('arduinoEsp32');
    assert.equal(missing.controls.type, 'button');
    assert.equal(missing.controls.props['aria-label'], '下载 arduinoEsp32 编译环境');
    assert.equal(text(missing.controls), '', 'icon button has no flow text/download label');
    assert.equal(nodes(missing.controls).some(n => n.type === 'svg' && n.props.width === 24), true);
    assert.equal(nodes(missing.decoration).some(n => n.props?.className === 'cfzn-card-download-veil'), true);
    const unsupported = render('arduinoNano');
    assert.equal(unsupported.controls, null);
    assert.equal(unsupported.decoration, null);
    const ready = render('arduinoUno');
    assert.equal(ready.controls, null);
    assert.equal(ready.decoration, null);
    f.setInstance(undefined);
    const unconfirmed = render('arduinoUno');
    assert.equal(unconfirmed.ready, false);
    assert.equal(unconfirmed.controls, null);
    assert.equal(boardSelectionHint(f.hardware, 'arduinoNano'), '');
    assert.equal(unconfirmed.decoration, null);
  } finally { f.toolchains.dispose(); }
});

test('catalog failure and contradictory capabilities stay neutral until successfully reconciled', async () => {
  const f = await fixture({ deviceId: 'arduinoUno' });
  try {
    f.state.overrideCatalogRead = async () => { throw new TypeError('offline catalog'); };
    await f.toolchains.refresh();
    assert.equal(renderBoardToolchain(R, f.hardware, 'arduinoEsp32', 'ESP32', () => {}).decoration, null);
    f.state.overrideCatalogRead = undefined;
    f.state.catalogState = 'ready';
    await f.toolchains.refresh();
    assert.equal(boardToolchainState(f.hardware, 'arduinoEsp32').needsDownload, false);
    assert.equal(boardToolchainState(f.hardware, 'arduinoEsp32').ready, false);
    f.state.catalogState = undefined;
    await f.toolchains.refresh();
    assert.equal(boardToolchainState(f.hardware, 'arduinoEsp32').needsDownload, true);
  } finally { f.toolchains.dispose(); }
});

test('an idle catalog read reconciles readiness changed by another client without preparing again', async () => {
  const f = await fixture({ deviceId: 'arduinoUno' });
  try {
    assert.equal(boardToolchainState(f.hardware, 'arduinoEsp32').needsDownload, true);
    f.state.ready = true;
    await f.toolchains.refresh();
    const restored = renderBoardToolchain(R, f.hardware, 'arduinoEsp32', 'ESP32', () => {});
    assert.equal(restored.ready, true);
    assert.equal(restored.decoration, null);
    assert.equal(f.calls.some(c => c.method === 'POST'), false);
  } finally { f.toolchains.dispose(); }
  const reopened = await fixture({ ready: true });
  try {
    assert.equal(boardToolchainState(reopened.hardware, 'arduinoEsp32').ready, true);
    await reopened.hardware.refresh();
    assert.equal(reopened.calls.some(c => c.method === 'POST'), false);
  } finally { reopened.toolchains.dispose(); }
});

test('late catalog from an earlier connection cannot replace a fresh same-instance observation', async () => {
  const f = await fixture({ deviceId: 'arduinoUno' });
  try {
    const pending = deferred(); let requested = false;
    f.state.overrideCatalogRead = () => { requested = true; return pending.promise; };
    const old = f.toolchains.refresh(); await until(() => requested);
    f.setInstance(undefined);
    assert.equal(boardToolchainState(f.hardware, 'arduinoEsp32').needsDownload, false);
    f.state.overrideCatalogRead = undefined; f.setInstance('first');
    await f.toolchains.refresh();
    assert.equal(boardToolchainState(f.hardware, 'arduinoEsp32').needsDownload, true);
    pending.resolve(Response.json({ supported: true, activeJobId: null, profiles: [] })); await old;
    assert.equal(boardToolchainState(f.hardware, 'arduinoEsp32').needsDownload, true);
    assert.equal(f.calls.some(c => c.method === 'POST'), false);
  } finally { f.toolchains.dispose(); }
});

test('old capability flags cannot certify a new instance or survive a late pre-reconnect response', async () => {
  const f = await fixture({ deviceId: 'arduinoUno' });
  try {
    const pending = deferred(); let requested = false;
    f.state.overrideCapabilitiesRead = () => { requested = true; return pending.promise; };
    const old = f.hardware.checkLocalService(); await until(() => requested);
    f.setInstance(undefined); f.state.overrideCapabilitiesRead = undefined; f.setInstance('second');
    assert.equal(boardToolchainState(f.hardware, 'arduinoUno').ready, false);
    await f.toolchains.refresh();
    pending.resolve(Response.json({ protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: 'old', description: '' }, profiles: [] }));
    await old;
    assert.equal(boardToolchainState(f.hardware, 'arduinoUno').ready, true);
    assert.equal(f.hardware.profiles.length, 3);
    assert.equal(f.calls.some(c => c.method === 'POST'), false);
  } finally { f.toolchains.dispose(); }
});

test('plan changes refresh capability evidence and never reuse old ready evidence alone', async () => {
  const f = await fixture({ deviceId: 'arduinoUno', ready: true });
  try {
    const pending = deferred(); let requested = false;
    f.state.s3Plan = 'new-plan';
    f.state.overrideCapabilitiesRead = () => { requested = true; return pending.promise; };
    const refreshing = f.toolchains.refresh(); await until(() => requested);
    assert.equal(boardToolchainState(f.hardware, 'aijiteESP32S3').ready, false);
    pending.resolve(Response.json({ protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: '1', description: '' },
      profiles: [{ ...esp32Profile, id: s3, deviceId: 'aijiteESP32S3', chip: 'esp32s3', compileAvailable: true, uploadAvailable: true }] }));
    await refreshing;
    assert.equal(boardToolchainState(f.hardware, 'aijiteESP32S3').ready, true);
    assert.equal(f.calls.some(c => c.method === 'POST'), false);
  } finally { f.toolchains.dispose(); }
});

test('cold download bytes stay readable below one percent, without inventing an unknown total or leaking into other phases', async () => {
  const f = await fixture();
  const progressNode = () => nodes(f.cardView()).find(n => n.type === 'progress')!;
  try {
    f.state.currentJob = { ...makeJob('task'), progress: { downloadedBytes: 1_563_002, totalBytes: 878_894_784 } };
    await f.toolchains.refresh();
    assert.match(text(f.cardView()), /0%/);
    assert.match(text(f.cardView()), /已下载 1\.5 MiB \/ 838\.2 MiB/);
    assert.equal(progressNode().props.title, '已下载 1.5 MiB / 838.2 MiB');
    assert.equal(progressNode().props['aria-valuetext'], progressNode().props.title);
    assert.equal(text(progressNode()), progressNode().props.title);
    f.state.currentJob = { ...makeJob('task'), progress: { downloadedBytes: 1_563_002 } };
    await f.toolchains.refresh();
    assert.equal(progressNode().props.title, '已下载 1.5 MiB');
    assert.equal(progressNode().props.value, undefined); assert.equal(progressNode().props.max, undefined);
    assert.doesNotMatch(text(f.cardView()), /838\.2|%|MiB \//);
    f.state.currentJob = { ...makeJob('task'), phase: 'installing', progress: { downloadedBytes: 1_563_002, totalBytes: 878_894_784 } };
    await f.toolchains.refresh();
    assert.equal(progressNode().props.title, undefined);
    assert.equal(progressNode().props['aria-valuetext'], undefined);
    assert.doesNotMatch(text(f.cardView()), /已下载|MiB/);
  } finally { f.toolchains.dispose(); }
});
