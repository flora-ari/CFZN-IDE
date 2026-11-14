export interface SerialOptions {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  flowControl: 'none' | 'hardware';
}

export interface SerialPortLike extends EventTarget {
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
}

export interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts?(): Promise<SerialPortLike[]>;
}

export type SerialStatus = 'unsupported' | 'disconnected' | 'requesting' | 'opening' | 'open' | 'closing' | 'error';
export type SerialMode = 'text' | 'hex';
export type SerialNewline = 'none' | 'LF' | 'CR' | 'CRLF';

const lineEndings: Record<SerialNewline, string> = { none: '', LF: '\n', CR: '\r', CRLF: '\r\n' };
const encoder = new TextEncoder();

export function encodeSerialInput(value: string, mode: SerialMode, newline: SerialNewline) {
  if (mode === 'text') return encoder.encode(value + lineEndings[newline]);
  const raw = value.replace(/\s/g, '');
  if (!/^[a-f0-9]*$/i.test(raw) || raw.length % 2) throw new Error('HEX 请输入完整的两位字节，例如 41 42 0A。');
  const suffix = encoder.encode(lineEndings[newline]);
  const bytes = new Uint8Array(raw.length / 2 + suffix.length);
  for (let i = 0; i < raw.length; i += 2) bytes[i / 2] = Number.parseInt(raw.slice(i, i + 2), 16);
  bytes.set(suffix, raw.length / 2);
  return bytes;
}

export function formatHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

interface SerialCallbacks {
  onStatus(status: SerialStatus, message?: string): void;
  onBytes(bytes: Uint8Array): void;
}

export class SerialTerminalService {
  private serial: SerialLike | undefined;
  private callbacks: SerialCallbacks;
  private port: SerialPortLike | undefined;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  private readTask: Promise<void> | undefined;
  private closeTask: Promise<void> | undefined;
  private connecting = false;
  private closing = false;

  constructor(serial: SerialLike | undefined, callbacks: SerialCallbacks) {
    this.serial = serial;
    this.callbacks = callbacks;
  }

  async connect(options: SerialOptions) {
    if (!this.serial) {
      this.callbacks.onStatus('unsupported', '此浏览器不支持 Web Serial。请使用 Chrome 或 Edge，并通过本机地址或 HTTPS 打开。');
      return;
    }
    if (this.connecting || this.port || this.closeTask) return;
    if (!Number.isSafeInteger(options.baudRate) || options.baudRate <= 0) {
      this.callbacks.onStatus('error', '波特率必须是正整数。');
      return;
    }
    this.connecting = true;
    let port: SerialPortLike | undefined;
    let opened = false;
    try {
      this.callbacks.onStatus('requesting');
      // This call runs synchronously in the click handler, before the first await.
      port = await this.serial.requestPort();
      this.callbacks.onStatus('opening');
      await port.open(options);
      opened = true;
      if (!port.readable || !port.writable) throw new Error('串口没有可用的读写流。');
      this.reader = port.readable.getReader();
      this.writer = port.writable.getWriter();
      this.port = port;
      port.addEventListener('disconnect', this.onDisconnect);
      this.callbacks.onStatus('open');
      this.readTask = this.readLoop(this.reader).then((failure) => {
        if (!this.closing && this.port === port) void this.disconnect(failure ?? '设备已断开。');
      });
    } catch (error) {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      this.reader = undefined;
      this.writer = undefined;
      if (opened && port) await port.close().catch(() => undefined);
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        this.callbacks.onStatus('disconnected', '未选择设备。若没有列出设备，请检查连接和驱动。');
      } else {
        this.callbacks.onStatus('error', `无法连接串口：${errorMessage(error)}`);
      }
    } finally {
      this.connecting = false;
    }
  }

  async write(bytes: Uint8Array) {
    if (!this.writer || this.closing) throw new Error('请先连接串口。');
    await this.writer.write(bytes);
  }

  disconnect(reason?: string): Promise<void> {
    if (this.closeTask) return this.closeTask;
    const port = this.port;
    if (!port) return Promise.resolve();
    this.closing = true;
    this.callbacks.onStatus('closing');
    this.closeTask = this.closePort(port, reason);
    return this.closeTask;
  }

  private onDisconnect = () => { void this.disconnect('设备已断开。'); };

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string | undefined> {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value?.length) this.callbacks.onBytes(value);
      }
    } catch (error) {
      return `读取串口失败：${errorMessage(error)}`;
    } finally {
      reader.releaseLock();
      if (this.reader === reader) this.reader = undefined;
    }
  }

  private async closePort(port: SerialPortLike, reason?: string) {
    port.removeEventListener('disconnect', this.onDisconnect);
    try {
      await this.reader?.cancel().catch(() => undefined);
      await this.readTask;
      this.writer?.releaseLock();
      this.writer = undefined;
      await port.close();
      this.callbacks.onStatus(reason ? 'error' : 'disconnected', reason);
    } catch (error) {
      this.callbacks.onStatus('error', reason ?? `关闭串口失败：${errorMessage(error)}`);
    } finally {
      this.port = undefined;
      this.closeTask = undefined;
      this.readTask = undefined;
      this.closing = false;
    }
  }
}
