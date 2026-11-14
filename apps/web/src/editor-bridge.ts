import { envelope, isEnvelope, isProjectToolbarAction } from './editor-protocol';
import type { EditorRequests, EditorSnapshot, ProjectToolbarAction, ProjectToolbarState } from './editor-protocol';

interface BridgeCallbacks {
  onState: (state: EditorSnapshot) => void;
  onReplace: (state: EditorSnapshot) => void;
  onBootError: (message: string) => void;
  onImport: (file: { bytes: ArrayBuffer; name: string }) => void;
  onImportError: (message: string) => void;
  onToolbarAction: (action: ProjectToolbarAction) => void;
}

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

export class EditorBridge {
  private pending = new Map<string, Pending>();
  private startupTimer: number;
  private ready = false;
  private target: Window | null;
  private toolbarState: ProjectToolbarState | undefined;

  constructor(private frame: HTMLIFrameElement, private callbacks: BridgeCallbacks) {
    this.target = frame.contentWindow;
    window.addEventListener('message', this.receive);
    frame.addEventListener('load', this.hello);
    this.startupTimer = window.setTimeout(() => {
      if (!this.ready) callbacks.onBootError('OpenBlock 编辑器启动超时，请刷新页面。');
    }, 45_000);
    this.hello();
  }

  private hello = () => {
    this.target = this.frame.contentWindow;
    this.target?.postMessage(envelope('HELLO'), window.location.origin);
  };

  private receive = (event: MessageEvent) => {
    if (event.source !== this.target || event.origin !== window.location.origin || !isEnvelope(event.data)) return;
    const { type, requestId, payload } = event.data;
    switch (type) {
      case 'READY':
        this.ready = true;
        window.clearTimeout(this.startupTimer);
        this.callbacks.onState(payload as EditorSnapshot);
        if (this.toolbarState) this.setToolbarState(this.toolbarState);
        break;
      case 'CHANGED': this.callbacks.onState(payload as EditorSnapshot); break;
      case 'REPLACED': this.callbacks.onReplace(payload as EditorSnapshot); break;
      case 'BOOT_ERROR':
        window.clearTimeout(this.startupTimer);
        this.callbacks.onBootError((payload as { message: string }).message);
        break;
      case 'IMPORT_REQUEST': this.callbacks.onImport(payload as { bytes: ArrayBuffer; name: string }); break;
      case 'IMPORT_ERROR': this.callbacks.onImportError((payload as { message: string }).message); break;
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
    if (this.ready) this.target?.postMessage(envelope('PROJECT_TOOLBAR_STATE', state), window.location.origin);
  }

  request<K extends keyof EditorRequests>(type: K, input: EditorRequests[K]['input']): Promise<EditorRequests[K]['result']> {
    const target = this.target;
    if (!target || !this.ready) return Promise.reject(new Error('OpenBlock 编辑器尚未就绪。'));
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
    window.clearTimeout(this.startupTimer);
    window.removeEventListener('message', this.receive);
    this.frame.removeEventListener('load', this.hello);
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('OpenBlock 编辑器已关闭。'));
    }
    this.pending.clear();
  }
}
