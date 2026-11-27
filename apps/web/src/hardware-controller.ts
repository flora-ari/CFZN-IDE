import { HardwareSession, describeError } from './hardware-session.ts';
import type { SerialSettings } from './hardware-session.ts';
import type { DeviceId, HardwareCapabilities, HardwareJob, HardwareLog, HardwarePort, HardwareProfile, HardwareSnapshot, LocalServiceState } from './hardware-types.ts';
import type { ArduinoLibraryReference } from './extensions/custom-module-definition';
import type { LinkGuard } from './ccraft-link.ts';
import { ToolchainPreparation } from './toolchain-preparation.ts';

export interface HardwareSource {
  deviceId: string | null; code: string; documentId: number; editVersion: number;
  moduleIds: string[]; libraries?: ArduinoLibraryReference[];
  realtime: boolean; programming?: boolean; generationError?: string;
}
const terminal = (job: HardwareJob) => ['succeeded', 'failed', 'cancelled'].includes(job.state);

export function profileUnavailableReason(profile: HardwareProfile, upload: boolean, installable = false) {
  if (profile.compileAvailable && (!upload || profile.uploadAvailable)) return '';
  if (installable) return '当前主控的编译环境尚未就绪，点击“编译检查”或“编译并上传”将自动安装。';
  const message = profile.reason === 'No toolchain configured for this profile.'
    ? '当前主控尚未配置本机工具链，请完成执行器配置后重新检测。'
    : !profile.compileAvailable ? '当前主控的本机编译工具链不可用。' : '当前主控的本机上传工具不可用。';
  return profile.reason ? message + ' ' + profile.reason : message;
}
export function localServiceUnavailableReason(service: LocalServiceState) {
  const reason = {
    unknown: '尚未检测本机编译服务，请点击“检测本机服务”。',
    checking: '正在检测本机编译服务，请稍候。',
    offline: '无法访问本机编译服务，请启动或恢复服务后重新检测。',
    incompatible: '本机编译服务协议不兼容，请检查服务地址或更新服务后重新检测。',
    online: '',
  }[service.status];
  return reason && (service.status === 'offline' || service.status === 'incompatible') ? `${reason} 诊断：${service.message}` : reason;
}

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
  private link?: LinkGuard;
  private localService: LocalServiceState;
  private portError = '';
  private serviceGeneration = 0;
  private capabilitiesEvidence?: { instanceId?: string; epoch: number; planRevision: number };
  private portGeneration = 0;
  private serviceCheck?: AbortController;
  private portCheck?: AbortController;
  private autoPrepared = new Set<string>();
  private lastLinkInstanceId?: string;
  private pendingAction: 'compile' | 'upload' | null = null;

  readonly session: HardwareSession;
  readonly toolchains: ToolchainPreparation;
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
    this.toolchains = new ToolchainPreparation(base, this.request, () => { this.publish(); queueMicrotask(() => this.maybeAutoPrepare()); }, async (instanceId, epoch, force) => {
      const catalog = this.toolchains.snapshot();
      const disagrees = catalog.profiles.some(entry => {
        const profile = this.profiles.find(item => item.id === entry.profileId);
        if (!profile || entry.state === 'preparing') return false;
        const ready = profile.compileAvailable && profile.uploadAvailable;
        return ready !== (entry.state === 'ready');
      });
      if (force || disagrees || !this.capabilitiesCurrent(instanceId, epoch)) {
        await this.checkLocalService(false, instanceId, epoch);
      }
      return this.capabilitiesCurrent(instanceId, epoch);
    });
    session.setWriteGuard(() => this.toolchainBusyReason ||
      (this.busy ? '硬件作业仍在进行，请等待完成后发送。' : this.linkDisabledReason));
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
      localService: { ...this.localService }, portError: this.portError, toolchain: this.toolchains.snapshot(), pendingAction: this.pendingAction };
  }
  changed() {
    const id = this.source().deviceId;
    if (id === this.knownDevice) return;
    this.knownDevice = id;
    if (!this.busy) this.profileId = this.profiles.find(p => p.deviceId === id)?.id ?? '';
    if (this.profileId) this.autoPrepared.delete(`${this.link?.instanceId ?? ''}:${this.profileId}`);
    this.publish();
    if (id && this.link && !this.linkDisabledReason && !this.profiles.some(p => p.deviceId === id) && !this.serviceCheck) {
      void this.refresh(false);
    } else queueMicrotask(() => this.maybeAutoPrepare());
  }
  setMutationGuard(guard: () => string) { this.mutationGuard = guard; }
  setLinkGuard(link: LinkGuard) {
    this.link = link;
    const update = () => {
      const nextInstance = link.reason ? undefined : link.instanceId;
      if (nextInstance && nextInstance !== this.lastLinkInstanceId) {
        this.lastLinkInstanceId = nextInstance; this.autoPrepared.clear();
      }
      this.toolchains.observeInstance(nextInstance);
      this.publish();
    };
    link.subscribe(update); update();
  }
  async ensureLinkReady(showGuide = true) { await this.link?.ensureReady(showGuide); }
  get linkDisabledReason() { return this.link?.reason ?? ''; }
  private capabilitiesCurrent(instanceId = this.link?.instanceId, epoch = this.toolchains.observation.epoch) {
    const observation = this.toolchains.observation, evidence = this.capabilitiesEvidence;
    return observation.online && observation.instanceId === instanceId && observation.epoch === epoch &&
      this.localService.status === 'online' && evidence?.instanceId === instanceId && evidence?.epoch === epoch &&
      evidence?.planRevision === observation.planRevision;
  }
  get boardToolchainEvidenceCurrent() { return this.toolchains.observation.catalogCurrent && this.capabilitiesCurrent(); }
  get protocolRequested() { const source = this.source(); return source.deviceId === 'arduinoUno' && !!source.programming; }
  private get toolchainBusyReason() { return this.toolchains.busy ? '正在安装主控编译环境，请等待任务结束。' : ''; }
  private get documentBusyReason() {
    return this.busy ? '硬件作业仍在进行，请等待完成或取消并等待工具退出。' : this.session.operation ? '请先完成当前串口操作。' : this.mutationGuard();
  }
  get serialDisabledReason() { return this.toolchainBusyReason || this.documentBusyReason; }
  assertIdle() { const reason = this.serialDisabledReason; if (reason) throw new Error(reason); }
  assertDocumentIdle() { const reason = this.documentBusyReason; if (reason) throw new Error(reason); }
  async applySerialSettings(input: SerialSettings, origin: 'user' | 'native' = 'user') {
    if (this.link) await this.ensureLinkReady();
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
  async checkLocalService(showGuide = false, expectedInstanceId?: string, expectedEpoch?: number): Promise<void> {
    if (this.link) { try { await this.ensureLinkReady(showGuide); } catch { return; } }
    const instanceId = this.link?.instanceId;
    if (expectedInstanceId && expectedInstanceId !== instanceId) return;
    const observation = this.toolchains.observation;
    if (expectedEpoch !== undefined && expectedEpoch !== observation.epoch) return;
    const generation = ++this.serviceGeneration;
    this.serviceCheck?.abort();
    const check = this.serviceCheck = new AbortController();
    this.localService = { status: 'checking', baseUrl: this.base, message: '正在检查本机编译服务…' };
    this.publish();
    try {
      const capability = capabilities(await this.diagnosticJson('/capabilities', check));
      if (expectedInstanceId) await this.ensureLinkReady(false);
      if (generation !== this.serviceGeneration || instanceId !== this.link?.instanceId ||
        observation.epoch !== this.toolchains.observation.epoch || observation.planRevision !== this.toolchains.observation.planRevision) return;
      this.capabilitiesEvidence = { instanceId, epoch: observation.epoch, planRevision: observation.planRevision };
      this.profiles = capability.profiles;
      // Repair a missing/stale choice for the current board without changing an active job's captured configuration.
      const deviceId = this.source().deviceId;
      if (!this.busy && !this.profiles.some(p => p.id === this.profileId && p.deviceId === deviceId)) this.profileId = this.profiles.find(p => p.deviceId === deviceId)?.id ?? '';
      this.localService = { status: 'online', baseUrl: this.base, message: '本机编译服务在线。' };
      queueMicrotask(() => this.maybeAutoPrepare());
    } catch (e) {
      if (generation !== this.serviceGeneration || instanceId !== this.link?.instanceId || observation.epoch !== this.toolchains.observation.epoch) return;
      this.capabilitiesEvidence = undefined;
      const incompatible = e instanceof InvalidLocalResponse;
      this.localService = { status: incompatible ? 'incompatible' : 'offline', baseUrl: this.base,
        message: `${incompatible ? '本机硬件服务协议不兼容' : '无法连接本机编译服务'}：${describeError(e)}` };
    } finally {
      if (generation === this.serviceGeneration) { this.serviceCheck = undefined; this.publish(); }
    }
  }
  async refreshUploadPorts(showGuide = false): Promise<void> {
    if (this.link) { try { await this.ensureLinkReady(showGuide); } catch { return; } }
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
  async refresh(showGuide = false): Promise<void> {
    await Promise.all([this.checkLocalService(showGuide), this.refreshUploadPorts(showGuide), this.refreshToolchains(showGuide)]);
  }
  private async refreshToolchains(showGuide: boolean) {
    if (!this.link) return;
    try { await this.ensureLinkReady(showGuide); } catch { return; }
    await this.toolchains.refresh();
  }
  boardProfile(deviceId: string) {
    return this.profiles.find(p => p.deviceId === deviceId && p.id === this.profileId) ?? this.profiles.find(p => p.deviceId === deviceId);
  }
  isPreparingProfile(profileId: string) {
    const tc = this.toolchains.snapshot();
    if (!tc.busy) return false;
    if (tc.profileId === profileId) return true;
    const target = tc.profiles.find(p => p.profileId === profileId);
    const original = tc.profiles.find(p => p.profileId === tc.profileId);
    return !!target?.installable && !!original?.installable && !!tc.job &&
      original.planId === tc.job.planId && target.planId === tc.job.planId;
  }
  boardPrepareDisabledReason(deviceId: string, profileId = this.boardProfile(deviceId)?.id) {
    if (!profileId || !this.profiles.some(p => p.id === profileId && p.deviceId === deviceId)) return '此主控暂无可下载的编译环境。';
    if (this.session.portId || this.session.sessionId) return '请先断开串口，再下载主控编译环境。';
    return this.documentBusyReason || this.linkDisabledReason ||
      (this.localService.status !== 'online' ? localServiceUnavailableReason(this.localService) : '') ||
      (this.isPreparingProfile(profileId) ? '' : !this.boardToolchainEvidenceCurrent ? '正在核对当前主控编译环境，请稍候或重新检测。' :
        this.toolchainBusyReason || this.toolchains.disabledReason(profileId));
  }
  // Card downloads never select a board, change the current profile/port, or close a serial session.
  async prepareBoardToolchain(deviceId: string, profileId = this.boardProfile(deviceId)?.id) {
    const profile = this.profiles.find(p => p.id === profileId && p.deviceId === deviceId);
    if (profile?.compileAvailable && profile.uploadAvailable) return;
    const reason = this.boardPrepareDisabledReason(deviceId, profileId);
    if (reason) throw new Error(reason);
    if (this.isPreparingProfile(profile!.id)) return; // Observe the original shared-plan job, never duplicate it.
    if (this.link?.instanceId) this.autoPrepared.add(`${this.link.instanceId}:${profile!.id}`);
    await this.toolchains.prepare(profile!.id);
  }
  prepareDisabledReason(profileId = this.profileId) {
    if (!profileId || !this.profiles.some(p => p.id === profileId && p.deviceId === this.source().deviceId)) return '请先选择当前主控的 Profile。';
    return this.boardPrepareDisabledReason(this.source().deviceId!, profileId);
  }
  async prepareToolchain() {
    const reason = this.prepareDisabledReason();
    if (reason) throw new Error(reason);
    await this.prepareBoardToolchain(this.source().deviceId!, this.profileId);
  }
  private maybeAutoPrepare() {
    if (!this.link || this.linkDisabledReason || this.localService.status !== 'online') return;
    if (!this.boardToolchainEvidenceCurrent) return;
    if (this.busy || this.toolchains.busy || this.session.portId || this.session.sessionId || this.session.operation || this.mutationGuard()) return;
    const deviceId = this.source().deviceId;
    const profile = this.profiles.find(p => p.id === this.profileId && p.deviceId === deviceId);
    if (!profile || (profile.compileAvailable && profile.uploadAvailable)) return;
    const tc = this.toolchains.snapshot(), entry = tc.profiles.find(p => p.profileId === profile.id);
    if (tc.support !== 'available' || entry?.state !== 'missing' || !entry.installable) return;
    const key = `${this.link.instanceId ?? ''}:${profile.id}`;
    if (this.autoPrepared.has(key)) return;
    this.autoPrepared.add(key);
    void this.toolchains.prepare(profile.id).catch(() => undefined);
  }
  canAutoPrepareProfile(profile: HardwareProfile) {
    const tc = this.toolchains.snapshot();
    if (tc.support !== 'available') return false;
    const entry = tc.profiles.find(item => item.profileId === profile.id);
    return !!entry && entry.installable && (entry.state === 'missing' || entry.state === 'preparing' || entry.state === 'failed');
  }
  configure(profileId: string, portId: string) {
    this.assertDocumentIdle();
    if (!this.profiles.some(p => p.id === profileId && p.deviceId === this.source().deviceId)) throw new Error('请选择当前主控的 profile。');
    if (portId && !this.ports.some(p => p.portId === portId)) throw new Error('所选 OS 端口已消失，请刷新后重新选择。');
    const changedProfile = this.profileId !== profileId;
    this.profileId = profileId; this.portId = portId; this.publish();
    if (changedProfile) { this.autoPrepared.delete(`${this.link?.instanceId ?? ''}:${profileId}`); queueMicrotask(() => this.maybeAutoPrepare()); }
  }
  startDisabledReason(upload: boolean) {
    try { this.validateStart(upload); return ''; }
    catch (e) { return describeError(e); }
  }
  private validateStart(upload: boolean, capturedCode?: string) {
    this.assertDocumentIdle();
    if (this.linkDisabledReason) throw new Error(this.linkDisabledReason);
    if (this.session.portId && this.session.status !== 'open') throw new Error('当前串口仍被持有，请先重试断开。');
    if (['requesting', 'opening', 'closing'].includes(this.session.status)) throw new Error('请先完成当前串口操作。');
    const rawSource = this.source();
    const source: HardwareSource = { ...rawSource, moduleIds: [...rawSource.moduleIds], ...(rawSource.libraries ? { libraries: [...rawSource.libraries] } : {}) };
    if (source.programming || source.realtime) throw new Error('请先切换到上传模式。');
    const serviceReason = localServiceUnavailableReason(this.localService);
    if (serviceReason) throw new Error(serviceReason);
    if (!source.deviceId) throw new Error('请先从主控扩展选择主控。');
    if (!this.profiles.some(p => p.deviceId === source.deviceId)) throw new Error('本机服务没有当前主控的 Profile，请检查本机服务配置后重新检测。');
    if (!this.profileId) throw new Error('请先选择当前主控的 Profile。');
    const profile = this.profiles.find(p => p.id === this.profileId && p.deviceId === source.deviceId);
    if (!profile) throw new Error('所选主控 Profile 已失效或不属于当前主控，请重新检测并选择。');
    const tc = this.toolchains.snapshot();
    const preparingCurrent = this.isPreparingProfile(profile.id);
    if (this.toolchains.busy && !preparingCurrent) throw new Error('正在安装其他主控的编译环境，请等待任务结束。');
    const needsPrepare = preparingCurrent || !profile.compileAvailable || (upload && !profile.uploadAvailable);
    if (needsPrepare && !preparingCurrent && !this.canAutoPrepareProfile(profile)) {
      throw new Error(profileUnavailableReason(profile, upload, false));
    }
    if (capturedCode !== undefined && capturedCode !== source.code) throw new Error('上传捕获的代码已变化，请重新使用当前代码编辑器内容。');
    if (source.generationError) throw new Error(source.generationError);
    if (!source.code.trim()) throw new Error('当前代码为空。');
    if (new TextEncoder().encode(source.code).length > 1024 * 1024) throw new Error('当前源码超过 1 MiB。');
    if (upload && this.portError) throw new Error(`${this.portError}。请刷新烧录端口后重试。`);
    if (upload && !this.portId) throw new Error('请先明确选择本机烧录端口。');
    if (upload && !this.ports.some(p => p.portId === this.portId)) throw new Error('所选本机烧录端口已失效，请刷新后重新选择。');
    return { source, profile, needsPrepare };
  }
  start(upload: boolean, capturedCode?: string) {
    if (this.link) return this.ensureLinkReady().then(() => this.beginStart(upload, capturedCode));
    return this.beginStart(upload, capturedCode);
  }
  private beginStart(upload: boolean, capturedCode?: string) {
    const { source, profile, needsPrepare } = this.validateStart(upload, capturedCode);
    this.busy = true; this.cancelled = false; this.use = needsPrepare ? 'preparing' : 'build'; this.pendingAction = needsPrepare ? (upload ? 'upload' : 'compile') : null; this.job = null; this.logs = [];
    this.error = ''; this.restoreError = ''; this.publish();
    void this.run(source, profile.id, upload, this.portId, needsPrepare);
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
  private async run(source: HardwareSource, profileId: string, upload: boolean, portId: string, needsPrepare = false) {
    const prepareInstanceId = this.link?.instanceId;
    let restoreId: string | null = null;
    const restoreOptions = { ...this.session.options };
    let uncertain = false;
    try {
      if (needsPrepare) {
        if (this.session.status === 'open' || this.session.portId) {
          this.use = 'releasing'; this.log('释放当前串口，准备安装主控编译环境。\n');
          restoreId = this.session.status === 'open' ? this.session.portId : null;
          this.stopHardware(); await this.session.close();
          if (this.cancelled) return;
        }
        this.use = 'preparing'; this.log('正在准备当前主控编译环境…\n'); this.publish();
        if (!this.isPreparingProfile(profileId)) {
          this.autoPrepared.add(`${this.link?.instanceId ?? ''}:${profileId}`);
          await this.toolchains.prepare(profileId);
        }
        await this.toolchains.waitUntilIdle();
        if (this.cancelled) {
          this.error = '编译环境安装已取消，已停止后续编译与上传。';
          this.log(`${this.error}\n`);
          return;
        }
        if (this.linkDisabledReason) throw new Error(`CCraft Link 已离线，已中止自动续接：${this.linkDisabledReason}`);
        if (this.link?.instanceId !== prepareInstanceId) throw new Error('CCraft Link 实例已变化，已中止自动续接，请重新发起操作。');
        const tc = this.toolchains.snapshot();
        if (tc.busy) throw new Error('编译环境准备尚未完成，已中止自动续接。');
        if (tc.job?.state === 'cancelled') throw new Error('编译环境安装已取消，已停止后续编译与上传。');
        if (tc.job?.state === 'failed') throw new Error(tc.job.error?.message || tc.error || '编译环境安装失败，请重试。');
        let refreshed = this.profiles.find(p => p.id === profileId && p.deviceId === source.deviceId);
        if (!refreshed || !refreshed.compileAvailable || (upload && !refreshed.uploadAvailable)) {
          await this.checkLocalService(false, this.link?.instanceId);
          refreshed = this.profiles.find(p => p.id === profileId && p.deviceId === source.deviceId);
        }
        if (this.cancelled) return;
        if (this.localService.status !== 'online') throw new Error(localServiceUnavailableReason(this.localService));
        if (!refreshed || !refreshed.compileAvailable || (upload && !refreshed.uploadAvailable)) {
          throw new Error(tc.error || tc.job?.error?.message || (refreshed ? profileUnavailableReason(refreshed, upload, false) : '编译环境准备未就绪，请重试。'));
        }
        const afterPrep = this.source();
        if (afterPrep.programming || afterPrep.realtime) throw new Error('准备编译环境期间已切换出上传模式，已中止自动续接。');
        if (afterPrep.deviceId !== source.deviceId || afterPrep.code !== source.code || afterPrep.documentId !== source.documentId ||
          afterPrep.editVersion !== source.editVersion || this.profileId !== profileId ||
          JSON.stringify(afterPrep.libraries ?? []) !== JSON.stringify(source.libraries ?? [])) {
          throw new Error('准备编译环境期间项目、主控或代码已变化，请重新发起操作。');
        }
        if (upload) {
          if (this.portId !== portId) throw new Error('准备编译环境期间烧录端口已变化，请重新发起操作。');
          const portGen = ++this.portGeneration;
          this.portCheck?.abort(); this.portCheck = undefined;
          const avail = uploadPorts(await this.json<unknown>('/ports'));
          if (portGen === this.portGeneration) { this.ports = avail; this.portError = ''; }
          if (!avail.some(p => p.portId === portId)) { this.portId = ''; throw new Error('准备编译环境期间所选烧录端口已消失，请刷新后重新选择。'); }
        }
        if (this.cancelled) return;
        if (this.linkDisabledReason || this.link?.instanceId !== prepareInstanceId) throw new Error('CCraft Link 状态已变化，已中止自动续接，请重新发起操作。');
        const current = this.source();
        if (current.programming || current.realtime || current.deviceId !== source.deviceId || current.documentId !== source.documentId ||
          current.editVersion !== source.editVersion || current.code !== source.code || this.profileId !== profileId || (upload && this.portId !== portId) ||
          JSON.stringify(current.libraries ?? []) !== JSON.stringify(source.libraries ?? [])) throw new Error('准备编译环境期间项目或配置已变化，请重新发起操作。');
        this.pendingAction = null; this.use = 'build'; this.publish();
      }
      this.log('编译当前代码编辑器内容。\n');
      const build = await this.poll(await this.submit('/builds', {
        deviceId: source.deviceId as DeviceId, profileId, code: source.code, moduleIds: source.moduleIds,
        ...(source.libraries?.length ? { libraries: source.libraries } : {}),
      }, 'build'));
      if (build.state !== 'succeeded' || this.cancelled || !upload) return;
      const now = this.source();
      if (now.deviceId !== source.deviceId || now.code !== source.code || now.documentId !== source.documentId ||
        now.editVersion !== source.editVersion || this.profileId !== profileId ||
        JSON.stringify(now.libraries ?? []) !== JSON.stringify(source.libraries ?? [])) {
        throw new Error('构建期间项目、主控或代码已变化，请重新上传当前代码。');
      }
      const portGeneration = ++this.portGeneration;
      this.portCheck?.abort(); this.portCheck = undefined;
      const available = uploadPorts(await this.json<unknown>('/ports'));
      if (portGeneration === this.portGeneration) { this.ports = available; this.portError = ''; }
      if (!available.some(p => p.portId === portId)) { this.portId = ''; throw new Error('所选烧录端口已消失，请刷新后重新选择。'); }
      if (this.cancelled) return;
      if (this.session.status === 'open' || this.session.portId) {
        this.use = 'releasing'; this.log('释放当前串口，等待读写结束。\n');
        if (!restoreId && this.session.status === 'open') restoreId = this.session.portId;
        this.stopHardware(); await this.session.close();
      }
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
      this.pendingAction = null;
      if (!uncertain) { this.busy = false; this.use = 'idle'; }
      this.publish();
    }
  }
  async cancel() {
    if (!this.busy) return this.snapshot();
    this.cancelled = true;
    if (this.use === 'preparing' && this.toolchains.busy) {
      await this.toolchains.cancel();
    } else if (this.job && !terminal(this.job)) {
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
