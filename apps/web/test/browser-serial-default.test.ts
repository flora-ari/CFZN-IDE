import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSerialLike, SerialSources } from '../src/local-serial.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import { HardwareController } from '../src/hardware-controller.ts';
import { SerialDevicePanel } from '../src/serial-device-panel.ts';
import { NativeSerialSocket } from '../src/native-serial-socket.ts';
import { makeConnectionView, renderConnectionPanel } from '../src/connection-modal.ts';
import { BrowserPortMock, fixture as localFixture, until } from './local-serial-fixture.ts';
import type { SerialLike, SerialPortLike } from '../src/serial.ts';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject };
}
type Element = { type: string; props: Record<string, any>; children: any[] };
const R = { createElement: (type: string, props: any, ...children: any[]): Element => ({ type, props: props ?? {}, children }) };
const elements = (root: Element): Element[] => [root, ...root.children.filter(value => value && typeof value === 'object').flatMap(elements)];
const text = (root: Element): string => root.children.map(value => value && typeof value === 'object' ? text(value) : typeof value === 'string' ? value : '').join('');
function fixture() {
  const a = new BrowserPortMock(), b = new BrowserPortMock(), fresh = new BrowserPortMock();
  let chooserCalls = 0, scans = 0, http = 0;
  let choice = () => Promise.resolve<SerialPortLike>(fresh), list = async (): Promise<SerialPortLike[]> => [a, b];
  const browser: SerialLike = { requestPort: () => { chooserCalls++; return choice(); }, getPorts: () => { scans++; return list(); } };
  const local = new LocalSerialLike('http://mock/api/v1/hardware', async () => { http++; throw new TypeError('Failed to fetch'); });
  const sources = new SerialSources(local, browser), session = new HardwareSession(sources);
  const current = { deviceId: 'arduinoEsp32', code: 'void setup(){}', documentId: 1, editVersion: 1, moduleIds: [], realtime: false };
  const hardware = new HardwareController(session, () => current, local.base, () => {}, async () => { http++; throw new TypeError('Failed to fetch'); });
  const panel = new SerialDevicePanel(hardware, sources, (id, options) => hardware.applySerialSettings({ browserPortId: id, options }), () => { hardware.assertIdle(); return session.close(); });
  return { a, b, fresh, local, sources, session, hardware, panel, current,
    chooserCalls: () => chooserCalls, scans: () => scans, http: () => http,
    browserRows: () => session.ports.filter(port => !port.source), refreshBrowser: () => session.refresh('browser'),
    setChoice: (value: () => Promise<SerialPortLike>) => { choice = value; }, setList: (value: () => Promise<SerialPortLike[]>) => { list = value; },
    close: async () => { await session.close().catch(() => {}); local.dispose(); } };
}

test('panel construction, opening, refresh and native discovery stay local and never request browser permission or enumerate candidates', async () => {
  const f = fixture(); let localScans = 0, effect!: () => () => void;
  f.local.getPorts = async () => { localScans++; return []; };
  const socket = new NativeSerialSocket(f.hardware), messages: any[] = [];
  try {
    assert.equal(f.panel.source, 'local'); assert.equal(f.scans(), 0); assert.equal(f.chooserCalls(), 0);
    const View = makeConnectionView({ ...R, useState: () => [0, () => {}], useEffect: (callback: () => () => void) => { effect = callback; } }, f.panel);
    View(); const unmount = effect(); await until(() => localScans === 1 && !f.session.scanning); unmount();
    await f.panel.refresh(); assert.equal(localScans, 2); assert.equal(f.scans(), 0);
    await f.refreshBrowser(); assert.equal(f.browserRows().length, 2); assert.equal(f.panel.rows.length, 0);
    socket.setHandleMessage(message => messages.push(message)); socket.open(); socket.sendMessage({ id: 1, method: 'discover' });
    await until(() => messages.some(message => message.id === 1)); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(localScans, 3); assert.equal(f.scans(), 1); assert.equal(f.chooserCalls(), 0);
    assert.equal(messages.some(message => message.method === 'didDiscoverPeripheral'), false);
    const tree = renderConnectionPanel(R, f.panel);
    assert.match(text(tree), /本机串口服务/); assert.doesNotMatch(text(tree), /连接新设备|首次|已授权设备会自动|切换列表来源|授权浏览器串口/);
    assert.equal(elements(tree).some(node => node.type === 'button' && ['本机直连', '浏览器串口'].includes(text(node))), false);
    assert.equal(f.a.opens + f.b.opens + f.fresh.opens, 0);
  } finally { socket.close(); await f.close(); }
});

test('a legacy browser handle remains visible and release-only through local refresh and failed close, then disappears after confirmed release', async () => {
  const f = fixture(); let closeFails = true;
  f.a.close = async () => { if (closeFails) throw new Error('mock browser close still held'); f.a.closes++; };
  try {
    await f.refreshBrowser(); const id = f.browserRows()[0].id; f.panel.edit(id, '57600'); await f.panel.activate(id);
    await f.panel.refresh(); assert.equal(f.session.portId, id); assert.equal(f.session.options.baudRate, 57600); assert.equal(f.a.closes, 0);
    let row = elements(renderConnectionPanel(R, f.panel)).find(node => node.type === 'tr' && node.props['data-port-id'] === id)!;
    assert.ok(row); assert.match(text(row), /保留的已有连接|57600/); assert.equal(elements(row).some(node => node.type === 'input'), false);
    assert.deepEqual(elements(row).filter(node => node.type === 'button').map(text), ['断开']);
    await assert.rejects(f.panel.disconnectRow(id), /mock browser close still held/);
    row = elements(renderConnectionPanel(R, f.panel)).find(node => node.type === 'tr' && node.props['data-port-id'] === id)!;
    assert.ok(row); assert.match(text(row), /待释放|状态待确认/); assert.deepEqual(elements(row).filter(node => node.type === 'button').map(text), ['重试断开']);
    f.hardware.busy = true; await assert.rejects(f.panel.disconnectRow(id), /硬件作业/); f.hardware.busy = false;
    assert.equal(f.session.portId, id); closeFails = false; await f.panel.disconnectRow(id);
    assert.equal(f.panel.rows.length, 0); assert.equal(f.session.portId, null); assert.equal(f.chooserCalls(), 0);
  } finally { closeFails = false; f.hardware.busy = false; await f.close(); }
});

// These explicit browser paths preserve underlying transport compatibility; they are no longer panel entry points.
test('explicit browser enumeration and native compatibility discovery remain independent of a pending local adapter', async () => {
  const f = fixture(), waiting = deferred<SerialPortLike[]>(), messages: any[] = [], socket = new NativeSerialSocket(f.hardware);
  let localScans = 0; f.local.getPorts = () => { localScans++; return waiting.promise; };
  const pendingLocal = f.sources.getPorts('local');
  try {
    await f.refreshBrowser(); assert.equal(f.browserRows().length, 2); assert.equal(localScans, 1);
    await f.panel.activate(f.browserRows()[1].id); assert.equal(f.b.opens, 1); assert.equal(f.http(), 0); assert.equal(f.chooserCalls(), 0);
    socket.discoverySource = 'browser'; socket.setHandleMessage(message => messages.push(message)); socket.open(); socket.sendMessage({ id: 1, method: 'discover' });
    await until(() => messages.some(message => message.id === 1)); assert.equal(localScans, 1);
  } finally { waiting.resolve([]); await pendingLocal; socket.close(); await f.close(); }
});

test('internal browser selection keeps its first-gesture call, uses the selected row settings and avoids reopening the same object', async () => {
  const f = fixture(), selected = deferred<SerialPortLike>(); let clicking = false;
  f.setChoice(() => { assert.equal(clicking, true); return selected.promise; });
  try {
    await f.refreshBrowser(); const old = f.browserRows()[0].id; f.panel.edit(old, '9600'); await f.panel.activate(old);
    clicking = true; const selecting = f.panel.connectNewDevice(); clicking = false; assert.equal(f.chooserCalls(), 1); assert.equal(f.a.closes, 0);
    selected.resolve(f.fresh); await selecting;
    assert.equal(f.fresh.opens, 1); assert.equal(f.session.options.baudRate, 115200); assert.equal(f.a.closes, 1); assert.equal(f.http(), 0);
    const chosen = f.session.portId!; f.panel.edit(chosen, '19200'); f.setChoice(async () => f.fresh);
    await f.panel.connectNewDevice(); assert.equal(f.session.options.baudRate, 19200); const opens = f.fresh.opens;
    await f.panel.activate(chosen); assert.equal(f.fresh.opens, opens); assert.equal(f.chooserCalls(), 2);
  } finally { selected.resolve(f.fresh); await f.close(); }
});

test('internal cancelled or refused selection preserves the old stream and independent saved drafts', async t => {
  for (const name of ['NotFoundError', 'SecurityError']) await t.test(name, async () => {
    const f = fixture();
    try {
      await f.refreshBrowser(); const [a, b] = f.browserRows().map(row => row.id);
      f.panel.edit(a, '57600'); await f.panel.activate(a); f.panel.edit(b, '38400');
      f.setChoice(async () => { throw new DOMException('mock selection cancelled or denied', name); }); await f.panel.connectNewDevice();
      assert.equal(f.session.portId, a); assert.equal(f.session.options.baudRate, 57600); assert.equal(f.a.closes, 0); assert.equal(f.chooserCalls(), 1);
      await f.panel.activate(b); assert.equal(f.session.options.baudRate, 38400); assert.equal(f.chooserCalls(), 1);
    } finally { await f.close(); }
  });
});

test('internal duplicate selections and a changed busy/protocol/ownership guard cannot replace the old connection', async () => {
  const f = fixture(), selected = deferred<SerialPortLike>(); f.setChoice(() => selected.promise);
  try {
    await f.refreshBrowser(); const old = f.browserRows()[0].id; await f.panel.activate(old);
    const known = new Set(f.browserRows().map(row => row.id));
    const first = f.panel.connectNewDevice(); await f.panel.connectNewDevice(); assert.equal(f.chooserCalls(), 1);
    f.hardware.busy = true; selected.resolve(f.fresh); await assert.rejects(first, /硬件作业/);
    assert.equal(f.a.closes, 0); assert.equal(f.fresh.opens, 0); assert.equal(f.session.portId, old);
    await assert.rejects(f.panel.connectNewDevice(), /硬件作业/); f.hardware.busy = false;
    f.current.realtime = true; await assert.rejects(f.panel.connectNewDevice(), /实时硬件协议/); f.current.realtime = false;
    f.session.status = 'error'; await assert.rejects(f.panel.connectNewDevice(), /待释放/); f.session.status = 'open';
    assert.equal(f.chooserCalls(), 1); const chosen = f.browserRows().find(row => !known.has(row.id))!;
    await f.panel.activate(chosen.id); assert.equal(f.fresh.opens, 1); assert.equal(f.chooserCalls(), 1);
  } finally { f.hardware.busy = false; f.current.realtime = false; f.session.status = 'open'; selected.resolve(f.fresh); await f.close(); }
});

test('explicit browser cache refresh preserves local stream and preferences without exposing inactive browser candidates', async () => {
  const f = await localFixture();
  try {
    const a = f.localRow('COM11').id; f.panel.edit(a, '9600'); await f.panel.activate(a);
    const before = f.api.calls.length; await f.session.refresh('browser');
    assert.equal(f.api.calls.length, before); assert.equal(f.session.portId, a); assert.equal(f.session.options.baudRate, 9600);
    assert.equal(f.panel.rows.some(row => row.source === 'browser'), false); assert.equal(f.panel.rows.length, 2);
    await f.panel.refresh(); assert.equal(f.localRow('COM11').draftBaud, '9600'); assert.equal(f.session.portId, a);
  } finally { await f.close(); }
});

test('late browser enumeration cannot discard a newly selected compatibility object', async () => {
  const f = fixture(), scan = deferred<SerialPortLike[]>(); f.setList(() => scan.promise);
  try {
    const refreshing = f.refreshBrowser(); await f.panel.connectNewDevice(); scan.resolve([]); await refreshing;
    assert.equal(f.fresh.opens, 1); assert.equal(f.panel.rows.find(row => row.active)!.appliedBaud, 115200); assert.equal(f.http(), 0);
  } finally { scan.resolve([]); await f.close(); }
});

test('without Web Serial the panel is also local and permission is never attempted', async () => {
  const f = fixture();
  try {
    const sources = new SerialSources(f.local), session = new HardwareSession(sources);
    const hardware = new HardwareController(session, () => f.current, f.local.base, () => {}, async () => { throw new Error('offline'); });
    const panel = new SerialDevicePanel(hardware, sources, async () => {}, async () => {});
    assert.equal(panel.source, 'local'); await panel.refresh(); await assert.rejects(panel.connectNewDevice(), /不支持 Web Serial/);
    assert.equal(f.chooserCalls(), 0); assert.equal(f.scans(), 0);
  } finally { await f.close(); }
});
