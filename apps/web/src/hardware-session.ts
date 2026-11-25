import type { SerialLike, SerialPortLike, SerialOptions, SerialStatus } from './serial.ts';
import { isSerialOptions } from './hardware-types.ts';
import type { BrowserPort, SerialOperation } from './hardware-types.ts';

export const defaultSerialOptions: SerialOptions = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
export const describeError = (error: unknown) => error instanceof Error ? error.message : String(error);
export interface SerialSettings { browserPortId?: string; options: SerialOptions }
const sameOptions = (a: SerialOptions, b: SerialOptions) => a.baudRate === b.baudRate && a.dataBits === b.dataBits &&
  a.stopBits === b.stopBits && a.parity === b.parity && a.flowControl === b.flowControl;

// One owner, one reader and one ordered writer, entirely inside the editor iframe.
export class HardwareSession {
  status: SerialStatus;
  message = '';
  options = { ...defaultSerialOptions };
  sessionId: string | null = null;
  portId: string | null = null;
  operation: SerialOperation = null;
  pendingPortId: string | null = null;
  serialError = '';
  scanning = false;
  scanError = '';
  private known = new Map<string, SerialPortLike>();
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private reading?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private queuedBytes = 0;
  private releasing?: Promise<void>;
  private closing?: Promise<void>;
  private port?: SerialPortLike;
  private unplug?: () => void;
  private sequence = 0;
  private generation = 0;
  private scanGeneration = 0;
  private listeners = new Set<() => void>();
  private receivers = new Set<(bytes: Uint8Array) => void>();
  private serial?: SerialLike;
  private writeGuard: () => string = () => '';
  constructor(serial?: SerialLike) { this.serial = serial; this.status = serial ? 'disconnected' : 'unsupported'; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  setWriteGuard(guard: () => string) { this.writeGuard = guard; }
  onBytes(fn: (bytes: Uint8Array) => void) { this.receivers.add(fn); return () => { this.receivers.delete(fn); }; }
  private publish() { this.listeners.forEach(fn => fn()); }
  private update(status: SerialStatus, message = '') { this.status = status; this.message = message; this.publish(); }
  get ports(): BrowserPort[] {
    return [...this.known].map(([id, port], index) => {
      if (port.connectionInfo) return { ...port.connectionInfo, id };
      const info = port.getInfo?.();
      const usb = info?.usbVendorId ? `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}` : 'USB 信息不可用';
      const chip = info?.usbVendorId === 0x10c4 ? info.usbProductId === 0xea60 ? 'Silicon Labs CP210x' : 'Silicon Labs USB 串口' : info?.usbVendorId === 0x1a86 ? 'WCH USB 串口' : info?.usbVendorId === 0x0403 ? 'FTDI USB 串口' : '已授权串口设备';
      return { id, name: chip, label: `已授权串口 ${index + 1} · ${usb}` };
    });
  }
  private remember(port: SerialPortLike) {
    for (const [id, known] of this.known) if (known === port) return id;
    const id = port.connectionInfo?.id ?? `browser-${++this.sequence}`; this.known.set(id, port); return id;
  }
  async refresh(source?: 'local' | 'browser') {
    const scan = ++this.scanGeneration, previous = new Set(this.known.keys());
    this.scanning = true; this.scanError = ''; this.publish();
    try {
      if (!this.serial) throw new Error('此浏览器不支持 Web Serial，请使用 Chrome 或 Edge。');
      const ports = await this.serial.getPorts?.(source) ?? [];
      if (scan !== this.scanGeneration) return this.ports;
      for (const [id, port] of this.known) if (previous.has(id) && (!source || (port.connectionInfo?.source ?? 'browser') === source) && !ports.includes(port) && port !== this.port) this.known.delete(id);
      ports.forEach(port => this.remember(port));
    } catch (e) { if (scan === this.scanGeneration) this.scanError = `刷新已授权设备失败：${describeError(e)}`; }
    finally { if (scan === this.scanGeneration) { this.scanning = false; this.publish(); } }
    return this.ports;
  }
  private assertAvailable() { if (this.operation || this.releasing) throw new Error('请先完成当前串口操作。'); }
  private finish() { this.operation = null; this.pendingPortId = null; this.publish(); }
  // Authorization never closes an existing stream. requestPort runs in the original click stack.
  async choose(): Promise<string | null> {
    this.assertAvailable();
    if (!this.serial) throw new Error('此浏览器不支持 Web Serial。');
    this.operation = 'authorizing'; this.serialError = '';
    try {
      const choice = this.serial.requestPort();
      if (!this.port) this.update('requesting'); else this.publish();
      const id = this.remember(await choice);
      await this.releasing;
      if (!this.port) this.update('disconnected');
      return id;
    } catch (e) {
      await this.releasing?.catch(() => undefined);
      if (e && typeof e === 'object' && 'name' in e && e.name === 'NotFoundError') {
        this.update(this.port ? this.status : 'disconnected', this.port ? '未选择串口，保留当前连接。' : '未选择串口。');
      } else {
        this.serialError = `选择串口失败：${describeError(e)}`;
        if (!this.port) this.update('error', this.serialError); else this.publish();
      }
      return null;
    } finally { this.finish(); }
  }
  async applySerialSettings({ browserPortId, options }: SerialSettings) {
    this.assertAvailable();
    if (!isSerialOptions(options)) throw new Error('波特率必须是 1–4294967295 的整数，串口配置须有效。');
    if (this.port && this.status !== 'open') throw new Error('当前串口仍被持有，请先重试断开。');
    const id = browserPortId ?? this.portId;
    if (id && !this.known.has(id)) throw new Error('串口授权已失效，请刷新或重新授权。');
    if ((!id || this.status === 'open' && id === this.portId) && sameOptions(this.options, options)) return;
    if (!id) { this.options = { ...options }; this.serialError = ''; this.publish(); return; }
    const oldId = this.portId, oldOptions = { ...this.options }, wasOpen = this.status === 'open';
    this.operation = wasOpen ? 'switching' : 'connecting'; this.pendingPortId = id; this.serialError = ''; this.publish();
    try {
      if (this.port) await this.releaseOwned();
      try { await this.acquire(id, options); }
      catch (targetError) {
        const failure = `更改连接失败：${describeError(targetError)}`;
        if (this.port) {
          try { await this.releaseOwned(); }
          catch (cleanup) { throw new Error(`${failure}；目标端口释放失败，仍被持有：${describeError(cleanup)}`); }
        }
        if (wasOpen && oldId) {
          this.operation = 'restoring'; this.publish();
          try {
            const authorized = await this.serial?.getPorts?.(this.known.get(oldId)?.connectionInfo?.source ?? 'browser');
            if (authorized && !authorized.includes(this.known.get(oldId)!)) throw new Error('原端口已不可用或授权已撤销。');
            await this.acquire(oldId, oldOptions);
          } catch (restore) {
            let cleanup = '';
            if (this.port) { try { await this.releaseOwned(); } catch (e) { cleanup = `；恢复端口仍待释放：${describeError(e)}`; } }
            throw new Error(`${failure}；恢复原连接失败：${describeError(restore)}${cleanup}`);
          }
          throw new Error(`${failure}；已恢复原连接及 ${oldOptions.baudRate} 波特率。`);
        }
        throw new Error(failure);
      }
    } catch (e) {
      this.serialError = describeError(e);
      if (this.status === 'open') this.publish(); else this.update('error', this.serialError);
      throw e;
    } finally { this.finish(); }
  }
  open(id: string, options: SerialOptions) { return this.applySerialSettings({ browserPortId: id, options }); }
  setOptions(options: SerialOptions) { return this.applySerialSettings({ options }); }
  private async acquire(id: string, options: SerialOptions) {
    const port = this.known.get(id); if (!port) throw new Error('串口授权已失效。');
    this.update('opening');
    try { await port.open(options); }
    catch (e) {
      // A local HTTP open can have reached the service even if its response was lost.
      if (port.held) { this.port = port; this.portId = id; }
      throw e;
    }
    this.port = port; this.portId = id;
    if (!port.readable || !port.writable) throw new Error('串口没有可用的读写流。');
    this.reader = port.readable.getReader(); this.writer = port.writable.getWriter();
    const generation = ++this.generation;
    this.options = { ...(port.appliedOptions ?? options) }; this.sessionId = `serial-${++this.sequence}`;
    this.unplug = () => this.ended(port, generation, '设备已拔出。');
    port.addEventListener('disconnect', this.unplug);
    this.reading = this.read(this.reader, port, generation);
    this.update('open');
  }
  private ended(port: SerialPortLike, generation: number, message: string) {
    if (this.port !== port || this.generation !== generation || this.releasing || this.operation && this.operation !== 'authorizing') return;
    const authorization = this.operation === 'authorizing';
    if (!authorization) this.operation = 'closing';
    void this.releaseOwned().then(() => this.update('disconnected', message), e => {
      this.serialError = describeError(e); this.update('error', this.serialError);
    }).finally(() => { if (!authorization) this.finish(); });
  }
  private async read(reader: ReadableStreamDefaultReader<Uint8Array>, port: SerialPortLike, generation: number) {
    let failure = '';
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        if (this.port === port && this.generation === generation && this.reader === reader && value?.length) this.receivers.forEach(fn => fn(value));
      }
    } catch (e) { failure = `串口读取失败：${describeError(e)}`; }
    finally { reader.releaseLock(); if (this.reader === reader) this.reader = undefined; }
    queueMicrotask(() => this.ended(port, generation, failure || '串口读取已结束。'));
  }
  write(bytes: Uint8Array) {
    const blocked = this.writeGuard(); if (blocked) return Promise.reject(new Error(blocked));
    if (!this.writer || this.status !== 'open' || this.operation || this.releasing) return Promise.reject(new Error('串口未连接或正在切换/释放。'));
    if (this.queuedBytes + bytes.byteLength > 262144) return Promise.reject(new Error('串口待发送队列不能超过 256 KiB。'));
    this.queuedBytes += bytes.byteLength;
    const writer = this.writer;
    const task = this.writes.then(() => { const reason = this.writeGuard(); if (reason) throw new Error(reason); return writer.write(bytes); }).finally(() => { this.queuedBytes -= bytes.byteLength; });
    this.writes = task.catch(() => undefined); return task;
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    try { this.assertAvailable(); } catch (e) { return Promise.reject(e); }
    if (!this.port) return Promise.resolve();
    this.operation = 'closing'; this.serialError = '';
    this.closing = this.releaseOwned().finally(() => { this.closing = undefined; this.finish(); });
    return this.closing;
  }
  private releaseOwned(): Promise<void> {
    if (this.releasing) return this.releasing;
    if (!this.port) return Promise.resolve();
    this.update('closing');
    this.releasing = this.release().finally(() => { this.releasing = undefined; });
    return this.releasing;
  }
  private async release() {
    const port = this.port!;
    ++this.generation;
    try {
      await this.writes;
      const reader = this.reader;
      await reader?.cancel();
      if (this.reading) await this.reading;
      else if (reader && this.reader === reader) { reader.releaseLock(); this.reader = undefined; }
      this.writer?.releaseLock(); this.writer = undefined;
      await port.close();
      if (this.unplug) port.removeEventListener('disconnect', this.unplug);
      this.unplug = undefined; this.port = undefined; this.portId = null; this.sessionId = null; this.reading = undefined;
      this.update('disconnected');
    } catch (e) { this.serialError = `关闭串口失败，端口仍被持有：${describeError(e)}`; this.update('error', this.serialError); throw e; }
  }
}
