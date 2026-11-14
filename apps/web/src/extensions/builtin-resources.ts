export interface BuiltinFunctions {
  toolbox: () => string;
  translations: (Blockly: any) => any;
  generator: (Blockly: any) => any;
  blocks: (Blockly: any) => any;
}
interface BuiltinHelper { loadBuiltin(id: string, version: string, attempt: number): Promise<BuiltinFunctions> }
declare global { interface Window { CFZNBuiltinModules: BuiltinHelper } }

// Manifest coordination only; executable imports belong exclusively to the classic static helper.
export class BuiltinResources {
  private pinned = '';
  private pending?: Promise<string>;
  private attempts = new Map<string, number>();
  private request: typeof fetch;
  private helper: () => BuiltinHelper;
  constructor(request: typeof fetch = fetch, helper = () => window.CFZNBuiltinModules) { this.request = request.bind(globalThis); this.helper = helper; }
  private version() {
    if (!this.pending) this.pending = this.request('/openblock-vendor/manifest.json', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('本地扩展资源版本清单不可用，请重试。');
      const manifest = await response.json(), version = manifest.integrationSha256;
      if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new Error('本地扩展资源版本清单无效。');
      if (this.pinned && this.pinned !== version) throw new Error('扩展资源已更新，请先保存项目并刷新编辑器。');
      this.pinned = version; return version;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  async prepare(id: string): Promise<BuiltinFunctions> {
    try {
      const version = await this.version();
      const helper = this.helper();
      if (!helper) throw new Error('内置模块加载器未就绪，请刷新编辑器。');
      return await helper.loadBuiltin(id, version, this.attempts.get(id) ?? 0);
    } catch (e) { this.attempts.set(id, (this.attempts.get(id) ?? 0) + 1); throw e; }
  }
}
