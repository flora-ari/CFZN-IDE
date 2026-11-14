import { HardwareSession, describeError } from './hardware-session.ts';
import type { SerialSettings } from './hardware-session.ts';
import type { DeviceId, HardwareCapabilities, HardwareJob, HardwareLog, HardwarePort, HardwareSnapshot, LocalServiceState } from './hardware-types.ts';

export interface HardwareSource { deviceId: string | null; code: string; documentId: number; editVersion: number; moduleIds: string[]; realtime: boolean; programming?: boolean; generationError?: string }
const terminal = (job: HardwareJob) => ['succeeded', 'failed', 'cancelled'].includes(job.state);

export class HardwareController {
  profiles: HardwareCapabilities['profiles'] = [];
  ports: HardwarePort[] = [];
  profileId = '';
  portId = ''; // Explicit OS choice. Never inferred from browser USB IDs.
  busy = false;
  use: HardwareSnapshot['use'] = 'idle';
  job: HardwareJob | null = null;
  logs: HardwareLog[] = [];
  error = '';
  restoreError = '';
  private cancelled = false;
  private listeners = new Set<() => void>();
  private knownDevice: string | null = null;
  private cursor = 0;
  private pendingSubmission: 'build' | 'upload' | null = null;
  private mutationGuard: () => string = () => '';
  private localService: LocalServiceState;
  private portError = '';
  private serviceGeneration = 0;
  private portGeneration = 0;
  private serviceCheck?: AbortController;
  private portCheck?: AbortController;

  readonly session: HardwareSession;
  private source: () => HardwareSource;
  private base: string;
  private stopHardware: () => void;
  private request: typeof fetch;
  private pause: () => Promise<void>;
  constructor(session: HardwareSession, source: () => HardwareSource, base: string,
    stopHardware: () => void, request: typeof fetch = fetch,
    pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 500))) {
    this.session = session; this.source = source; this.base = base; this.stopHardware = stopHardware; this.request = request.bind(globalThis); this.pause = pause;
    this.localService = { status: 'unknown', baseUrl: base, message: '尚未检查本机编译服务。' };
    session.subscribe(() => this.publish());
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private publish = () => this.listeners.forEach(fn => fn());
  snapshot(): HardwareSnapshot {
    const source = this.source();
    return { deviceId: source.deviceId, sessionId: this.session.sessionId, connection: this.session.status,
      use: this.busy ? this.use : this.session.status === 'open' ? source.realtime ? 'protocol' : 'terminal' : 'idle',
      options: { ...this.session.options }, browserPorts: this.session.ports, browserPortId: this.session.portId,
      profiles: this.profiles, ports: this.ports, profileId: this.profileId, portId: this.portId,
      busy: this.busy, job: this.job, logs: this.logs, message: this.session.message,
      error: this.error, restoreError: this.restoreError, serialOperation: this.session.operation,
      pendingBrowserPortId: this.session.pendingPortId, serialError: this.session.serialError,
      scanning: this.session.scanning, scanError: this.session.scanError,
      localService: { ...this.localService }, portError: this.portError };
  }
  changed() {
    const id = this.source().deviceId;
    if (id === this.knownDevice) return;
    this.knownDevice = id; this.profileId = this.profiles.find(p => p.deviceId === id)?.id ?? '';
    this.publish();
  }
  setMutationGuard(guard: () => string) { this.mutationGuard = guard; }
  get protocolRequested() { const source = this.source(); return source.deviceId === 'arduinoUno' && !!source.programming; }
  get serialDisabledReason() {
    return this.busy ? '硬件作业仍在进行，请等待完成或取消并等待工具退出。' : this.session.operation ? '请先完成当前串口操作。' : this.mutationGuard();
  }
  assertIdle() { const reason = this.serialDisabledReason; if (reason) throw new Error(reason); }
  async applySerialSettings(input: SerialSettings, origin: 'user' | 'native' = 'user') {
    this.assertIdle();
    if (origin === 'user' && this.source().realtime) throw new Error('实时硬件协议占用串口，请先结束协议连接。');
    await this.session.applySerialSettings(input); return this.snapshot();
  }
  chooseSerialPort() {
    this.assertIdle();
    if (this.source().realtime) throw new Error('实时硬件协议占用串口，请先结束协议连接。');
    return this.session.choose();
  }
  private async json<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request(`${this.base.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${data?.error?.code ?? response.status}: ${data?.error?.message ?? '本机硬件服务请求失败'}`);
    return data as T;
  }
  private async diagnosticJson(path: '/capabilities' | '/ports', check: AbortController): Promise<unknown> {
    const signal = check.signal;
    signal.throwIfAborted();
    const onAbort = () => rejectAbort(signal.reason);
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => check.abort(new DOMException('本机服务检查超时（8 秒）。', 'TimeoutError')), 8000);
    try {
      // The explicit race also bounds a slow response body or a transport ignoring AbortSignal.
      return await Promise.race([(async () => {
        const response = await this.request(`${this.base.replace(/\/$/, '')}${path}`, { method: 'GET', signal });
        let data: unknown;
        try { data = await response.json(); }
        catch {
          if (response.ok) throw new InvalidLocalResponse('响应不是有效的 JSON。');
          throw new Error(`${response.status}: 本机硬件服务请求失败`);
        }
        if (!response.ok) {
          const error = record(record(data)?.error);
          throw new Error(`${typeof error?.code === 'string' ? error.code : response.status}: ${typeof error?.message === 'string' ? error.message : '本机硬件服务请求失败'}`);
        }
        return data;
      })(), aborted]);
    } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
  }
  async checkLocalService(): Promise<void> {
    const generation = ++this.serviceGeneration;
    this.serviceCheck?.abort();
    const check = this.serviceCheck = new AbortController();
    this.localService = { status: 'checking', baseUrl: this.base, message: '正在检查本机编译服务…' };
    this.publish();
    try {
      const capability = capabilities(await this.diagnosticJson('/capabilities', check));
      if (generation !== this.serviceGeneration) return;
      this.profiles = capability.profiles;
      // Initial default only; checking never replaces an explicit profile or OS port choice.
      if (!this.profileId) this.profileId = this.profiles.find(p => p.deviceId === this.source().deviceId)?.id ?? '';
      this.localService = { status: 'online', baseUrl: this.base, message: '本机编译服务在线。' };
    } catch (e) {
      if (generation !== this.serviceGeneration) return;
      const incompatible = e instanceof InvalidLocalResponse;
      this.localService = { status: incompatible ? 'incompatible' : 'offline', baseUrl: this.base,
        message: `${incompatible ? '本机硬件服务协议不兼容' : '无法连接本机编译服务'}：${describeError(e)}` };
    }
    if (generation === this.serviceGeneration) { this.serviceCheck = undefined; this.publish(); }
  }
  async refreshUploadPorts(): Promise<void> {
    const generation = ++this.portGeneration;
    this.portCheck?.abort();
    const check = this.portCheck = new AbortController();
    try {
      const ports = uploadPorts(await this.diagnosticJson('/ports', check));
      if (generation !== this.portGeneration) return;
      this.ports = ports; this.portError = '';
    } catch (e) {
      if (generation !== this.portGeneration) return;
      this.portError = `无法读取本机烧录端口：${describeError(e)}`;
    }
    if (generation === this.portGeneration) { this.portCheck = undefined; this.publish(); }
  }
  async refresh(): Promise<void> {
    await Promise.all([this.checkLocalService(), this.refreshUploadPorts()]);
  }
  configure(profileId: string, portId: string) {
    this.assertIdle();
    if (!this.profiles.some(p => p.id === profileId && p.deviceId === this.source().deviceId)) throw new Error('请选择当前主控的 profile。');
    if (portId && !this.ports.some(p => p.portId === portId)) throw new Error('所选 OS 端口已消失，请刷新后重新选择。');
    this.profileId = profileId; this.portId = portId; this.publish();
  }
  start(upload: boolean, capturedCode?: string) {
    this.assertIdle();
    if (this.session.portId && this.session.status !== 'open') throw new Error('当前串口仍被持有，请先重试断开。');
    if (['requesting', 'opening', 'closing'].includes(this.session.status)) throw new Error('请先完成当前串口操作。');
    const source = this.source();
    if (capturedCode !== undefined && capturedCode !== source.code) throw new Error('上传捕获的代码已变化，请重新使用当前代码编辑器内容。');
    if (source.programming || source.realtime) throw new Error('请先切换到上传模式。');
    if (source.generationError) throw new Error(source.generationError);
    if (this.localService.status === 'incompatible') throw new Error('本机硬件服务协议不兼容，请检查服务地址并重试本机服务检查。');
    const profile = this.profiles.find(p => p.id === this.profileId && p.deviceId === source.deviceId);
    if (!profile?.compileAvailable || (upload && !profile.uploadAvailable)) throw new Error(profile?.reason || '当前主控的本机工具链不可用，请刷新硬件能力。');
    if (!source.code.trim()) throw new Error('当前代码为空。');
    if (new TextEncoder().encode(source.code).length > 1024 * 1024) throw new Error('当前源码超过 1 MiB。');
    if (upload && !this.ports.some(p => p.portId === this.portId)) throw new Error('请先明确选择本机烧录端口。');
    this.busy = true; this.cancelled = false; this.use = 'build'; this.job = null; this.logs = [];
    this.error = ''; this.restoreError = ''; this.publish();
    void this.run(source, profile.id, upload, this.portId);
    return this.snapshot();
  }
  private log(text: string) {
    this.logs = [...this.logs, { index: this.logs.length, stream: 'system' as const, text }].slice(-1000); this.publish();
  }
  private async poll(job: HardwareJob) {
    this.job = job; this.cursor = 0; this.publish();
    while (!terminal(this.job!)) {
      try {
        const data = await this.json<{ job: HardwareJob; logs: HardwareLog[]; nextLog: number }>(`/jobs/${encodeURIComponent(job.id)}?afterLog=${this.cursor}`);
        this.job = data.job; this.cursor = data.nextLog;
        this.logs = [...this.logs, ...data.logs].slice(-1000); this.error = ''; this.publish();
        if (this.cancelled && data.job.state === 'running') await this.cancel();
      } catch (e) {
        // Connection loss is not a remote terminal state. Keep ownership and resume polling.
        this.error = `作业状态暂不可达，仍等待工具退出：${describeError(e)}`; this.publish();
      }
      if (!terminal(this.job!)) await this.pause();
    }
    return this.job!;
  }
  private async submit(path: '/builds' | '/uploads', body: unknown, kind: 'build' | 'upload') {
    this.pendingSubmission = kind;
    try { return (await this.json<{ job: HardwareJob }>(path, body)).job; }
    catch (e) {
      // POST may have reached the executor before the response was lost. No automatic retry or release.
      if (!(e instanceof Error) || !/^\d{3}:|^[A-Z_]+:/.test(e.message)) {
        this.error = `提交结果未知，请检查本机执行器后刷新页面：${describeError(e)}`;
        this.publish(); throw new SubmissionUnknown(this.error);
      }
      throw e;
    } finally { this.pendingSubmission = null; }
  }
  private async run(source: HardwareSource, profileId: string, upload: boolean, portId: string) {
    let restoreId: string | null = null;
    const restoreOptions = { ...this.session.options };
    let uncertain = false;
    try {
      this.log('编译当前代码编辑器内容。\n');
      const build = await this.poll(await this.submit('/builds', { deviceId: source.deviceId as DeviceId, profileId, code: source.code, moduleIds: source.moduleIds }, 'build'));
      if (build.state !== 'succeeded' || this.cancelled || !upload) return;
      const now = this.source();
      if (now.deviceId !== source.deviceId || now.code !== source.code || now.documentId !== source.documentId || now.editVersion !== source.editVersion || this.profileId !== profileId) {
        throw new Error('构建期间项目、主控或代码已变化，请重新上传当前代码。');
      }
      const portGeneration = ++this.portGeneration;
      this.portCheck?.abort(); this.portCheck = undefined;
      const available = uploadPorts(await this.json<unknown>('/ports'));
      if (portGeneration === this.portGeneration) { this.ports = available; this.portError = ''; }
      if (!available.some(p => p.portId === portId)) { this.portId = ''; throw new Error('所选烧录端口已消失，请刷新后重新选择。'); }
      if (this.cancelled) return;
      this.use = 'releasing'; this.log('释放浏览器串口，等待读写结束。\n');
      restoreId = this.session.status === 'open' ? this.session.portId : null;
      this.stopHardware(); await this.session.close();
      if (this.cancelled) return;
      this.use = 'upload'; this.log(`上传到明确选择的 OS 端口 ${portId}。\n`);
      await this.poll(await this.submit('/uploads', { buildId: build.id, portId }, 'upload'));
    } catch (e) {
      uncertain = e instanceof SubmissionUnknown;
      this.error = describeError(e); this.log(`${this.error}\n`);
    } finally {
      if (restoreId && !uncertain && this.session.status !== 'error') {
        this.use = 'restoring'; this.publish();
        try { await this.session.open(restoreId, restoreOptions); }
        catch (e) { this.restoreError = `作业结果已保留；恢复原串口失败：${describeError(e)}`; }
      }
      if (!uncertain) { this.busy = false; this.use = 'idle'; }
      this.publish();
    }
  }
  async cancel() {
    if (!this.busy) return this.snapshot();
    this.cancelled = true;
    if (this.job && !terminal(this.job)) {
      try {
        const data = await this.json<{ job: HardwareJob }>(`/jobs/${encodeURIComponent(this.job.id)}/cancel`, {});
        this.job = data.job;
      } catch (e) { this.error = `取消尚未确认，仍等待工具退出：${describeError(e)}`; }
    } else if (this.pendingSubmission) this.log('等待作业创建响应后取消。\n');
    this.publish(); return this.snapshot();
  }
}
class SubmissionUnknown extends Error {}
class InvalidLocalResponse extends Error {}
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === 'string' && !!value.trim();
function capabilities(value: unknown): HardwareCapabilities {
  const data = record(value);
  if (data?.protocolVersion !== 1 || data.executionHost !== 'local') throw new InvalidLocalResponse('需要 protocolVersion=1、executionHost=local。');
  const devices: DeviceId[] = ['arduinoUno', 'arduinoEsp32S3', 'aijiteESP32S3', 'arduinoEsp32', 'firebeetleEsp32E'];
  const profiles = data.profiles;
  if (!Array.isArray(profiles) || !profiles.every(value => {
    const p = record(value);
    return p && text(p.id) && devices.includes(p.deviceId as DeviceId) && text(p.label) && ['avr', 'esp32', 'esp32s3'].includes(p.chip as string) && text(p.fqbn) &&
      typeof p.compileAvailable === 'boolean' && typeof p.uploadAvailable === 'boolean' && typeof p.realtimeAvailable === 'boolean' && (p.reason === undefined || typeof p.reason === 'string');
  }) || new Set(profiles.map(p => p.id)).size !== profiles.length) throw new InvalidLocalResponse('profiles 字段无效。');
  const toolchain = record(data.toolchain);
  if (!toolchain || !(toolchain.cliVersion === null || typeof toolchain.cliVersion === 'string') || typeof toolchain.description !== 'string') throw new InvalidLocalResponse('toolchain 字段无效。');
  return data as unknown as HardwareCapabilities;
}
function uploadPorts(value: unknown): HardwarePort[] {
  const items = record(value)?.items;
  if (!Array.isArray(items) || !items.every(value => {
    const p = record(value);
    return p && text(p.portId) && text(p.displayName) && (p.usbVendorId === undefined || typeof p.usbVendorId === 'string') && (p.usbProductId === undefined || typeof p.usbProductId === 'string');
  }) || new Set(items.map(p => p.portId)).size !== items.length) throw new InvalidLocalResponse('OS 烧录端口列表字段无效。');
  return items as HardwarePort[];
}
