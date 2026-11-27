export interface LinkHealth {
  product: 'ccraft-link'; protocolVersion: 1; version: string; instanceId: string; serialDetection: 'serialport.list';
}
export interface LinkState { status: 'unknown' | 'checking' | 'ready' | 'missing'; message: string; health?: LinkHealth }
export interface LinkGuard {
  readonly reason: string;
  readonly instanceId?: string;
  ensureReady(showGuide?: boolean): Promise<void>;
  subscribe(listener: () => void): () => void;
}
const nonempty = (value: unknown) => typeof value === 'string' && !!value.trim();
export function isLinkHealth(value: unknown): value is LinkHealth {
  const v = value as Partial<LinkHealth> | null;
  return !!v && v.product === 'ccraft-link' && v.protocolVersion === 1 && nonempty(v.version) && nonempty(v.instanceId) && v.serialDetection === 'serialport.list';
}

// A check includes parsing the response body. Abort alone does not bound a stalled body or ignored signal.
export class CCraftLink implements LinkGuard {
  state: LinkState = { status: 'unknown', message: '尚未检测 CCraft Link。' };
  private listeners = new Set<() => void>();
  private pending?: Promise<boolean>;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private active = true;
  private disposed = false;
  private guideOpen = false;
  readonly base: string;
  private request: typeof fetch;
  private timeoutMs: number;
  constructor(base: string, request: typeof fetch = fetch, timeoutMs = 3000) {
    this.base = base; this.request = request.bind(globalThis); this.timeoutMs = timeoutMs;
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish() { this.listeners.forEach(listener => listener()); }
  get showingGuide() { return this.guideOpen; }
  get checking() { return !!this.pending; }
  get instanceId() { return this.state.health?.instanceId; }
  get reason() {
    if (this.state.status === 'ready') return '';
    return this.state.status === 'checking' ? '正在检测 CCraft Link，请稍候。' : '请安装并启动 CCraft Link 后使用硬件功能。';
  }
  showGuide() {
    if (this.disposed || !this.active || this.state.status === 'ready' || this.guideOpen) return;
    this.guideOpen = true; this.publish();
  }
  hideGuide() {
    if (!this.guideOpen) return;
    this.guideOpen = false; this.publish();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.disposed && this.active) this.timer = setTimeout(() => { void this.check(); }, 3000);
  }
  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active; clearTimeout(this.timer);
    if (!active) {
      ++this.generation; this.abort?.abort(); this.abort = undefined; this.pending = undefined;
      if (this.state.status === 'checking') this.state = { status: 'unknown', message: '恢复页面后继续检测 CCraft Link。' };
      this.publish();
    } else void this.check();
  }
  check(): Promise<boolean> {
    if (this.disposed || !this.active) return Promise.resolve(false);
    if (this.pending) return this.pending;
    const generation = ++this.generation, abort = this.abort = new AbortController();
    clearTimeout(this.timer);
    // Keep the last confirmed online status visible while checking it again.
    if (this.state.status !== 'ready') this.state = { status: 'checking', message: '正在检测 CCraft Link…' };
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(abort.signal.reason);
    abort.signal.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => abort.abort(new Error('CCraft Link 检测超时（3 秒）。')), this.timeoutMs);
    const work = (async () => {
      try {
        const health = await Promise.race([(async () => {
          const response = await this.request(`${this.base.replace(/\/$/, '')}/link/health`, { method: 'GET', cache: 'no-store', signal: abort.signal });
          if (!response.ok) throw new Error(`CCraft Link 健康检测返回 ${response.status}。`);
          const data: unknown = await response.json();
          if (!isLinkHealth(data)) throw new Error('检测到的服务不是兼容的 CCraft Link，请安装或更新 CCraft Link。');
          return data;
        })(), aborted]);
        if (generation !== this.generation || this.disposed) return false;
        this.guideOpen = false;
        this.state = { status: 'ready', health, message: `CCraft Link ${health.version} 已就绪。` };
        return true;
      } catch (error) {
        if (generation !== this.generation || this.disposed) return false;
        this.state = { status: 'missing', message: error instanceof TypeError ? '暂未连接到本机 CCraft Link。' : String(error instanceof Error ? error.message : error) };
        return false;
      } finally {
        clearTimeout(timeout); abort.signal.removeEventListener('abort', onAbort);
        if (generation === this.generation) { this.pending = undefined; this.abort = undefined; this.schedule(); this.publish(); }
      }
    })();
    this.pending = work; this.publish(); return work;
  }
  async ensureReady(showGuide = true) {
    if (await this.check()) return;
    if (showGuide) this.showGuide();
    throw new Error(this.reason || '页面恢复后请重新检测 CCraft Link。');
  }
  dispose() { this.disposed = true; ++this.generation; clearTimeout(this.timer); this.abort?.abort(); this.listeners.clear(); }
}

const launchUrl = 'ccraft-link://launch';

export function mountLinkGuide(link: CCraftLink, downloadUrl: string | undefined, doc = document, host = window) {
  const panel = doc.createElement('dialog'); panel.className = 'ccraft-link-guide';
  panel.setAttribute('aria-labelledby', 'ccraft-link-title'); panel.setAttribute('data-testid', 'ccraft-link-guide');
  const header = doc.createElement('div'); header.className = 'ccraft-link-guide-header';
  const title = doc.createElement('h2'); title.id = 'ccraft-link-title'; title.textContent = '安装并启动 CCraft Link';
  const close = doc.createElement('button'); close.type = 'button'; close.textContent = '×';
  close.setAttribute('aria-label', '关闭连接引导'); close.onclick = () => panel.close();
  header.append(title, close);

  const body = doc.createElement('div'); body.className = 'ccraft-link-guide-body';
  const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const description = doc.createElement('p'); description.textContent = downloadUrl
    ? '连接主控、编译和烧录需要在本机运行 CCraft Link。'
    : '连接主控、编译和烧录需要运行 CCraft Link，目前只提供 Windows 安装包。';
  body.append(description);

  const steps = doc.createElement('div'); steps.className = 'ccraft-link-guide-steps';
  function launchLink() {
    if (link.state.status === 'ready') return;
    // Stay in the original user gesture, including when the editor is embedded.
    // This requests an external handler; only health can confirm Link is running.
    try { (host.top ?? host).location.href = launchUrl; }
    catch { status.textContent = '浏览器未能打开 CCraft Link，请从 Windows 开始菜单启动后重新检测。'; }
    void link.check();
  }
  if (downloadUrl) {
    const install = doc.createElement('p'); install.textContent = '首次使用，请下载并安装 CCraft Link。';
    const download = doc.createElement('a'); download.href = downloadUrl; download.download = 'CCraft-Link-Setup.exe';
    download.textContent = '下载 Windows 安装包'; download.className = 'ccraft-link-guide-action';
    const start = doc.createElement('p'); start.textContent = '已安装时可直接打开。若浏览器未调起，请从 Windows 开始菜单启动 CCraft Link，或更新安装包。';
    const launch = doc.createElement('button'); launch.type = 'button';
    launch.textContent = '打开 CCraft Link'; launch.className = 'ccraft-link-guide-action';
    launch.onclick = launchLink;
    steps.append(install, download, start, launch);
    body.append(steps);
  }

  const permission = doc.createElement('p'); permission.className = 'ccraft-link-guide-note';
  permission.textContent = '若已启动仍无法连接，请在浏览器中允许本站访问本地网络。关闭此窗口可继续离线编辑。';
  const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = '重新检测';
  retry.className = 'ccraft-link-guide-action'; retry.onclick = () => { void link.check(); };
  status.className = 'ccraft-link-guide-status';
  body.append(status, permission, retry); panel.append(header, body); doc.body.append(panel);

  let returnFocus: HTMLElement | null = null;
  const stop = link.subscribe(() => {
    if (link.showingGuide && !panel.open) {
      returnFocus = doc.activeElement as HTMLElement | null;
      panel.showModal();
    } else if (!link.showingGuide && panel.open) {
      panel.close();
      queueMicrotask(() => {
        if (returnFocus?.isConnected) returnFocus.focus();
        else doc.querySelector<HTMLElement>('[data-cfzn-link-restored-focus]')?.focus();
      });
    }
    status.textContent = link.state.message;
    retry.disabled = link.checking;
  });
  panel.addEventListener('close', () => { if (!panel.open) link.hideGuide(); });

  const visibility = () => link.setActive(doc.visibilityState !== 'hidden');
  const onPageHide = (event: PageTransitionEvent) => { if (event.persisted) link.setActive(false); else dispose(); };
  function dispose() {
    stop(); panel.remove(); link.dispose();
    doc.removeEventListener('visibilitychange', visibility);
    host.removeEventListener('pagehide', onPageHide);
    host.removeEventListener('pageshow', visibility);
  }
  doc.addEventListener('visibilitychange', visibility);
  host.addEventListener('pagehide', onPageHide);
  host.addEventListener('pageshow', visibility);
  visibility(); void link.check();

  return {
    connect() {
      if (link.state.status === 'ready') return;
      link.showGuide();
      // External app activation must happen in the original click, before any async check.
      if (downloadUrl) launchLink();
      else void link.check();
    },
    dispose,
  };
}
