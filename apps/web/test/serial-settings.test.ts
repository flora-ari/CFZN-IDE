import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareSession, defaultSerialOptions } from '../src/hardware-session.ts';
import { HardwareController } from '../src/hardware-controller.ts';
import { NativeSerialSocket } from '../src/native-serial-socket.ts';
import type { SerialOptions } from '../src/serial.ts';

const options = (baudRate: number) => ({ ...defaultSerialOptions, baudRate });
class Port extends EventTarget {
  readable!: ReadableStream<Uint8Array>;
  writable!: WritableStream<Uint8Array>;
  input!: ReadableStreamDefaultController<Uint8Array>;
  opens = 0; closes = 0; failOpen = false; failClose = false; failWriter = false;
  rejectRate = 0;
  writeGate?: Promise<void>;
  disconnects: EventListener[] = [];
  name: string; owners: Set<Port>; trace: string[];
  constructor(name: string, owners: Set<Port>, trace: string[]) { super(); this.name = name; this.owners = owners; this.trace = trace; }
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, opts?: AddEventListenerOptions | boolean) {
    if (type === 'disconnect' && typeof callback === 'function') this.disconnects.push(callback);
    super.addEventListener(type, callback, opts);
  }
  getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
  async open(value: SerialOptions) {
    this.trace.push(`${this.name}:open:${value.baudRate}`); this.opens++;
    assert.equal(this.owners.size, 0, 'only one owned physical handle');
    if (this.failOpen || value.baudRate === this.rejectRate) throw new Error(`${this.name} open denied`);
    this.owners.add(this);
    this.readable = new ReadableStream({ start: c => { this.input = c; }, cancel: () => { this.trace.push(`${this.name}:cancel`); } });
    this.writable = new WritableStream({ write: async () => { await this.writeGate; this.trace.push(`${this.name}:write`); } });
    if (this.failWriter) Object.defineProperty(this.writable, 'getWriter', { value: () => { throw new Error('writer setup failed'); } });
  }
  async close() {
    this.trace.push(`${this.name}:close`); this.closes++;
    assert.equal(this.readable.locked, false, 'partial and complete readers release their lock');
    assert.equal(this.writable.locked, false);
    if (this.failClose) throw new Error(`${this.name} close denied`);
    this.owners.delete(this);
  }
}
async function fixture() {
  const owners = new Set<Port>(), trace: string[] = [];
  const a = new Port('a', owners, trace), b = new Port('b', owners, trace);
  let chooser: () => Promise<Port> = async () => b, scanFails = false, requests = 0;
  const session = new HardwareSession({ getPorts: async () => { if (scanFails) throw new Error('enumeration denied'); return [a, b]; }, requestPort: () => { requests++; return chooser(); } });
  await session.refresh();
  const [aId, bId] = session.ports.map(p => p.id);
  const hardware = new HardwareController(session, () => ({ deviceId: 'arduinoEsp32', moduleIds: [], code: 'void setup(){}', documentId: 1, editVersion: 1, realtime: false }), 'http://mock', () => {});
  return { session, hardware, a, b, aId, bId, trace, owners, requests: () => requests, chooser: (next: () => Promise<Port>) => { chooser = next; }, failScan: () => { scanFails = true; } };
}
test('switch drains writes, blocks conflicting settings/TX/jobs, and opens only after old close', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200));
  let release!: () => void; f.a.writeGate = new Promise<void>(r => { release = r; });
  const writing = f.session.write(Uint8Array.of(1));
  const switching = f.hardware.applySerialSettings({ browserPortId: f.bId, options: options(57600) });
  assert.equal(f.session.operation, 'switching');
  await assert.rejects(f.session.write(Uint8Array.of(2)), /切换/);
  await assert.rejects(f.hardware.applySerialSettings({ options: options(9600) }), /当前串口操作/);
  assert.throws(() => f.hardware.start(true), /当前串口操作/);
  assert.equal(f.b.opens, 0); release(); await writing; await switching;
  assert.ok(f.trace.indexOf('a:write') < f.trace.indexOf('a:close'));
  assert.ok(f.trace.indexOf('a:close') < f.trace.indexOf('b:open:57600'));
  assert.equal(f.session.portId, f.bId); assert.equal(f.requests(), 0); await f.session.close();
});
test('same applied settings are no-op; unsigned-long and complete options validate before mutation', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); const id = f.session.sessionId;
  await f.hardware.applySerialSettings({ browserPortId: f.aId, options: options(115200) });
  for (const rate of [0, -1, 1.5, NaN, Infinity, 4294967296]) await assert.rejects(f.hardware.applySerialSettings({ options: options(rate) }), /波特率/);
  await assert.rejects(f.hardware.applySerialSettings({ options: { ...options(9600), parity: 'invalid' as any } }), /配置/);
  assert.equal(f.a.opens, 1); assert.equal(f.a.closes, 0); assert.equal(f.session.sessionId, id);
  await f.session.close(); await f.hardware.applySerialSettings({ options: options(4294967295) }); assert.equal(f.session.options.baudRate, 4294967295);
});
test('failed target and failed rate change restore original actual settings without replay or reauthorization', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); const oldSession = f.session.sessionId;
  f.b.failOpen = true;
  await assert.rejects(f.hardware.applySerialSettings({ browserPortId: f.bId, options: options(9600) }), /已恢复原连接/);
  assert.equal(f.session.status, 'open'); assert.equal(f.session.portId, f.aId); assert.equal(f.session.options.baudRate, 115200); assert.notEqual(f.session.sessionId, oldSession);
  f.a.rejectRate = 57600;
  await assert.rejects(f.hardware.applySerialSettings({ options: options(57600) }), /已恢复原连接/);
  assert.equal(f.session.options.baudRate, 115200); assert.match(f.session.serialError, /更改连接失败/);
  assert.equal(f.requests(), 0); assert.equal(f.trace.some(s => s.endsWith(':write')), false); await f.session.close();
});
test('failed old close retains ownership and prevents target open and uploader start', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); f.a.failClose = true;
  await assert.rejects(f.hardware.applySerialSettings({ browserPortId: f.bId, options: options(9600) }), /close denied/);
  assert.equal(f.session.portId, f.aId); assert.equal(f.b.opens, 0); assert.equal(f.session.status, 'error');
  assert.throws(() => f.hardware.start(true), /仍被持有/);
  f.a.failClose = false; await f.session.close(); assert.equal(f.owners.size, 0);
});
test('writer setup failure releases its partial reader before closing target and restoring original port', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); f.b.failWriter = true;
  await assert.rejects(f.hardware.applySerialSettings({ browserPortId: f.bId, options: options(9600) }), /writer setup failed.*已恢复/);
  assert.equal(f.b.readable.locked, false); assert.equal(f.b.closes, 1); assert.equal(f.session.portId, f.aId); assert.equal(f.owners.size, 1); await f.session.close();
});
test('target cleanup failure keeps target owned and never restores another handle', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); f.b.failWriter = true; f.b.failClose = true;
  await assert.rejects(f.hardware.applySerialSettings({ browserPortId: f.bId, options: options(9600) }), /目标端口释放失败/);
  assert.equal(f.a.opens, 1); assert.equal(f.session.portId, f.bId); assert.equal(f.session.status, 'error');
  f.b.failClose = false; await f.session.close(); assert.equal(f.owners.size, 0);
});
test('failed recovery reports both errors and actual disconnected state', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); f.a.failOpen = true; f.b.failOpen = true;
  await assert.rejects(f.hardware.applySerialSettings({ browserPortId: f.bId, options: options(9600) }), /b open denied.*恢复原连接失败.*a open denied/);
  assert.equal(f.session.status, 'error'); assert.equal(f.session.portId, null); assert.equal(f.session.sessionId, null); assert.equal(f.owners.size, 0);
});
test('new authorization is immediate, reserves operations, and cancellation preserves an existing stream', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); const id = f.session.sessionId;
  let cancel!: (e: unknown) => void; f.chooser(() => new Promise((_r, reject) => { cancel = reject; }));
  const choosing = f.hardware.chooseSerialPort(); assert.equal(f.requests(), 1); assert.equal(f.session.status, 'open');
  assert.throws(() => f.hardware.chooseSerialPort(), /当前串口操作/);
  assert.throws(() => f.hardware.start(true), /当前串口操作/);
  cancel(new DOMException('cancelled', 'NotFoundError')); assert.equal(await choosing, null);
  assert.equal(f.session.status, 'open'); assert.equal(f.session.sessionId, id); assert.equal(f.a.closes, 0); assert.equal(f.session.serialError, ''); await f.session.close();
});
test('enumeration errors and stale old disconnect events cannot corrupt the replacement session', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200)); const stale = f.a.disconnects[0];
  await f.hardware.applySerialSettings({ browserPortId: f.bId, options: options(9600) }); const id = f.session.sessionId;
  stale(new Event('disconnect')); await new Promise(r => setTimeout(r, 0));
  assert.equal(f.session.status, 'open'); assert.equal(f.session.sessionId, id); f.failScan(); await f.session.refresh();
  assert.equal(f.session.status, 'open'); assert.match(f.session.scanError, /enumeration denied/); assert.equal(f.session.scanning, false); await f.session.close();
});
test('native connect preserves user settings; native equal-baud mirror never reopens and shared guards reject transitions', async () => {
  const f = await fixture(); await f.hardware.applySerialSettings({ options: options(57600) });
  const socket = new NativeSerialSocket(f.hardware); const messages: any[] = []; socket.setHandleMessage(m => messages.push(m)); socket.open();
  socket.sendMessage({ id: 1, method: 'connect', params: { peripheralId: f.aId, peripheralConfig: { config: options(1200) } } }); await socket.connectionTask;
  assert.equal(f.session.options.baudRate, 57600);
  socket.sendMessage({ id: 2, method: 'updateBaudrate', params: { baudRate: '57600' } }); await new Promise(r => setTimeout(r, 0)); assert.equal(f.a.opens, 1);
  f.hardware.setMutationGuard(() => '项目正在加载'); await assert.rejects(f.hardware.applySerialSettings({ options: options(9600) }), /项目正在加载/);
  f.hardware.setMutationGuard(() => ''); await f.session.close(); socket.close();
});
test('real protocol ownership rejects user settings and authorization while native protocol configuration remains coordinated', async () => {
  const f = await fixture(); await f.session.open(f.aId, options(115200));
  const hardware = new HardwareController(f.session, () => ({ deviceId: 'arduinoUno', moduleIds: [], code: '', documentId: 1, editVersion: 1, realtime: true, programming: true }), 'http://mock', () => {});
  await assert.rejects(hardware.applySerialSettings({ options: options(9600) }), /实时硬件协议/);
  assert.throws(() => hardware.chooseSerialPort(), /实时硬件协议/);
  await hardware.applySerialSettings({ options: options(57600) }, 'native');
  assert.equal(f.session.options.baudRate, 57600); await f.session.close();
});
