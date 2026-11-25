import { isSerialOptions } from './hardware-types.ts';
import type { SerialLike, SerialOptions, SerialPortLike } from './serial.ts';

export interface LocalSerialCapability {
  version: 1; available: boolean; reason?: string; transport: 'http-poll'; instanceId: string;
  maxReadBytes: 65536; maxWriteBytes: 65536; maxWaitMs: 15000; readLeaseMs: 45000; firstReadMs: 5000;
}
export interface LocalSession {
  id: string; instanceId: string; deviceRef: string; portId: string;
  state: 'opening' | 'open' | 'closing' | 'closed' | 'disconnected' | 'error'; held: boolean;
  options: SerialOptions; nextWriteSequence: number; error?: { code: string; message: string };
}
export interface LocalDevice {
  deviceRef: string; portId: string; displayName: string; usbVendorId?: string; usbProductId?: string;
  ownership: 'idle' | 'owned' | 'other-client' | 'opening' | 'closing' | 'uploading'; session?: LocalSession;
}
type Auth = { token: string; instanceId: string };
type DirectoryState = 'unknown' | 'checking' | 'online' | 'offline' | 'legacy' | 'unavailable';
const object = (value: any): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const canonicalPort = (port: string) => /^com\d+$/i.test(port) ? port.toUpperCase() : port;
const decode = (value: unknown): Uint8Array => {
  if (typeof value !== 'string' || value.length > 87384 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('本机串口返回无效的 Base64 数据。');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length > 65536 || btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')) !== value) throw new Error('本机串口返回的数据超过上限或编码无效。');
  return bytes;
};
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
function session(value: any): LocalSession {
  if (!object(value) || !['id', 'instanceId', 'deviceRef', 'portId'].every(key => nonempty(value[key])) ||
    !['opening', 'open', 'closing', 'closed', 'disconnected', 'error'].includes(value.state) || typeof value.held !== 'boolean' ||
    !isSerialOptions(value.options) || !integer(value.nextWriteSequence) || value.nextWriteSequence < 1 ||
    value.error !== undefined && (!object(value.error) || !nonempty(value.error.code) || !nonempty(value.error.message))) throw new Error('本机串口会话响应无效，状态尚未确认。');
  return value as LocalSession;
}
class HttpFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) { super(`${code}: ${message}`); this.status = status; this.code = code; this.details = details; }
}

// This adapter is the only HTTP reader. HardwareSession still owns its one reader and ordered writer.
export class LocalSerialLike implements SerialLike {
  readonly base: string;
  status: DirectoryState = 'unknown';
  message = '尚未检测本机串口服务。';
  confirmed = false;
  capability?: LocalSerialCapability;
  items: LocalDevice[] = [];
  private auth?: Auth;
  private request: typeof fetch;
  private listeners = new Set<() => void>();
  private ports = new Map<string, LocalSerialPort>();
  private refreshing?: Promise<SerialPortLike[]>;
  private disposed = false;
  private generation = 0;
  private readyGuard: () => Promise<void> = async () => {};
  setReadyGuard(guard: () => Promise<void>) { this.readyGuard = guard; }
  constructor(base: string, request: typeof fetch = fetch) { this.base = base.replace(/\/$/, ''); this.request = request.bind(globalThis); }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  notify() { this.listeners.forEach(fn => fn()); }
  preferenceKey(portId: string) { return this.base + '|' + canonicalPort(portId); }
  get currentInstance() { return this.capability?.instanceId; }
  requestPort(): Promise<SerialPortLike> { return Promise.reject(new Error('本机串口从设备行连接；浏览器授权请使用后备入口。')); }
  async json(path: string, body?: unknown, options: { auth?: Auth; signal?: AbortSignal; timeout?: number; keepalive?: boolean } = {}): Promise<any> {
    const abort = new AbortController(), relay = () => abort.abort(options.signal?.reason);
    let rejectAbort!: (reason: unknown) => void;
    const stopped = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(abort.signal.reason ?? new Error('本机串口请求已取消。'));
    abort.signal.addEventListener('abort', onAbort, { once: true });
    options.signal?.addEventListener('abort', relay, { once: true });
    if (options.signal?.aborted) relay();
    const timer = setTimeout(() => abort.abort(new Error('本机串口请求超时，状态尚未确认。')), options.timeout ?? 8000);
    try {
      return await Promise.race([stopped, (async () => {
        abort.signal.throwIfAborted();
        const response = await this.request(this.base + path, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'omit',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.auth ? { 'X-CCraft-Serial-Token': options.auth.token } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: abort.signal, ...(options.keepalive ? { keepalive: true } : {}) });
        const value = await response.json();
        if (!response.ok) throw new HttpFailure(response.status, String(value?.error?.code ?? response.status), value?.error?.message ?? '本机串口请求失败', value?.error?.details);
        return value;
      })()]);
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', relay); abort.signal.removeEventListener('abort', onAbort); }
  }
  private async client(): Promise<Auth> {
    if (this.auth && this.auth.instanceId === this.currentInstance) return this.auth;
    const data = await this.json('/serial/clients', {});
    if (typeof data?.clientToken !== 'string' || !/^[a-f0-9]{64}$/.test(data.clientToken) || data.instanceId !== this.currentInstance) throw new Error('本机串口服务身份已变化或令牌无效，请重新检测后连接。');
    return this.auth = { token: data.clientToken, instanceId: data.instanceId };
  }
  getPorts(): Promise<SerialPortLike[]> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh().finally(() => { this.refreshing = undefined; }); return this.refreshing;
  }
  private async refresh(): Promise<SerialPortLike[]> {
    if (this.disposed) throw new Error('本机串口适配已关闭。');
    const generation = ++this.generation;
    this.status = 'checking'; this.confirmed = false; this.message = '正在检测本机串口…'; this.notify();
    try {
      await this.readyGuard();
      const response = await this.json('/capabilities');
      if (response?.protocolVersion !== 1 || response.executionHost !== 'local') throw new Error('本机服务协议不兼容，请更新本机服务。');
      const capability = response.serial;
      if (capability !== undefined && (!object(capability) || capability.version !== 1 || typeof capability.available !== 'boolean' ||
        capability.transport !== 'http-poll' || !nonempty(capability.instanceId) || capability.maxReadBytes !== 65536 || capability.maxWriteBytes !== 65536 ||
        capability.maxWaitMs !== 15000 || capability.readLeaseMs !== 45000 || capability.firstReadMs !== 5000 || capability.reason !== undefined && typeof capability.reason !== 'string')) throw new Error('本机串口能力响应无效，请更新本机服务。');
      if (generation !== this.generation || this.disposed) return [];
      const previousInstance = this.currentInstance;
      this.capability = capability;
      if (previousInstance && previousInstance !== this.currentInstance) {
        this.auth = undefined; for (const port of this.ports.values()) port.instanceChanged();
      }
      if (!capability?.available) {
        const data = await this.json('/ports');
        if (!Array.isArray(data?.items) || !data.items.every((item: any) => nonempty(item?.portId) && nonempty(item?.displayName))) throw new Error('本机 OS 端口列表无效。');
        this.items = data.items.map((item: any) => ({ ...item, deviceRef: '', ownership: 'idle' }));
        this.status = capability ? 'unavailable' : 'legacy';
        this.message = capability ? capability.reason || '本机串口功能暂不可用。' : '需更新本机服务以使用直接串口连接。';
      } else {
        const auth = await this.client(), data = await this.json('/serial/devices', undefined, { auth });
        if (data?.instanceId !== auth.instanceId || !Array.isArray(data.items) || !data.items.every((item: any) => object(item) &&
          nonempty(item.deviceRef) && nonempty(item.portId) && nonempty(item.displayName) &&
          ['idle', 'owned', 'other-client', 'opening', 'closing', 'uploading'].includes(item.ownership) &&
          (item.session === undefined || session(item.session).instanceId === auth.instanceId)) ||
          new Set(data.items.map((item: LocalDevice) => item.deviceRef)).size !== data.items.length) throw new Error('本机串口目录响应无效或服务身份已变化。');
        this.items = data.items; this.status = 'online'; this.message = '本机串口可用，枚举不会打开设备。';
      }
      if (generation !== this.generation || this.disposed) return [];
      this.confirmed = true;
      for (const device of this.items) {
        const key = this.key(device);
        const known = this.ports.get(key);
        if (known) known.device = device;
        else this.ports.set(key, new LocalSerialPort(this, device));
      }
      for (const [id, port] of this.ports) if (!this.items.some(item => this.key(item) === id) && !port.held) this.ports.delete(id);
    } catch (e) { if (generation === this.generation && !this.disposed) { if (e instanceof HttpFailure && e.status === 401) this.auth = undefined; this.status = 'offline'; this.confirmed = false; this.message = `无法确认本机串口列表：${errorText(e)}`; } }
    this.notify(); return [...this.ports.values()];
  }
  private key(device: LocalDevice) { return 'local:' + this.base + ':' + (device.deviceRef || 'legacy:' + canonicalPort(device.portId)); }
  info(device: LocalDevice) {
    const listed = this.items.some(item => this.key(item) === this.key(device));
    return { id: this.key(device), source: 'local' as const, name: device.displayName, label: device.portId, portId: device.portId, preferenceKey: this.preferenceKey(device.portId),
      confirmed: this.confirmed && listed, reason: !this.confirmed ? '上次列表，状态尚未确认。请重新检测。' : !listed ? '端口引用已失效，请刷新设备列表。' : this.status !== 'online' ? this.message : '', ownership: device.ownership };
  }
  async prepare(port: LocalSerialPort): Promise<Auth> {
    await this.getPorts();
    if (this.status !== 'online' || !this.confirmed || !this.items.some(item => item.deviceRef === port.device.deviceRef)) throw new Error('本机串口引用已失效或状态尚未确认，请刷新后重新选择。');
    return this.client();
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; ++this.generation;
    this.status = 'offline'; this.confirmed = false; this.message = '本机串口适配已关闭，请重新载入编辑器后连接。';
    this.notify();
    for (const port of this.ports.values()) port.unload(); this.listeners.clear(); this.auth = undefined;
  }
}

class LocalSerialPort extends EventTarget implements SerialPortLike {
  readonly owner: LocalSerialLike;
  device: LocalDevice;
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  appliedOptions?: SerialOptions;
  held = false;
  private current?: LocalSession;
  private auth?: Auth;
  private opening?: { requestId: string; deviceRef: string; options: SerialOptions };
  private openingStartedAt = 0;
  private readAbort?: AbortController;
  private stream?: ReadableStreamDefaultController<Uint8Array>;
  private generation = 0;
  private cursor = 0;
  private sequence = 1;
  private stale = false;
  private failure = '';
  constructor(owner: LocalSerialLike, device: LocalDevice) { super(); this.owner = owner; this.device = device; }
  get connectionInfo() { const info = this.owner.info(this.device); return { ...info, reason: this.failure || info.reason, transportError: this.failure }; }
  getInfo() { return { ...(this.device.usbVendorId ? { usbVendorId: Number.parseInt(this.device.usbVendorId, 16) } : {}), ...(this.device.usbProductId ? { usbProductId: Number.parseInt(this.device.usbProductId, 16) } : {}) }; }
  private accept(value: unknown): LocalSession {
    const result = session(value);
    if (!this.auth || this.stale || this.auth.instanceId !== this.owner.currentInstance || result.instanceId !== this.auth.instanceId || result.deviceRef !== this.device.deviceRef || result.portId !== this.device.portId || this.current && result.id !== this.current.id) throw new Error('本机串口会话身份不匹配，状态尚未确认。');
    this.current = result; this.held = result.held; this.owner.notify(); return result;
  }
  private openFailure(error: unknown): boolean {
    if (!(error instanceof HttpFailure) || !object(error.details) || !Object.hasOwn(error.details, 'session')) return false;
    if (error.details.session === null) { this.held = false; this.opening = undefined; return true; }
    try { this.accept(error.details.session); this.opening = undefined; return true; }
    catch { return false; }
  }
  async open(options: SerialOptions) {
    if (this.held || this.opening) throw new Error('本机端口仍被持有，请先确认断开。');
    if (!isSerialOptions(options)) throw new Error('串口选项无效。');
    this.auth = await this.owner.prepare(this); this.stale = false; this.failure = ''; this.current = undefined;
    this.opening = { requestId: crypto.randomUUID(), deviceRef: this.device.deviceRef, options: { ...options } };
    this.openingStartedAt = Date.now();
    this.held = true; this.owner.notify();
    try {
      const data = await this.owner.json('/serial/sessions', this.opening, { auth: this.auth });
      const state = this.accept(data?.session);
      if (!state.held || state.state !== 'open') throw new Error(state.error?.message || '本机串口未确认打开。');
      this.opening = undefined; this.appliedOptions = { ...state.options }; this.cursor = 0; this.sequence = state.nextWriteSequence;
      const generation = ++this.generation;
      this.readable = new ReadableStream<Uint8Array>({ start: controller => { this.stream = controller; },
        pull: controller => this.read(controller, generation), cancel: () => { ++this.generation; this.readAbort?.abort(); } });
      this.writable = new WritableStream<Uint8Array>({ write: bytes => this.write(bytes, generation) });
    } catch (e) {
      this.openFailure(e);
      this.failure = this.held ? this.current ? `连接失败，端口仍待释放：${errorText(e)}` : `连接结果尚未确认，请重试断开后再连接：${errorText(e)}` : errorText(e);
      this.owner.notify(); throw new Error(this.failure);
    }
  }
  private async read(controller: ReadableStreamDefaultController<Uint8Array>, generation: number) {
    while (generation === this.generation && this.held && this.current) {
      const abort = this.readAbort = new AbortController();
      try {
        const data = await this.owner.json(`/serial/sessions/${encodeURIComponent(this.current.id)}/read?after=${this.cursor}&waitMs=15000`, undefined, { auth: this.auth, signal: abort.signal, timeout: 20000 });
        if (generation !== this.generation || abort.signal.aborted) return;
        const state = this.accept(data?.session), bytes = decode(data?.dataBase64);
        if (!integer(data?.from) || !integer(data?.next) || data.next !== data.from + bytes.length || data.from > this.cursor || data.next < this.cursor) throw new Error('SERIAL_CURSOR_INVALID：接收游标不连续，已停止串口流。');
        const fresh = bytes.subarray(this.cursor - data.from); this.cursor = data.next;
        if (fresh.length) { controller.enqueue(fresh); if (!state.held) controller.close(); else if (state.state !== 'open') controller.error(new Error(state.error?.message || '本机串口已停止。')); return; }
        if (!state.held) { controller.close(); return; }
        if (state.state !== 'open') throw new Error(state.error?.message || '本机串口状态尚未确认。');
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (e) {
        if (generation !== this.generation || abort.signal.aborted) return;
        this.failure = `本机串口接收中断：${errorText(e)}`; controller.error(new Error(this.failure)); this.owner.notify(); return;
      } finally { if (this.readAbort === abort) this.readAbort = undefined; }
    }
  }
  private async write(bytes: Uint8Array, generation: number) {
    if (!(bytes instanceof Uint8Array) || bytes.length > 262144) throw new Error('待发送数据不能超过 256 KiB。');
    const options = this.appliedOptions!, frameBits = 1 + options.dataBits + options.stopBits + (options.parity === 'none' ? 0 : 1);
    const max = Math.min(65536, Math.max(1, Math.floor(options.baudRate / frameBits * 10)));
    for (let offset = 0; offset < bytes.length; offset += max) {
      if (generation !== this.generation || !this.current || !this.held || this.failure) throw new Error('本机串口已关闭或发送状态尚未确认。');
      const chunk = bytes.subarray(offset, offset + max), sequence = this.sequence;
      try {
        const data = await this.owner.json(`/serial/sessions/${encodeURIComponent(this.current.id)}/write`, { sequence, dataBase64: encode(chunk) }, { auth: this.auth, timeout: 35000 });
        if (generation !== this.generation) throw new Error('本次串口会话已失效。');
        if (data?.sequence !== sequence || data?.sizeBytes !== chunk.length) throw new Error('发送确认无效。');
        this.sequence++;
      } catch (e) {
        this.failure = `发送结果未确认，数据可能已发送，不会自动重发：${errorText(e)}`;
        try { this.stream?.error(new Error(this.failure)); } catch { /* The shared reader may already have stopped. */ }
        this.owner.notify(); throw new Error(this.failure);
      }
    }
  }
  async close() {
    ++this.generation; this.readAbort?.abort();
    if (this.stale) { this.held = false; this.opening = undefined; this.current = undefined; this.owner.notify(); return; }
    if (this.opening) {
      // The server's bounded request history cannot prove idempotence indefinitely.
      if (Date.now() - this.openingStartedAt > 60000) throw new Error('打开结果核对期限已过，不会再次打开设备。请等待本机租约释放并重新载入编辑器。');
      try {
        // Reconcile the same idempotent open, never issue another open identity after a lost response.
        const data = await this.owner.json('/serial/sessions', this.opening, { auth: this.auth });
        this.accept(data?.session); this.opening = undefined;
      } catch (e) {
        if (!this.openFailure(e)) throw new Error(`打开结果仍未确认，端口可能仍被持有：${errorText(e)}`);
      }
    }
    if (!this.held) return;
    if (!this.current) throw new Error('本机串口所有权尚未确认。');
    try {
      const data = await this.owner.json(`/serial/sessions/${encodeURIComponent(this.current.id)}/close`, {}, { auth: this.auth });
      const state = this.accept(data?.session);
      if (state.held) throw new Error(state.error?.message || '本机端口尚未释放。');
      this.readable = null; this.writable = null;
    } catch (e) {
      try { const result = await this.owner.json(`/serial/sessions/${encodeURIComponent(this.current.id)}`, undefined, { auth: this.auth }); if (!this.accept(result?.session).held) return; }
      catch { /* A missing or inaccessible status cannot confirm release. */ }
      this.failure = `本机串口关闭尚未确认，仍保留占有：${errorText(e)}`; this.owner.notify(); throw new Error(this.failure);
    }
  }
  instanceChanged() {
    this.stale = true; this.failure = '本机服务已重启或身份变化，请刷新后重新选择设备。'; ++this.generation; this.readAbort?.abort();
    try { this.stream?.error(new Error(this.failure)); } catch { /* A retired stream stays retired. */ }
  }
  unload() {
    ++this.generation; this.readAbort?.abort();
    try { this.stream?.error(new Error('编辑器已离开，串口连接已结束。')); } catch { /* No active stream remains. */ }
    if (this.held && this.current && !this.stale) void this.owner.json(`/serial/sessions/${encodeURIComponent(this.current.id)}/close`, {}, { auth: this.auth, keepalive: true }).catch(() => undefined);
  }
}

export class SerialSources implements SerialLike {
  readonly local: LocalSerialLike;
  readonly browser?: SerialLike;
  browserError = '';
  private source: 'local' | 'browser';
  private localCache: SerialPortLike[] = [];
  private browserCache: SerialPortLike[] = [];
  private browserGeneration = 0;
  constructor(local: LocalSerialLike, browser?: SerialLike) { this.local = local; this.browser = browser; this.source = 'local'; }
  setSource(source: 'local' | 'browser') { this.source = source; }
  requestPort() {
    if (!this.browser) return Promise.reject(new Error('此浏览器不支持 Web Serial；可使用本机直连。'));
    const selected = this.browser.requestPort(); // Preserve the original click's activation.
    return selected.then(port => { ++this.browserGeneration; if (!this.browserCache.includes(port)) this.browserCache.push(port); return port; });
  }
  async getPorts(source: 'local' | 'browser' = this.source) {
    if (source === 'local') this.localCache = await this.local.getPorts();
    else {
      const generation = ++this.browserGeneration;
      try {
        if (!this.browser) throw new Error('此浏览器不支持 Web Serial，可使用本机直连。');
        const ports = await this.browser.getPorts?.() ?? [];
        if (generation === this.browserGeneration) { this.browserCache = ports; this.browserError = ''; }
      } catch (e) { if (generation === this.browserGeneration) this.browserError = `浏览器设备列表读取失败：${errorText(e)}`; }
    }
    return [...this.localCache, ...this.browserCache];
  }
}
