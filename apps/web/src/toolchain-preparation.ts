import { describeError } from './hardware-session.ts';
import type { HardwareLog, ToolchainCatalog, ToolchainJob, ToolchainSnapshot } from './hardware-types.ts';

const working = (job: ToolchainJob) => job.state === 'running' || job.state === 'cancelling';
const nonempty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const byteCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const upgradeMessage = '此版本的 CCraft Link 不支持按需安装。请更新 CCraft Link 后重新检测。';

function readCatalog(data: any): ToolchainCatalog {
  if (data?.supported !== true || !(data.activeJobId === null || nonempty(data.activeJobId)) ||
    !Array.isArray(data.profiles) || !data.profiles.every((profile: any) => nonempty(profile?.profileId) &&
      nonempty(profile.planId) && ['missing', 'preparing', 'ready', 'failed'].includes(profile.state) &&
      typeof profile.installable === 'boolean' && (profile.reason === undefined || typeof profile.reason === 'string')) ||
    new Set(data.profiles.map((profile: any) => profile.profileId)).size !== data.profiles.length) {
    throw new Error('主控编译环境列表格式无效。');
  }
  return data;
}

function readJob(data: any, id?: string): ToolchainJob {
  const job = data?.job;
  const progress = job?.progress;
  if (!nonempty(job?.id) || (id !== undefined && job.id !== id) || !nonempty(job.profileId) ||
    !nonempty(job.planId) || !nonempty(job.createdAt) ||
    !['running', 'cancelling', 'succeeded', 'failed', 'cancelled'].includes(job.state) ||
    !['resolving', 'downloading', 'installing', 'validating', 'complete'].includes(job.phase) ||
    (working(job) === (job.phase === 'complete')) ||
    (job.error !== undefined && (!nonempty(job.error?.code) || !nonempty(job.error?.message))) ||
    (progress !== undefined && (!byteCount(progress?.downloadedBytes) ||
      (progress.totalBytes !== undefined && (!byteCount(progress.totalBytes) || progress.totalBytes < progress.downloadedBytes))))) {
    throw new Error('编译环境安装任务格式无效。');
  }
  return job;
}

function retainLogs(previous: HardwareLog[], incoming: HardwareLog[]) {
  const logs = [...previous, ...incoming].slice(-1000);
  const encoder = new TextEncoder();
  let bytes = 0;
  let start = logs.length - 1;
  for (; start >= 0; start--) {
    bytes += encoder.encode(logs[start].text).byteLength;
    if (bytes > 1024 * 1024) break;
  }
  return logs.slice(start + 1);
}

class ToolchainHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// Observes the current Link instance without making installation a build or upload job.
export class ToolchainPreparation {
  private instanceId?: string;
  private online = false;
  private lifetime = new AbortController();
  private reading?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private lastCatalog = 0;
  private epoch = 0;
  private catalogEpoch = -1;
  private jobEpoch = -1;
  private planRevision = 0;
  private support: ToolchainSnapshot['support'] = 'unknown';
  private catalog?: ToolchainCatalog;
  private targetJobId?: string;
  private submission?: { profileId: string; phase: 'posting' | 'unknown' };
  private job: ToolchainJob | null = null;
  private logs: HardwareLog[] = [];
  private cursor = 0;
  private cancelling?: string;
  private cancelAcknowledged = false;
  private cancelError = '';
  private reconcilingInstance = false;
  private revalidating = false;
  private message = '';
  private error = '';
  private readonly base: string;
  private readonly request: typeof fetch;
  private readonly publish: () => void;
  private readonly refreshCapabilities: (instanceId: string, epoch: number, force: boolean) => Promise<boolean>;
  private idleWaiters = new Set<() => void>();

  constructor(base: string, request: typeof fetch, publish: () => void,
    refreshCapabilities: (instanceId: string, epoch: number, force: boolean) => Promise<boolean>) {
    this.base = base.replace(/\/$/, '');
    this.request = request.bind(globalThis);
    this.publish = () => { if (!this.busy) this.flushIdleWaiters(); publish(); };
    this.refreshCapabilities = refreshCapabilities;
  }

  get busy() { return !!this.submission || !!this.targetJobId || this.reconcilingInstance || this.revalidating; }
  // Local evidence only; neither cached flags nor a successful old request prove this connection's state.
  get observation() {
    return { instanceId: this.instanceId, epoch: this.epoch, planRevision: this.planRevision, online: this.online,
      catalogCurrent: this.online && this.catalogEpoch === this.epoch && this.support === 'available',
      jobCurrent: this.online && this.jobEpoch === this.epoch };
  }
  private isCurrent(lifetime: AbortSignal, epoch: number) { return this.online && !lifetime.aborted && epoch === this.epoch; }
  private flushIdleWaiters() { const waiters = [...this.idleWaiters]; this.idleWaiters.clear(); waiters.forEach(resolve => resolve()); }
  waitUntilIdle(): Promise<void> { if (!this.busy || !this.online || this.lifetime.signal.aborted) return Promise.resolve(); return new Promise(resolve => { this.idleWaiters.add(resolve); }); }
  snapshot(): ToolchainSnapshot {
    return { support: this.support, profiles: this.catalog?.profiles ?? [],
      busy: this.busy, profileId: this.job?.profileId ?? this.submission?.profileId ?? null, job: this.job, logs: this.logs,
      cancelAvailable: !!this.targetJobId && this.online && !this.cancelAcknowledged && !this.cancelling &&
        (!this.job || this.job.state === 'running'),
      message: this.busy && !this.online ? '等待 CCraft Link 恢复，安装结果尚未确认。' : this.message,
      error: this.error || this.cancelError };
  }
  observeInstance(instanceId?: string) {
    if (this.lifetime.signal.aborted) return;
    const recovered = !this.online;
    const changed = !!instanceId && this.instanceId !== instanceId;
    if (this.online !== !!instanceId || changed) {
      this.epoch++; this.catalogEpoch = -1; this.reading = undefined; this.revalidating = false;
    }
    this.online = !!instanceId;
    if (!instanceId) { clearTimeout(this.timer); this.flushIdleWaiters(); return; }
    if (changed) {
      const interrupted = this.busy;
      clearTimeout(this.timer); this.lifetime.abort(); this.lifetime = new AbortController();
      this.instanceId = instanceId;
      this.catalog = undefined; this.support = 'unknown'; this.reading = undefined;
      this.submission = undefined; this.cancelling = undefined; this.revalidating = false;
      this.cancelAcknowledged = false; this.cancelError = ''; this.reconcilingInstance = interrupted;
      this.targetJobId = undefined; this.job = null; this.cursor = 0; this.logs = []; this.error = '';
      this.message = interrupted ? 'CCraft Link 已重启，正在检查当前编译环境。' : '';
    }
    if (changed || recovered || !this.busy && this.support !== 'legacy' && Date.now() - this.lastCatalog >= 3000) {
      void this.refresh();
    }
  }
  dispose() { this.online = false; this.epoch++; this.lifetime.abort(); clearTimeout(this.timer); this.flushIdleWaiters(); }

  disabledReason(profileId: string) {
    if (!this.online) return '请先连接 CCraft Link。';
    if (this.busy) return '编译环境安装仍在进行，请等待结果。';
    if (this.support === 'legacy') return upgradeMessage;
    if (!this.observation.catalogCurrent) return this.error || '正在读取可安装的主控编译环境。';
    const profile = this.catalog!.profiles.find(entry => entry.profileId === profileId);
    if (!profile?.installable) return profile?.reason || '当前主控没有可安装的编译环境。';
    return '';
  }
  async prepare(profileId: string) {
    const reason = this.disabledReason(profileId);
    if (reason) throw new Error(reason);
    const lifetime = this.lifetime.signal;
    const epoch = this.epoch;
    const profile = this.catalog!.profiles.find(entry => entry.profileId === profileId)!;
    this.submission = { profileId, phase: 'posting' };
    this.job = null; this.logs = []; this.cursor = 0; this.error = ''; this.cancelError = '';
    this.message = '正在提交编译环境安装…';
    this.publish();
    // Finish a pre-submission read before issuing the only prepare POST.
    await this.reading;
    if (lifetime.aborted) return;
    try {
      if (!this.online) throw new ToolchainHttpError(0, 'CCraft Link 已离线，请重新检测。');
      const job = readJob(await this.json('/toolchains/prepare', lifetime, { profileId }));
      if (lifetime.aborted) return;
      if (job.profileId !== profileId || job.planId !== profile.planId) throw new Error('安装任务与所选主控不一致。');
      this.submission = undefined;
      this.targetJobId = job.id; this.job = job;
      this.jobEpoch = this.isCurrent(lifetime, epoch) ? epoch : -1;
      this.message = '';
    } catch (failure) {
      if (lifetime.aborted) return;
      if (failure instanceof ToolchainHttpError && failure.status < 500 && failure.status !== 409) {
        this.submission = undefined;
        this.error = describeError(failure);
        this.message = '';
      } else {
        this.submission = { profileId, phase: 'unknown' };
        this.message = '提交结果尚未确认，正在向 CCraft Link 查询任务。';
        this.error = describeError(failure);
      }
    }
    this.publish();
    await this.refresh();
  }
  async cancel() {
    if (!this.snapshot().cancelAvailable) return;
    const id = this.targetJobId!;
    const lifetime = this.lifetime.signal;
    this.cancelling = id; this.cancelError = ''; this.message = '正在确认取消请求…'; this.publish();
    try {
      const job = readJob(await this.json(`/toolchains/jobs/${encodeURIComponent(id)}/cancel`, lifetime, {}), id);
      if (lifetime.aborted || this.targetJobId !== id) return;
      this.cancelAcknowledged = job.state !== 'running';
      this.error = ''; this.message = '已收到取消响应，正在确认任务结果。';
    } catch (failure) {
      if (lifetime.aborted || this.targetJobId !== id) return;
      this.cancelError = `取消尚未确认，仍在监控任务：${describeError(failure)}`;
      this.message = '';
    } finally {
      if (!lifetime.aborted && this.cancelling === id) {
        this.cancelling = undefined; this.publish(); void this.refresh();
      }
    }
  }
  refresh(): Promise<void> {
    if (!this.online || this.lifetime.signal.aborted || this.submission?.phase === 'posting') return Promise.resolve();
    if (this.reading) return this.reading;
    clearTimeout(this.timer);
    const lifetime = this.lifetime.signal;
    const epoch = this.epoch;
    const run = Promise.resolve().then(() => this.read(lifetime, epoch)).catch(failure => {
      if (!this.isCurrent(lifetime, epoch)) return;
      this.catalogEpoch = -1;
      this.error = `${this.busy ? '安装结果尚未确认' : '无法读取主控编译环境'}：${describeError(failure)}`;
    }).finally(() => {
      if (!this.isCurrent(lifetime, epoch)) return;
      if (this.reading === run) this.reading = undefined;
      if (this.online && this.busy && this.submission?.phase !== 'posting') {
        this.timer = setTimeout(() => { void this.refresh(); }, 650);
      }
      this.publish();
    });
    this.reading = run;
    return run;
  }
  private async read(lifetime: AbortSignal, epoch: number) {
    if (!this.isCurrent(lifetime, epoch)) return;
    const watched = this.targetJobId;
    if (watched && await this.readWatchedJob(watched, lifetime, epoch)) return;
    if (!this.isCurrent(lifetime, epoch)) return;

    let catalog: ToolchainCatalog;
    this.lastCatalog = Date.now();
    try {
      const data = await this.json('/toolchains', lifetime);
      if ((data as { supported?: unknown } | null)?.supported === false) {
        throw new ToolchainHttpError(404, upgradeMessage);
      }
      catalog = readCatalog(data);
    }
    catch (failure) {
      if (!this.isCurrent(lifetime, epoch)) return;
      if (!(failure instanceof ToolchainHttpError) || failure.status !== 404 || this.targetJobId || this.submission) throw failure;
      this.reconcilingInstance = false; this.catalog = undefined; this.support = 'legacy'; this.error = ''; this.message = upgradeMessage;
      return;
    }
    if (!this.isCurrent(lifetime, epoch) || this.submission?.phase === 'posting') return;
    const recoveredProfile = this.submission?.profileId ?? (this.targetJobId ? this.job?.profileId : undefined);
    const lostJob = !!this.targetJobId;
    const restarted = this.reconcilingInstance;
    const firstObservation = this.catalogEpoch !== epoch;
    const plans = (value: ToolchainCatalog) => JSON.stringify(value.profiles.map(p => [p.profileId, p.planId]).sort());
    const plansChanged = !!this.catalog && plans(this.catalog) !== plans(catalog);
    if (plansChanged) this.planRevision++;
    this.reconcilingInstance = false;
    this.catalog = catalog; this.catalogEpoch = epoch; this.support = 'available';
    if (catalog.activeJobId) {
      const id = catalog.activeJobId;
      this.submission = undefined;
      if (this.targetJobId !== id) {
        this.targetJobId = id; this.job = null; this.logs = []; this.cursor = 0;
        this.cancelling = undefined; this.cancelAcknowledged = false; this.cancelError = '';
        this.message = '正在查看 CCraft Link 上的编译环境安装任务。';
      }
      await this.readWatchedJob(id, lifetime, epoch);
      return;
    }
    this.targetJobId = undefined; this.submission = undefined;
    if (recoveredProfile || lostJob) {
      this.job = null; this.message = '';
      this.cancelAcknowledged = false; this.cancelError = '';
      if (recoveredProfile && catalog.profiles.some(profile => profile.profileId === recoveredProfile && profile.state === 'ready')) {
        this.error = '';
        await this.revalidate(lifetime, epoch, '已检查当前编译环境。需要时请手动发起编译或上传。');
      } else {
        this.error = `CCraft Link 没有正在进行的安装任务。核对当前环境后可重试。${this.error ? ` ${this.error}` : ''}`;
      }
    } else if (restarted || firstObservation || plansChanged) {
      await this.revalidate(lifetime, epoch, this.message || '已重新检测 CCraft Link。可查看当前主控编译环境。', restarted || plansChanged);
    } else {
      // An idle catalog read can see a change made by another Link client.
      await this.refreshCapabilities(this.instanceId!, epoch, false);
    }
  }
  private async readWatchedJob(id: string, lifetime: AbortSignal, epoch: number): Promise<boolean> {
    let data: any;
    try { data = await this.json(`/toolchains/jobs/${encodeURIComponent(id)}?afterLog=${this.cursor}`, lifetime); }
    catch (failure) {
      if (failure instanceof ToolchainHttpError && failure.status === 404) return false;
      throw failure;
    }
    if (!this.isCurrent(lifetime, epoch)) return true;
    const job = readJob(data, id);
    if (!byteCount(data.nextLog) || data.nextLog < this.cursor || !Array.isArray(data.logs) ||
      !data.logs.every((log: any) => byteCount(log?.index) && ['stdout', 'stderr', 'system'].includes(log.stream) && typeof log.text === 'string')) {
      throw new Error('编译环境安装日志格式无效。');
    }
    this.job = job; this.jobEpoch = epoch; this.logs = retainLogs(this.logs, data.logs); this.cursor = data.nextLog;
    if (working(job)) {
      this.error = '';
      if (job.state === 'cancelling') { this.cancelError = ''; this.message = ''; }
      return true;
    }
    this.targetJobId = undefined;
    this.error = ''; this.cancelError = ''; this.cancelAcknowledged = false;
    this.message = job.state === 'cancelled' ? '编译环境安装已取消。' :
      job.state === 'failed' ? '编译环境安装失败，可以重试。' : '';
    if (job.state === 'succeeded') {
      await this.revalidate(lifetime, epoch, '编译环境已安装。请按需点击“编译检查”或“编译并上传”。');
    }
    return false;
  }
  private async revalidate(lifetime: AbortSignal, epoch: number, message: string, force = true) {
    if (!this.isCurrent(lifetime, epoch)) return;
    this.revalidating = true; this.message = '正在刷新编译和上传能力…'; this.publish();
    try {
      const refreshed = await this.refreshCapabilities(this.instanceId!, epoch, force);
      if (this.isCurrent(lifetime, epoch)) this.message = refreshed ? message : '尚未确认当前编译和上传能力，请重新检测本机服务。';
    } finally {
      if (this.isCurrent(lifetime, epoch)) this.revalidating = false;
    }
  }
  private async json(path: string, lifetime: AbortSignal, body?: object): Promise<unknown> {
    const signal = AbortSignal.any([lifetime, AbortSignal.timeout(8000)]);
    signal.throwIfAborted();
    let abort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
    });
    try {
      return await Promise.race([(async () => {
        const response = await this.request(`${this.base}${path}`, {
          method: body ? 'POST' : 'GET', cache: 'no-store', signal,
          ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        });
        const data = await response.json().catch(() => undefined);
        if (!response.ok) throw new ToolchainHttpError(response.status, data?.error?.message || `本机服务返回 ${response.status}。`);
        return data;
      })(), aborted]);
    } finally { signal.removeEventListener('abort', abort); }
  }
}
