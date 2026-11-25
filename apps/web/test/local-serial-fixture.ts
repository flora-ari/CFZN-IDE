import assert from 'node:assert/strict';
import { LocalSerialLike, SerialSources } from '../src/local-serial.ts';
import type { LocalDevice, LocalSession } from '../src/local-serial.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import { HardwareController } from '../src/hardware-controller.ts';
import { SerialDevicePanel } from '../src/serial-device-panel.ts';
import type { SerialOptions } from '../src/serial.ts';

export const defaults: SerialOptions = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
export const clone = <T>(value: T): T => structuredClone(value);
export const reply = (value: unknown, status = 200) => Response.json(clone(value), { status });
export async function until(done: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!done()) { assert.ok(Date.now() < deadline, 'mock serial transition did not settle'); await new Promise(resolve => setTimeout(resolve, 2)); }
}
type Failure = { held: boolean; details: 'null' | 'session' | 'missing' | 'wrong' };
export class SerialApiMock {
  base = 'http://mock/api/v1/hardware'; instance = 'mock-instance-1'; token = 'a'.repeat(64);
  modern = true; available = true; offline = false; loseWrite = false; failClose = false; loseOpen = false;
  devices: LocalDevice[] = [
    { deviceRef: '10000000-0000-4000-8000-000000000001', portId: 'COM11', displayName: 'Mock CP210x A', usbVendorId: '10C4', usbProductId: 'EA60', ownership: 'idle' },
    { deviceRef: '10000000-0000-4000-8000-000000000002', portId: 'COM12', displayName: 'Mock CP210x B', usbVendorId: '10C4', usbProductId: 'EA60', ownership: 'idle' },
  ];
  calls: { path: string; method: string; body: any; init?: RequestInit }[] = [];
  sessions = new Map<string, LocalSession>();
  opens = new Map<string, { body: any; session?: LocalSession; failure?: Failure }>();
  failOpen = new Map<string, Failure>();
  failRate = 0;
  physicalOpens = 0;
  writes: { id: string; sequence: number; bytes: number[] }[] = [];
  pending = new Map<string, { after: number; finish: (data: any) => void }>();
  readCalls: { id: string; after: number }[] = [];
  maxReads = 0;
  autoEmpty = 0;
  private count = 0;
  private failure(entry: { session?: LocalSession; failure?: Failure }) {
    const kind = entry.failure!.details;
    const data = kind === 'missing' ? undefined : { session: kind === 'null' ? null : kind === 'wrong' ? { ...entry.session!, instanceId: 'wrong-service' } : entry.session };
    return reply({ error: { code: 'SERIAL_IO_ERROR', message: 'mock driver open failed', ...(data ? { details: data } : {}) } }, 503);
  }
  request: typeof fetch = async (url, init) => {
    const target = new URL(String(url)), path = target.pathname.slice(new URL(this.base).pathname.length), method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ path, method, body, init });
    assert.equal(target.origin, new URL(this.base).origin);
    if (this.offline) throw new TypeError('mock network offline');
    if (path === '/capabilities') return reply({ protocolVersion: 1, executionHost: 'local', profiles: [], toolchain: { cliVersion: null, description: 'no compiler' },
      ...(this.modern ? { serial: { version: 1, available: this.available, transport: 'http-poll', instanceId: this.instance, maxReadBytes: 65536, maxWriteBytes: 65536, maxWaitMs: 15000, readLeaseMs: 45000, firstReadMs: 5000 } } : {}) });
    if (path === '/ports') return reply({ items: this.devices.map(({ portId, displayName }) => ({ portId, displayName })) });
    if (path === '/serial/clients') { assert.deepEqual(body, {}); return reply({ clientToken: this.token, instanceId: this.instance }, 201); }
    assert.equal(new Headers(init?.headers).get('X-CCraft-Serial-Token'), this.token);
    assert.equal(init?.cache, 'no-store'); assert.equal(init?.credentials, 'omit');
    if (path === '/serial/devices') return reply({ instanceId: this.instance, items: this.devices.map(device => {
      const owned = [...this.sessions.values()].find(session => session.held && session.portId === device.portId);
      return { ...device, ...(owned ? { session: owned, ownership: owned.state === 'opening' || owned.state === 'closing' ? owned.state : 'owned' } : {}) };
    }) });
    if (path === '/serial/sessions') {
      assert.deepEqual(Object.keys(body).sort(), ['deviceRef', 'options', 'requestId']);
      let entry = this.opens.get(body.requestId);
      if (entry) { assert.deepEqual(body, entry.body); return entry.failure ? this.failure(entry) : reply({ session: entry.session }, 201); }
      const device = this.devices.find(device => device.deviceRef === body.deviceRef);
      if (!device) return reply({ error: { code: 'PORT_STALE', message: 'old reference', details: { session: null } } }, 409);
      const failure = this.failOpen.get(device.portId) ?? (body.options.baudRate === this.failRate ? { held: false, details: 'session' as const } : undefined);
      const current: LocalSession | undefined = failure?.details === 'null' ? undefined : { id: 'session-' + ++this.count, instanceId: this.instance, deviceRef: device.deviceRef,
        portId: device.portId, state: failure ? 'error' : 'open', held: failure ? failure.held : true, options: clone(body.options), nextWriteSequence: 1 };
      if (current) this.sessions.set(current.id, current);
      entry = { body: clone(body), session: current, failure }; this.opens.set(body.requestId, entry); this.physicalOpens++;
      if (this.loseOpen) { this.loseOpen = false; throw new TypeError('open response lost'); }
      return failure ? this.failure(entry) : reply({ session: current }, 201);
    }
    const match = path.match(/^\/serial\/sessions\/([^/]+)(?:\/(read|write|close))?$/);
    assert.ok(match, path);
    const current = this.sessions.get(match[1])!; assert.ok(current, 'known mock session');
    if (match[2] === 'read') {
      const after = Number(target.searchParams.get('after')); assert.equal(target.searchParams.get('waitMs'), '15000');
      this.readCalls.push({ id: current.id, after }); assert.equal(this.pending.has(current.id), false, 'one HTTP read per session');
      if (this.autoEmpty > 0) { this.autoEmpty--; return reply({ session: current, from: after, next: after, dataBase64: '' }); }
      return new Promise<Response>((resolve, reject) => {
        const abort = () => { this.pending.delete(current.id); if (!this.failClose) { current.held = false; current.state = 'closed'; } else current.state = 'error'; reject(new DOMException('consumer cancelled', 'AbortError')); };
        this.pending.set(current.id, { after, finish: data => { init?.signal?.removeEventListener('abort', abort); this.pending.delete(current.id); resolve(reply(data)); } });
        this.maxReads = Math.max(this.maxReads, this.pending.size);
        init?.signal?.addEventListener('abort', abort, { once: true }); if (init?.signal?.aborted) abort();
      });
    }
    if (match[2] === 'write') {
      assert.deepEqual(Object.keys(body).sort(), ['dataBase64', 'sequence']);
      assert.equal(body.sequence, current.nextWriteSequence); current.nextWriteSequence++;
      const bytes = [...Buffer.from(body.dataBase64, 'base64')]; this.writes.push({ id: current.id, sequence: body.sequence, bytes });
      if (this.loseWrite) throw new TypeError('write response lost');
      return reply({ sequence: body.sequence, sizeBytes: bytes.length });
    }
    if (match[2] === 'close') {
      assert.deepEqual(body, {});
      if (this.failClose) { current.state = 'error'; return reply({ error: { code: 'SERIAL_IO_ERROR', message: 'mock close still held' } }, 503); }
      current.held = false; current.state = 'closed'; return reply({ session: current });
    }
    return reply({ session: current });
  };
  receive(id: string, bytes: number[], from?: number) {
    const pending = this.pending.get(id); assert.ok(pending, 'an HTTP reader is waiting');
    const start = from ?? pending.after;
    pending.finish({ session: this.sessions.get(id), from: start, next: start + bytes.length, dataBase64: Buffer.from(bytes).toString('base64') });
  }
}

export class BrowserPortMock extends EventTarget {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  opens = 0; closes = 0;
  getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
  async open(_options: SerialOptions) { this.opens++; this.readable = new ReadableStream(); this.writable = new WritableStream(); }
  async close() { this.closes++; }
}
export async function fixture(api = new SerialApiMock(), storage?: Storage) {
  const browserPort = new BrowserPortMock(); let authorizations = 0;
  const browser = { getPorts: async () => [browserPort], requestPort: async () => { authorizations++; return browserPort; } };
  const local = new LocalSerialLike(api.base, api.request), sources = new SerialSources(local, browser), session = new HardwareSession(sources);
  const current = { deviceId: 'arduinoEsp32', code: 'void setup(){}', documentId: 1, editVersion: 1, moduleIds: [], realtime: false };
  const hardware = new HardwareController(session, () => current, api.base, () => {}, api.request);
  const panel = new SerialDevicePanel(hardware, sources, (id, options) => hardware.applySerialSettings({ browserPortId: id, options }), () => session.close(), storage);
  await panel.refresh();
  return { api, local, sources, session, hardware, panel, browserPort, current, authorized: () => authorizations,
    localRow: (portId: string) => panel.rows.find(row => row.source === 'local' && row.port === portId)!,
    close: async () => { api.failClose = false; for (const entry of api.opens.values()) if (entry.failure) entry.failure.details = entry.session ? 'session' : 'null'; await session.close().catch(() => {}); local.dispose(); } };
}
