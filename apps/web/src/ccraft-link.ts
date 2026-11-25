export interface LinkHealth {
  product: 'ccraft-link'; protocolVersion: 1; version: string; instanceId: string; serialDetection: 'serialport.list';
}
export interface LinkState { status: 'unknown' | 'checking' | 'ready' | 'missing'; message: string; health?: LinkHealth }
export interface LinkGuard {
  readonly reason: string;
  ensureReady(): Promise<void>;
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
  private guiding = false;
  private downloaded = false;
  readonly base: string;
  private request: typeof fetch;
  private download: () => void;
  private storage?: Pick<Storage, 'getItem' | 'setItem'>;
  private timeoutMs: number;
  constructor(base: string, request: typeof fetch = fetch, download = () => {},
    storage?: Pick<Storage, 'getItem' | 'setItem'>, timeoutMs = 3000) {
    this.base = base; this.request = request.bind(globalThis); this.download = download; this.storage = storage; this.timeoutMs = timeoutMs;
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish() { this.listeners.forEach(listener => listener()); }
  get reason() {
    if (this.state.status === 'ready' || this.state.status === 'checking' && this.state.health && !this.guiding) return '';
    return this.state.status === 'checking' ? '正在检测 CCraft Link，请稍候。' : '请安装并启动 CCraft Link 后使用硬件功能。';
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.disposed && this.active && this.guiding) this.timer = setTimeout(() => { void this.check(); }, 3000);
  }
  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active; clearTimeout(this.timer);
    if (!active) {
      ++this.generation; this.abort?.abort(); this.abort = undefined; this.pending = undefined;
      if (this.state.status === 'checking') this.state = { status: this.guiding ? 'missing' : 'unknown', message: '恢复页面后继续检测 CCraft Link。' };
      this.publish();
    } else if (this.guiding || this.state.status === 'unknown') void this.check();
  }
  private autoDownload() {
    const key = 'ccraft.link.installer.downloaded.v1';
    if (this.downloaded) return;
    this.downloaded = true;
    try { if (this.storage?.getItem(key)) return; this.storage?.setItem(key, '1'); } catch { /* In-memory deduplication still works. */ }
    try { this.download(); } catch { /* A blocked automatic download leaves the explicit download link available. */ }
  }
  check(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.pending) return this.pending;
    const generation = ++this.generation, abort = this.abort = new AbortController();
    clearTimeout(this.timer);
    this.state = { status: 'checking', message: '正在检测 CCraft Link…', health: this.state.health };
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
        this.guiding = false; this.state = { status: 'ready', health, message: `CCraft Link ${health.version} 已就绪。` }; this.publish(); return true;
      } catch (error) {
        if (generation !== this.generation || this.disposed) return false;
        this.guiding = true; this.state = { status: 'missing', message: error instanceof Error ? error.message : String(error) };
        this.publish(); this.autoDownload(); return false;
      } finally {
        clearTimeout(timeout); abort.signal.removeEventListener('abort', onAbort);
        if (generation === this.generation) { this.pending = undefined; this.abort = undefined; this.schedule(); }
      }
    })();
    this.pending = work; this.publish(); return work;
  }
  async ensureReady() { if (!await this.check()) throw new Error(this.reason); }
  dispose() { this.disposed = true; ++this.generation; clearTimeout(this.timer); this.abort?.abort(); this.listeners.clear(); }
}

export function mountLinkGuide(link: CCraftLink, downloadUrl: string, doc = document, host = window) {
  const panel = doc.createElement('section'); panel.className = 'ccraft-link-guide'; panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'ccraft-link-title'); panel.setAttribute('data-testid', 'ccraft-link-guide');
  const title = doc.createElement('h2'); title.id = 'ccraft-link-title'; title.textContent = '安装并启动 CCraft Link';
  const description = doc.createElement('p'); description.textContent = '设备连接、编译和上传必须先运行 CCraft Link。已尝试自动下载安装包；若下载未开始，请点击下方下载安装包。安装完成后请启动 CCraft Link。您可以继续离线编辑项目。';
  const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const permission = doc.createElement('p'); permission.textContent = '若已启动仍无法连接，请允许本站访问本地网络。此处每 3 秒自动重新检测。';
  const download = doc.createElement('a'); download.href = downloadUrl; download.download = 'CCraft-Link-Setup.exe'; download.textContent = '下载安装包';
  const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = '重新检测'; retry.onclick = () => { void link.check(); };
  panel.append(title, description, status, permission, download, retry); doc.body.append(panel);
  let shown = false;
  const stop = link.subscribe(() => {
    if (link.state.status === 'missing') shown = true;
    if (link.state.status === 'ready') shown = false;
    panel.hidden = !shown; status.textContent = link.state.message; retry.disabled = link.state.status === 'checking';
  });
  const visibility = () => link.setActive(doc.visibilityState !== 'hidden' && doc.hasFocus());
  doc.addEventListener('visibilitychange', visibility); host.addEventListener('focus', visibility); host.addEventListener('blur', visibility);
  return () => { stop(); panel.remove(); doc.removeEventListener('visibilitychange', visibility); host.removeEventListener('focus', visibility); host.removeEventListener('blur', visibility); link.dispose(); };
}

export function downloadLinkInstaller(url: string, doc = document) {
  const anchor = doc.createElement('a'); anchor.href = url; anchor.download = 'CCraft-Link-Setup.exe';
  doc.body.append(anchor); anchor.click(); anchor.remove();
}
