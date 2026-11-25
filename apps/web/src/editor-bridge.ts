import { envelope, isEnvelope, isProjectToolbarAction } from './editor-protocol.ts';
import type { EditorRequests, EditorSnapshot, ProjectToolbarAction, ProjectToolbarState } from './editor-protocol';

interface BridgeCallbacks {
  onState: (state: EditorSnapshot) => void;
  onReplace: (state: EditorSnapshot) => void;
  onBootState: (state: EditorBootState) => void;
  onImport: (file: { bytes: ArrayBuffer; name: string }) => void;
  onImportError: (message: string) => void;
  onToolbarAction: (action: ProjectToolbarAction) => void;
}

export interface EditorBootState { phase: 'loading' | 'slow' | 'error' | 'ready'; message: string }

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

export class EditorBridge {
  private pending = new Map<string, Pending>();
  private startupTimers: number[] = [];
  private ready = false;
  private disposed = false;
  private bootPhase: EditorBootState['phase'] = 'loading';
  private target: Window | null;
  private toolbarState: ProjectToolbarState | undefined;
  private frame: HTMLIFrameElement;
  private callbacks: BridgeCallbacks;

  constructor(frame: HTMLIFrameElement, callbacks: BridgeCallbacks) {
    this.frame = frame; this.callbacks = callbacks;
    this.target = frame.contentWindow;
    window.addEventListener('message', this.receive);
    frame.addEventListener('load', this.hello);
    this.bootState('loading', '正在启动 CCraft 编辑器…');
    this.startupTimers = [
      window.setTimeout(() => { if (!this.ready && !this.disposed) this.bootState('slow', '编辑器加载较慢，仍在等待，请保持页面打开。'); }, 45_000),
      window.setTimeout(() => { if (!this.ready && !this.disposed) this.bootError('等待 CCraft 编辑器就绪已超过 180 秒，可重新加载编辑器。'); }, 180_000),
    ];
    this.hello();
  }

  get canRetryStartup() { return !this.disposed && !this.ready && this.bootPhase === 'error'; }
  private clearStartupTimers() { this.startupTimers.forEach(timer => window.clearTimeout(timer)); this.startupTimers = []; }
  private bootState(phase: EditorBootState['phase'], message: string) {
    this.bootPhase = phase; this.callbacks.onBootState({ phase, message });
  }
  private bootError(message: string) {
    if (this.ready || this.disposed) return;
    this.clearStartupTimers(); this.bootState('error', message);
  }

  private hello = () => {
    if (this.disposed) return;
    this.target = this.frame.contentWindow;
    this.target?.postMessage(envelope('HELLO'), window.location.origin);
  };

  private receive = (event: MessageEvent) => {
    if (this.disposed || event.source !== this.target || event.origin !== window.location.origin || !isEnvelope(event.data)) return;
    const { type, requestId, payload } = event.data;
    switch (type) {
      case 'READY':
        this.ready = true;
        this.clearStartupTimers();
        this.bootState('ready', '');
        this.callbacks.onState(payload as EditorSnapshot);
        if (this.toolbarState) this.setToolbarState(this.toolbarState);
        break;
      case 'CHANGED': if (this.ready) this.callbacks.onState(payload as EditorSnapshot); break;
      case 'REPLACED': if (this.ready) this.callbacks.onReplace(payload as EditorSnapshot); break;
      case 'BOOT_ERROR':
        this.bootError(typeof (payload as { message?: unknown })?.message === 'string' ? (payload as { message: string }).message : 'CCraft 编辑器启动失败，可重新加载编辑器。');
        break;
      case 'IMPORT_REQUEST': if (this.ready) this.callbacks.onImport(payload as { bytes: ArrayBuffer; name: string }); break;
      case 'IMPORT_ERROR': if (this.ready) this.callbacks.onImportError((payload as { message: string }).message); break;
      case 'PROJECT_TOOLBAR_ACTION':
        if (this.ready && isProjectToolbarAction(payload)) this.callbacks.onToolbarAction(payload.action);
        break;
      case 'RESPONSE': {
        if (!requestId) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        window.clearTimeout(pending.timer);
        const response = payload as { ok: true; result: unknown } | { ok: false; error: { message: string } };
        if (response.ok) pending.resolve(response.result);
        else pending.reject(new Error(response.error.message));
        break;
      }
    }
  };

  setToolbarState(state: ProjectToolbarState) {
    this.toolbarState = state;
    if (!this.disposed && this.ready) this.target?.postMessage(envelope('PROJECT_TOOLBAR_STATE', state), window.location.origin);
  }

  request<K extends keyof EditorRequests>(type: K, input: EditorRequests[K]['input']): Promise<EditorRequests[K]['result']> {
    const target = this.target;
    if (this.disposed || !target || !this.ready) return Promise.reject(new Error('CCraft 编辑器尚未就绪。'));
    const requestId = crypto.randomUUID();
    return new Promise<EditorRequests[K]['result']>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`编辑器操作超时：${type}`));
      }, 45_000);
      this.pending.set(requestId, { resolve: resolve as Pending['resolve'], reject, timer });
      try {
        const transfer = type === 'LOAD_PROJECT' ? [(input as EditorRequests['LOAD_PROJECT']['input']).bytes] : [];
        target.postMessage(envelope(type, input, requestId), window.location.origin, transfer);
      } catch (error) {
        window.clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearStartupTimers();
    window.removeEventListener('message', this.receive);
    this.frame.removeEventListener('load', this.hello);
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('CCraft 编辑器已关闭。'));
    }
    this.pending.clear();
  }
}
