import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, SerialApiMock, defaults, until } from './local-serial-fixture.ts';
import { renderConnectionPanel } from '../src/connection-modal.ts';
import { LocalSerialLike } from '../src/local-serial.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import { SerialDevicePanel } from '../src/serial-device-panel.ts';

function storage(): Storage {
  const entries = new Map<string, string>();
  return { get length() { return entries.size; }, clear: () => entries.clear(), key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); } };
}
type Element = { type: string; props: Record<string, any>; children: any[] };
const R = { createElement: (type: string, props: any, ...children: any[]): Element => ({ type, props: props ?? {}, children }) };
const elements = (root: Element): Element[] => [root, ...root.children.filter(value => value && typeof value === 'object').flatMap(elements)];
const text = (root: Element): string => root.children.map(value => value && typeof value === 'object' ? text(value) : typeof value === 'string' ? value : '').join('');

test('OS rows are independent of compiler availability and browser permission; two drafts survive refresh and source changes', async () => {
  const f = await fixture();
  try {
    assert.equal(f.local.status, 'online'); assert.equal(f.hardware.profiles.length, 0);
    assert.deepEqual(f.panel.rows.map(row => row.port), ['COM11', 'COM12']);
    assert.equal(f.api.physicalOpens, 0); assert.equal(f.authorized(), 0);
    const a = f.localRow('COM11').id, b = f.localRow('COM12').id;
    f.panel.edit(a, '9600'); await f.panel.save(a);
    f.panel.edit(b, '57600'); await f.panel.save(b); f.panel.edit(b, 'not-a-rate');
    await assert.rejects(f.panel.activate(b), /波特率/); assert.equal(f.api.physicalOpens, 0);
    await f.panel.activate(a); assert.equal(f.session.options.baudRate, 9600);
    assert.equal(f.localRow('COM12').draftBaud, 'not-a-rate');
    await f.panel.refresh(); assert.equal(f.localRow('COM12').draftBaud, 'not-a-rate');
    await f.session.refresh('browser'); assert.equal(f.session.portId, a);
    assert.equal(f.panel.rows.filter(row => row.source === 'browser').length, 0);
    assert.equal(f.panel.rows.find(row => row.id === a)!.active, true);
    assert.equal(f.session.ports.filter(port => !port.source).length, 1);
    await f.panel.refresh(); assert.equal(f.localRow('COM11').appliedBaud, 9600);
    renderConnectionPanel(R, f.panel); renderConnectionPanel(R, f.panel);
    assert.equal(f.localRow('COM12').draftBaud, 'not-a-rate'); assert.equal(f.authorized(), 0);
    assert.equal(f.api.physicalOpens, 1); assert.equal(f.browserPort.opens, 0);
  } finally { await f.close(); }
});

test('only saved local options persist by service plus canonical OS port; browser authorization stays a synchronous explicit fallback', async () => {
  const preferences = storage(), f = await fixture(undefined, preferences);
  try {
    const a = f.localRow('COM11').id; f.panel.edit(a, '19200'); await f.panel.save(a);
    assert.equal(f.local.preferenceKey('com11'), f.local.preferenceKey('COM11'));
    const another = new SerialDevicePanel(f.hardware, f.sources, async () => {}, async () => {}, preferences);
    assert.equal(another.rows.find(row => row.id === a)!.draftBaud, '19200');
    assert.equal(another.rows.find(row => row.port === 'COM12')!.draftBaud, '115200');
    const otherApi = new SerialApiMock(); otherApi.base = 'http://other-local/api/v1/hardware';
    const other = await fixture(otherApi, preferences);
    try { assert.equal(other.localRow('COM11').savedBaud, 115200); } finally { await other.close(); }
    await f.session.refresh('browser'); const before = f.api.calls.length;
    const authorization = f.panel.connectNewDevice(); assert.equal(f.authorized(), 1, 'requestPort runs before any asynchronous scan or HTTP');
    await authorization; assert.equal(f.api.calls.length, before); assert.equal(f.browserPort.opens, 1);
    const stored = Array.from({ length: preferences.length }, (_, i) => preferences.getItem(preferences.key(i)!)).join('');
    assert.doesNotMatch(stored, /clientToken|instanceId|deviceRef/); assert.doesNotMatch(stored, new RegExp(f.api.token));
  } finally { await f.close(); }
});

test('failed switching and failed rate application restore the old actual connection while keeping the target draft and error', async () => {
  const f = await fixture();
  try {
    const a = f.localRow('COM11').id, b = f.localRow('COM12').id;
    f.panel.edit(a, '9600'); await f.panel.activate(a);
    f.panel.edit(b, '19200'); f.api.failRate = 19200;
    await assert.rejects(f.panel.activate(b), /已恢复原连接/);
    assert.equal(f.session.portId, a); assert.equal(f.session.status, 'open'); assert.equal(f.session.options.baudRate, 9600);
    assert.match(f.localRow('COM12').error, /mock driver open failed/); assert.equal(f.localRow('COM12').draftBaud, '19200');
    f.panel.edit(a, '19200'); await assert.rejects(f.panel.apply(a), /已恢复原连接/);
    assert.equal(f.localRow('COM11').appliedBaud, 9600); assert.equal(f.localRow('COM11').savedBaud, 9600);
    assert.equal(f.localRow('COM11').draftBaud, '19200'); assert.equal(f.authorized(), 0);
  } finally { await f.close(); }
});

test('quiet reads keep polling; overlapping cursor data is delivered once and a gap stops the shared stream', async () => {
  const api = new SerialApiMock(); api.autoEmpty = 3; const f = await fixture(api);
  try {
    const received: number[][] = [], mirror: number[][] = [];
    f.session.onBytes(bytes => received.push([...bytes])); f.session.onBytes(bytes => mirror.push([...bytes]));
    await f.panel.activate(f.localRow('COM11').id);
    await until(() => api.readCalls.length >= 4 && api.pending.size === 1);
    assert.equal(f.session.status, 'open'); const id = [...api.pending.keys()][0];
    api.receive(id, [1, 2, 3]); await until(() => received.length === 1 && api.pending.has(id));
    assert.equal(api.readCalls.at(-1)?.after, 3);
    api.receive(id, [2, 3, 4, 5], 1); await until(() => received.length === 2 && api.pending.has(id));
    assert.deepEqual(received, [[1, 2, 3], [4, 5]]); assert.deepEqual(mirror, received);
    assert.equal(api.readCalls.at(-1)?.after, 5); assert.equal(api.maxReads, 1);
    api.receive(id, [9], 10); await until(() => !f.session.portId);
    assert.match(f.localRow('COM11').error, /SERIAL_CURSOR_INVALID/); assert.equal(f.authorized(), 0);
  } finally { await f.close(); }
});

test('close failure retains ownership, blocks another row or source, and ignores a late response after explicit recovery', async () => {
  const f = await fixture();
  try {
    const a = f.localRow('COM11').id, b = f.localRow('COM12').id;
    await f.panel.activate(a); await until(() => f.api.pending.size === 1);
    const oldId = [...f.api.pending.keys()][0], late = f.api.pending.get(oldId)!.finish;
    f.api.failClose = true;
    await assert.rejects(f.panel.disconnectRow(a), /仍被持有|仍保留占有/);
    assert.equal(f.session.portId, a); assert.equal(f.session.status, 'error');
    await assert.rejects(f.panel.activate(b), /待释放/); assert.equal(f.api.physicalOpens, 1);
    await f.session.refresh('browser'); const browser = f.session.ports.find(port => !port.source)!;
    await assert.rejects(f.panel.activate(browser.id), /待释放/); assert.equal(f.browserPort.opens, 0);
    f.api.failClose = false;
    await f.panel.disconnectRow(a); await f.panel.activate(b);
    late({ session: f.api.sessions.get(oldId), from: 0, next: 1, dataBase64: 'AQ==' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.session.portId, b); assert.equal(f.session.status, 'open');
    assert.equal(f.session.serialError, '');
  } finally { await f.close(); }
});

test('TX chunks respect baud and byte limits, stay ordered, and a busy guard preserves RX without submitting a write', async () => {
  const f = await fixture();
  try {
    const a = f.localRow('COM11').id; f.panel.edit(a, '1200'); await f.panel.activate(a);
    const bytes = Uint8Array.from({ length: 2500 }, (_, index) => index % 256);
    await f.session.write(bytes);
    assert.deepEqual(f.api.writes.map(write => [write.sequence, write.bytes.length]), [[1, 1200], [2, 1200], [3, 100]]);
    assert.deepEqual(f.api.writes.flatMap(write => write.bytes), [...bytes]);
    f.hardware.busy = true; await assert.rejects(f.session.write(Uint8Array.of(9)), /硬件作业/);
    assert.equal(f.api.writes.length, 3); assert.equal(f.session.status, 'open'); f.hardware.busy = false;
    await assert.rejects(f.session.write(new Uint8Array(262145)), /256 KiB/);
    await f.session.write(Uint8Array.of(7)); assert.equal(f.api.writes.at(-1)?.sequence, 4);
  } finally { await f.close(); }
});

test('a lost TX response is never resent under another sequence and its row explains that bytes may have been sent', async () => {
  const f = await fixture();
  try {
    await f.panel.activate(f.localRow('COM11').id); f.api.loseWrite = true;
    await assert.rejects(f.session.write(Uint8Array.of(0, 255)), /可能已发送.*不会自动重发/);
    await until(() => !f.session.portId);
    assert.equal(f.api.writes.length, 1); assert.deepEqual(f.api.writes[0].bytes, [0, 255]);
    assert.match(f.localRow('COM11').error, /可能已发送/); assert.equal(f.authorized(), 0);
  } finally { await f.close(); }
});

test('definitive open failures use authoritative null/held-false diagnostics; held-true failures keep the closeable session', async t => {
  for (const kind of ['null', 'released', 'held'] as const) await t.test(kind, async () => {
    const api = new SerialApiMock(); api.failOpen.set('COM11', { held: kind === 'held', details: kind === 'null' ? 'null' : 'session' });
    api.failClose = kind === 'held'; const f = await fixture(api);
    try {
      const a = f.localRow('COM11').id; await assert.rejects(f.panel.activate(a), /mock driver open failed/);
      assert.equal(!!f.session.portId, kind === 'held');
      if (kind === 'held') { api.failClose = false; await f.panel.disconnectRow(a); }
      assert.equal(f.session.portId, null); assert.equal(api.physicalOpens, 1); assert.equal(f.authorized(), 0);
    } finally { await f.close(); }
  });
});

test('missing or foreign error diagnostics retain uncertainty until the same request returns a valid result', async t => {
  for (const kind of ['missing', 'wrong'] as const) await t.test(kind, async () => {
    const api = new SerialApiMock(); api.failOpen.set('COM11', { held: true, details: kind }); const f = await fixture(api);
    try {
      const a = f.localRow('COM11').id; await assert.rejects(f.panel.activate(a), /未确认|尚未确认/);
      assert.equal(f.session.portId, a); assert.equal(f.session.status, 'error');
      const openCalls = api.calls.filter(call => call.path === '/serial/sessions');
      assert.equal(new Set(openCalls.map(call => call.body.requestId)).size, 1); assert.equal(api.physicalOpens, 1);
      api.failOpen.get('COM11')!.details = 'session';
      await f.panel.disconnectRow(a); assert.equal(f.session.portId, null);
    } finally { await f.close(); }
  });
});

test('lost open responses reconcile the same UUID and payload without a second driver open or browser takeover', async () => {
  const api = new SerialApiMock(), original = api.request; let lost = true;
  api.request = async (url, init) => { const result = await original(url, init); if (String(url).endsWith('/serial/sessions') && lost) throw new TypeError('open response lost'); return result; };
  const f = await fixture(api);
  try {
    const a = f.localRow('COM11').id; await assert.rejects(f.panel.activate(a), /尚未确认/);
    assert.equal(f.session.portId, a); assert.equal(f.authorized(), 0); assert.equal(api.physicalOpens, 1);
    lost = false; await f.panel.disconnectRow(a); assert.equal(f.session.portId, null);
    const calls = api.calls.filter(call => call.path === '/serial/sessions');
    assert.equal(calls.length, 3); assert.equal(new Set(calls.map(call => call.body.requestId)).size, 1);
    assert.ok(calls.every(call => JSON.stringify(call.body) === JSON.stringify(calls[0].body)));
  } finally { lost = false; await f.close(); }
});

test('legacy services still list OS rows but cannot connect; offline cached rows and a new instance never auto-open stale references', async () => {
  const api = new SerialApiMock(); api.modern = false; const f = await fixture(api);
  try {
    const a = f.localRow('COM11').id; assert.equal(f.local.status, 'legacy'); assert.match(f.localRow('COM11').blocked, /更新本机服务/);
    await assert.rejects(f.panel.activate(a), /更新本机服务/); assert.equal(api.physicalOpens, 0);
    api.modern = true; await f.panel.refresh();
    await f.panel.activate(f.localRow('COM11').id); const oldId = f.session.portId!;
    api.offline = true; await f.panel.refresh(); assert.equal(f.local.confirmed, false); assert.match(f.localRow('COM12').blocked, /尚未确认/);
    api.offline = false; api.instance = 'mock-instance-2'; api.devices = api.devices.map(device => ({ ...device, deviceRef: device.deviceRef.replace('10000000', '20000000') }));
    await f.panel.refresh(); await until(() => !f.session.portId);
    const opens = api.physicalOpens; await assert.rejects(f.session.open(oldId, defaults), /失效|不可用/);
    assert.equal(api.physicalOpens, opens); assert.equal(f.authorized(), 0);
    await f.panel.refresh(); await f.panel.activate(f.localRow('COM11').id); assert.equal(api.physicalOpens, opens + 1);
  } finally { await f.close(); }
});

test('the rendered panel has five fixed columns and every row action is in the last cell; narrow cards retain visible labels', async () => {
  const f = await fixture();
  try {
    const tree = renderConnectionPanel(R, f.panel), nodes = elements(tree);
    assert.deepEqual(nodes.filter(node => node.type === 'th').map(text), ['设备名称', '端口', '波特率', '状态', '操作']);
    const rows = nodes.filter(node => node.type === 'tr' && node.props['data-port-id']);
    for (const row of rows) {
      assert.equal(row.children.length, 5);
      row.children.slice(0, 4).forEach((cell: Element) => assert.equal(elements(cell).some(child => child.type === 'button'), false));
      assert.deepEqual(elements(row.children[4]).filter(child => child.type === 'button').map(text), ['保存偏好', '连接']);
      assert.deepEqual(row.children.map((cell: Element) => text(cell.children[0])), ['设备名称', '端口', '波特率', '状态', '操作']);
    }
    assert.equal(nodes.filter(node => node.type === 'input').length, 2); assert.equal(nodes.some(node => node.type === 'select' || node.type === 'img'), false);
    const css = readFileSync(new URL('../src/native-hardware.css', import.meta.url), 'utf8');
    const bounds = css.match(/\.cfzn-hardware-modal\.cfzn-connection-modal\s*\{([^}]+)\}/)![1];
    assert.match(bounds, /box-sizing: border-box/); assert.match(bounds, /width: min\(900px, calc\(100vw - 32px\)\)/);
    assert.match(bounds, /height: min\(760px, calc\(100dvh - 32px\)\)/); assert.match(bounds, /margin: 16px auto/);
    assert.match(css, /\.cfzn-connection-modal > div[^}]+min-height: 0/); assert.match(css, /\.cfzn-connection-body[^}]+overflow: auto/);
    assert.match(css, /\.cfzn-connection-header[^}]+flex-shrink: 0/); assert.match(css, /@media \(max-width: 640px\)/);
    assert.match(css, /\.cfzn-connection-row-actions[^}]+justify-content: flex-end/);
    for (const [width, height] of [[1280, 720], [1366, 768], [1920, 910], [1528, 728], [360, 640]]) {
      assert.ok(Math.min(900, width - 32) + 32 <= width); assert.ok(Math.min(760, height - 32) + 32 <= height);
    }
  } finally { await f.close(); }
});

test('a browser without Web Serial can still enumerate local rows', async () => {
  const api = new SerialApiMock(), local = new LocalSerialLike(api.base, api.request);
  try {
    const session = new HardwareSession(local); await session.refresh();
    assert.equal(session.ports.length, 2); assert.equal(session.status, 'disconnected'); assert.equal(api.physicalOpens, 0);
  } finally { local.dispose(); }
});

test('editor disposal aborts its read pump and requests an authenticated keepalive close without taking over a browser port', async () => {
  const f = await fixture();
  try {
    await f.panel.activate(f.localRow('COM11').id); await until(() => f.api.pending.size === 1);
    f.local.dispose(); await until(() => !f.session.portId);
    assert.equal(f.api.pending.size, 0); assert.equal(f.local.confirmed, false);
    const close = f.api.calls.find(call => call.path.endsWith('/close') && call.init?.keepalive);
    assert.ok(close); assert.equal(new Headers(close.init?.headers).get('X-CCraft-Serial-Token'), f.api.token);
    assert.equal(f.authorized(), 0); assert.equal(f.api.physicalOpens, 1);
  } finally { await f.close(); }
});

test('unknown open reconciliation cannot reuse an ID after the bounded server history may have expired', async () => {
  const api = new SerialApiMock(); api.failOpen.set('COM11', { held: true, details: 'missing' });
  const local = new LocalSerialLike(api.base, api.request), now = Date.now;
  try {
    const [port] = await local.getPorts(); await assert.rejects(port.open(defaults), /尚未确认/);
    const calls = api.calls.filter(call => call.path === '/serial/sessions').length;
    const started = now(); Date.now = () => started + 61000;
    await assert.rejects(port.close(), /核对期限已过.*不会再次打开/);
    assert.equal(api.calls.filter(call => call.path === '/serial/sessions').length, calls); assert.equal(api.physicalOpens, 1);
  } finally { Date.now = now; local.dispose(); }
});
