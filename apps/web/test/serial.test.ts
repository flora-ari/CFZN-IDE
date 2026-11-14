import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeSerialInput, formatHex, SerialTerminalService } from '../src/serial.ts';
import type { SerialOptions, SerialPortLike, SerialStatus } from '../src/serial.ts';

const options: SerialOptions = { baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };

class MockPort extends EventTarget implements SerialPortLike {
  controller!: ReadableStreamDefaultController<Uint8Array>;
  readable = new ReadableStream<Uint8Array>({ start: (controller) => { this.controller = controller; }, cancel: () => { this.canceled = true; } });
  writable = new WritableStream<Uint8Array>({ write: (bytes) => { this.writes.push(Array.from(bytes)); } });
  writes: number[][] = [];
  canceled = false;
  closed = false;
  options?: SerialOptions;
  async open(value: SerialOptions) { this.options = value; }
  async close() {
    assert.equal(this.readable.locked, false);
    assert.equal(this.writable.locked, false);
    this.closed = true;
  }
}

test('sends raw hexadecimal bytes and text newlines', () => {
  assert.equal(formatHex(encodeSerialInput('41 42\n00', 'hex', 'CRLF')), '41 42 00 0D 0A');
  assert.equal(new TextDecoder().decode(encodeSerialInput('测试', 'text', 'LF')), '测试\n');
  assert.throws(() => encodeSerialInput('f', 'hex', 'none'), /HEX/);
  assert.throws(() => encodeSerialInput('gg', 'hex', 'none'), /HEX/);
});

test('requests a port immediately, reads and writes bytes, and unlocks both streams on disconnect', async () => {
  const port = new MockPort();
  let requested = false;
  const statuses: SerialStatus[] = [];
  let receive!: (bytes: Uint8Array) => void;
  const received = new Promise<Uint8Array>((resolve) => { receive = resolve; });
  const service = new SerialTerminalService({ requestPort: async () => { requested = true; return port; } }, {
    onStatus: (status) => { statuses.push(status); }, onBytes: receive,
  });
  const connecting = service.connect(options);
  assert.equal(requested, true);
  await connecting;
  assert.deepEqual(port.options, options);
  port.controller.enqueue(Uint8Array.of(0, 127, 255));
  assert.deepEqual(Array.from(await received), [0, 127, 255]);
  await service.write(Uint8Array.of(13, 10));
  await service.disconnect();
  assert.deepEqual(port.writes, [[13, 10]]);
  assert.equal(port.canceled, true);
  assert.equal(port.closed, true);
  assert.deepEqual(statuses, ['requesting', 'opening', 'open', 'closing', 'disconnected']);
  await assert.rejects(service.write(Uint8Array.of(1)), /连接串口/);
});

test('releases both streams after the port reports a disconnect', async () => {
  const port = new MockPort();
  let complete!: (message?: string) => void;
  const disconnected = new Promise<string | undefined>((resolve) => { complete = resolve; });
  const service = new SerialTerminalService({ requestPort: async () => port }, {
    onStatus: (status, message) => { if (status === 'error') complete(message); }, onBytes: () => undefined,
  });
  await service.connect(options);
  port.dispatchEvent(new Event('disconnect'));
  assert.match(await disconnected ?? '', /设备已断开/);
  assert.equal(port.closed, true);
});

test('a canceled browser port chooser leaves the terminal disconnected', async () => {
  const statuses: SerialStatus[] = [];
  const service = new SerialTerminalService({ requestPort: async () => { throw new DOMException('No port', 'NotFoundError'); } }, {
    onStatus: (status) => { statuses.push(status); }, onBytes: () => undefined,
  });
  await service.connect(options);
  assert.deepEqual(statuses, ['requesting', 'disconnected']);
});
