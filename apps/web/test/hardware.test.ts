import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareSession, defaultSerialOptions } from '../src/hardware-session.ts';
import { HardwareController } from '../src/hardware-controller.ts';
import { NativeSerialSocket } from '../src/native-serial-socket.ts';
import type { HardwareSource } from '../src/hardware-controller.ts';
import type { HardwareJob } from '../src/hardware-types.ts';
import type { SerialOptions } from '../src/serial.ts';

class Port extends EventTarget {
  readable!: ReadableStream<Uint8Array>;
  writable!: WritableStream<Uint8Array>;
  input!: ReadableStreamDefaultController<Uint8Array>;
  writes: number[][] = [];
  opens = 0; closes = 0; failClose = false; failRestore = false;
  getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
  async open(_options: SerialOptions) {
    if (this.failRestore && this.opens) throw new Error('restore failed');
    this.opens++;
    this.readable = new ReadableStream({ start: c => { this.input = c; } });
    this.writable = new WritableStream({ write: async bytes => { await Promise.resolve(); this.writes.push([...bytes]); } });
  }
  async close() {
    assert.equal(this.readable.locked, false); assert.equal(this.writable.locked, false);
    if (this.failClose) throw new Error('port still owned'); this.closes++;
  }
}
const source = (): HardwareSource => ({ deviceId: 'arduinoEsp32', moduleIds: [], code: '// edited\nvoid setup(){}\nvoid loop(){}', documentId: 3, editVersion: 7, realtime: false });
async function setup(open = true) {
  const port = new Port(); let requested = false;
  const session = new HardwareSession({ getPorts: async () => [port], requestPort: async () => { requested = true; return port; } });
  const choosing = session.choose(); assert.equal(requested, true);
  const id = (await choosing)!; if (open) await session.open(id, defaultSerialOptions);
  return { session, port, id };
}
const job = (id: string, kind: 'build' | 'upload', state: HardwareJob['state']): HardwareJob => ({ id, kind, state, stage: state === 'running' ? kind === 'build' ? 'compiling' : 'uploading' : 'complete',
  deviceId: 'arduinoEsp32', profileId: 'esp32', sourceHash: 'hash', createdAt: new Date().toISOString() });
function mock(port: Port) {
  const calls: { path: string; body: any }[] = [];
  let uploadState: HardwareJob['state'] = 'succeeded'; let onBuild = () => {};
  const request: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname; const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body }); let data: any;
    if (path.endsWith('/capabilities')) data = { protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: '1', description: 'mock' }, profiles: [{ id: 'esp32', deviceId: 'arduinoEsp32', label: 'ESP32', chip: 'esp32', fqbn: 'esp32:esp32:esp32', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false }] };
    else if (path.endsWith('/ports')) data = { items: [{ portId: 'COM-MOCK', displayName: 'Mock OS serial' }] };
    else if (path.endsWith('/builds')) { onBuild(); data = { job: job('build', 'build', 'running') }; }
    else if (path.endsWith('/uploads')) { assert.ok(port.closes > 0 || port.opens === 0, 'browser port closed before upload POST'); data = { job: job('upload', 'upload', 'running') }; }
    else if (path.endsWith('/cancel')) { uploadState = 'cancelled'; data = { job: job('upload', 'upload', 'cancelling') }; }
    else data = { job: job(path.endsWith('/build') ? 'build' : 'upload', path.endsWith('/build') ? 'build' : 'upload', path.endsWith('/build') ? 'succeeded' : uploadState), logs: [{ index: 0, stream: 'stdout', text: 'mock log\n' }], nextLog: 1 };
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  };
  return { request, calls, setUploadState: (v: HardwareJob['state']) => { uploadState = v; }, onBuild: (fn: () => void) => { onBuild = fn; } };
}
async function finished(hardware: HardwareController) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error('job did not finish')); }, 2000);
    const stop = hardware.subscribe(() => { if (!hardware.busy) { clearTimeout(timer); stop(); resolve(); } });
  });
}
test('shared session orders writes, distributes the same RX, and retains ownership after failed close', async () => {
  const { session, port } = await setup();
  const received: number[][] = []; session.onBytes(b => received.push([...b])); session.onBytes(b => received.push([...b]));
  port.input.enqueue(Uint8Array.of(0, 255)); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(received, [[0, 255], [0, 255]]);
  await Promise.all([session.write(Uint8Array.of(1)), session.write(Uint8Array.of(2))]);
  assert.deepEqual(port.writes, [[1], [2]]);
  port.failClose = true; await assert.rejects(session.close(), /still owned/);
  assert.equal(session.status, 'error'); assert.ok(session.portId);
  port.failClose = false; await session.close(); assert.equal(session.portId, null);
});
test('cancelled chooser is a disconnected terminal state', async () => {
  const session = new HardwareSession({ requestPort: async () => { throw new DOMException('cancel', 'NotFoundError'); } });
  assert.equal(await session.choose(), null); assert.equal(session.status, 'disconnected');
});
test('RPC id zero replies, discoveries and shared raw byte IO do not require Link', async () => {
  const { session, port, id } = await setup(false); const api = mock(port);
  const controller = new HardwareController(session, source, 'http://mock/api', () => {}, api.request, async () => {});
  const socket = new NativeSerialSocket(controller); const messages: any[] = [];
  socket.setHandleMessage(m => messages.push(m)); socket.setOnOpen(() => {}); socket.open();
  socket.sendMessage({ id: 0, method: 'discover' }); await new Promise(r => setTimeout(r, 10));
  assert.ok(messages.some(m => m.id === 0 && 'result' in m)); assert.ok(messages.some(m => m.method === 'didDiscoverPeripheral'));
  socket.sendMessage({ id: 1, method: 'connect', params: { peripheralId: id, peripheralConfig: { config: defaultSerialOptions } } });
  await new Promise(r => setTimeout(r, 0)); socket.sendMessage({ id: 2, method: 'read' });
  port.input.enqueue(Uint8Array.of(0, 255));
  socket.sendMessage({ id: 3, method: 'write', params: { message: 'QQA=', encoding: 'base64' } });
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(port.writes, [[65, 0]]); assert.ok(messages.some(m => m.method === 'onMessage' && m.params.message === 'AP8='));
  await session.close(); socket.close();
});
test('upload uses current code, explicit OS selection, successful release and safe terminal restore', async () => {
  const { session, port } = await setup(); const api = mock(port);
  const controller = new HardwareController(session, source, 'http://mock/api', () => {}, api.request, async () => {});
  await controller.refresh(); assert.throws(() => controller.start(true), /明确选择/);
  controller.configure('esp32', 'COM-MOCK'); controller.start(true); await finished(controller);
  assert.equal(api.calls.find(c => c.path.endsWith('/builds'))!.body.code, source().code);
  assert.deepEqual(api.calls.find(c => c.path.endsWith('/uploads'))!.body, { buildId: 'build', portId: 'COM-MOCK' });
  assert.equal(controller.job?.state, 'succeeded'); assert.equal(port.opens, 2); assert.equal(session.status, 'open'); await session.close();
});
test('release failure prevents upload; source changes prevent stale artifact upload', async () => {
  const { session, port } = await setup(); const api = mock(port); port.failClose = true;
  let current = source();
  const controller = new HardwareController(session, () => current, 'http://mock/api', () => {}, api.request, async () => {});
  await controller.refresh(); controller.configure('esp32', 'COM-MOCK'); controller.start(true); await finished(controller);
  assert.equal(api.calls.some(c => c.path.endsWith('/uploads')), false); assert.match(controller.error, /still owned/);
  port.failClose = false; await session.close();
  api.onBuild(() => { current = { ...current, code: '// changed later', editVersion: 8 }; });
  controller.start(true); await finished(controller); assert.match(controller.error, /已变化/);
  assert.equal(api.calls.some(c => c.path.endsWith('/uploads')), false);
});
test('restore error is separate from upload success and cancellation stays busy until tool exits', async () => {
  const { session, port } = await setup(); const api = mock(port); port.failRestore = true;
  const controller = new HardwareController(session, source, 'http://mock/api', () => {}, api.request, () => new Promise(r => setTimeout(r, 1)));
  await controller.refresh(); controller.configure('esp32', 'COM-MOCK'); controller.start(true); await finished(controller);
  assert.equal(controller.job?.state, 'succeeded'); assert.match(controller.restoreError, /restore failed/);
  api.setUploadState('running'); controller.start(true);
  while (controller.snapshot().job?.kind !== 'upload' || controller.snapshot().job?.state !== 'running') await new Promise(r => setTimeout(r, 0));
  await controller.cancel(); assert.equal(controller.busy, true); assert.equal(controller.job?.state, 'cancelling');
  await finished(controller); assert.equal(controller.job?.state, 'cancelled');
});
