import type { HardwareController } from './hardware-controller.ts';
import type { BrowserPort } from './hardware-types.ts';
import { isSerialOptions } from './hardware-types.ts';
import { defaultSerialOptions, describeError } from './hardware-session.ts';
import type { SerialOptions } from './serial.ts';
import type { SerialSources } from './local-serial.ts';

type Preference = { draftBaud: string; saved: SerialOptions; applied?: SerialOptions; error: string };
export interface SerialDeviceRow {
  id: string; name: string; port: string; source: 'local' | 'browser'; active: boolean; status: string;
  draftBaud: string; savedBaud: number; appliedBaud?: number; error: string; blocked: string; disconnectBlocked: string;
}
const phases = { authorizing: '等待浏览器授权', connecting: '正在连接', switching: '正在切换 / 应用', closing: '正在断开', restoring: '正在恢复原连接' };
const storagePrefix = 'ccraft.serial.options.v1:';
const browserStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };

export class SerialDevicePanel {
  readonly hardware: HardwareController;
  readonly sources: SerialSources;
  readonly source = 'local' as const;
  connectingNew = false;
  browserFeedback = '';
  private preferences = new Map<string, Preference>();
  private listeners = new Set<() => void>();
  private storage?: Pick<Storage, 'getItem' | 'setItem'>;
  private connect: (id: string, options: SerialOptions) => Promise<unknown>;
  private disconnect: () => Promise<unknown>;
  constructor(hardware: HardwareController, sources: SerialSources, connect: (id: string, options: SerialOptions) => Promise<unknown>, disconnect: () => Promise<unknown>, storage = browserStorage()) {
    this.hardware = hardware; this.sources = sources; this.connect = connect; this.disconnect = disconnect; this.storage = storage;
    sources.setSource('local');
    hardware.subscribe(() => { this.syncApplied(); this.publish(); }); sources.local.subscribe(() => this.publish());
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private publish() { this.listeners.forEach(fn => fn()); }
  refresh() { return this.refreshLocal(); }
  async refreshLocal() {
    try { await this.hardware.ensureLinkReady(); }
    catch { this.publish(); return; }
    this.sources.setSource('local'); await Promise.all([this.hardware.refresh(), this.hardware.session.refresh('local')]); this.publish();
  }
  private key(port: BrowserPort) { return port.source === 'local' ? port.preferenceKey! : 'browser|' + port.id; }
  private preference(port: BrowserPort): Preference {
    const key = this.key(port), existing = this.preferences.get(key); if (existing) return existing;
    let saved = { ...defaultSerialOptions };
    if (port.source === 'local') { try { const value = JSON.parse(this.storage?.getItem(storagePrefix + key) ?? 'null'); if (isSerialOptions(value)) saved = value; } catch { /* In-memory preferences still work without local storage. */ } }
    const value = { draftBaud: String(saved.baudRate), saved, error: '' }; this.preferences.set(key, value); return value;
  }
  private persist(port: BrowserPort, preference: Preference) {
    if (port.source === 'local') { try { this.storage?.setItem(storagePrefix + this.key(port), JSON.stringify(preference.saved)); } catch { /* Storage limits must not prevent an actual connection. */ } }
  }
  private syncApplied() {
    const state = this.hardware.snapshot();
    if (state.connection !== 'open' || state.serialOperation) return;
    const port = state.browserPorts.find(port => port.id === state.browserPortId); if (!port) return;
    const pref = this.preference(port), next = JSON.stringify(state.options);
    if (JSON.stringify(pref.applied) === next) return;
    const unchangedDraft = pref.draftBaud === String(pref.saved.baudRate);
    pref.applied = { ...state.options }; pref.saved = { ...state.options };
    if (unchangedDraft) pref.draftBaud = String(state.options.baudRate);
    this.persist(port, pref);
  }
  private port(id: string) { const port = this.hardware.session.ports.find(port => port.id === id); if (!port) throw new Error('设备行已失效，请刷新后重新选择。'); return port; }
  edit(id: string, value: string) { const pref = this.preference(this.port(id)); pref.draftBaud = value; pref.error = ''; this.publish(); }
  private options(port: BrowserPort) {
    const pref = this.preference(port), baud = pref.draftBaud.trim();
    if (!/^\d+$/.test(baud) || !isSerialOptions({ ...pref.saved, baudRate: Number(baud) })) throw new Error('波特率请输入 1–4294967295 的整数。');
    return { ...pref.saved, baudRate: Number(baud) };
  }
  private async action(id: string, callback: (port: BrowserPort, pref: Preference) => Promise<unknown> | void) {
    const port = this.port(id), pref = this.preference(port); pref.error = ''; this.publish();
    try { await callback(port, pref); }
    catch (e) { pref.error = describeError(e); throw e; }
    finally { this.syncApplied(); this.publish(); }
  }
  save(id: string) { return this.action(id, (port, pref) => { this.hardware.assertIdle(); pref.saved = this.options(port); this.persist(port, pref); }); }
  activate(id: string) {
    return this.action(id, async port => {
      const row = this.allRows.find(row => row.id === id); if (!row || row.blocked) throw new Error(row?.blocked || '设备行已失效。');
      await this.connect(id, this.options(port));
      const pref = this.preference(port); pref.saved = { ...this.hardware.session.options }; pref.applied = { ...pref.saved }; this.persist(port, pref);
    });
  }
  apply(id: string) { return this.action(id, async port => { await this.hardware.applySerialSettings({ browserPortId: id, options: this.options(port) }); }); }
  disconnectRow(id: string) { return this.action(id, async () => { if (this.hardware.session.portId !== id) throw new Error('此行不是当前连接。'); await this.disconnect(); }); }
  connectNewDevice(): Promise<void> {
    if (this.connectingNew) return Promise.resolve();
    let selected: string | null = null;
    this.browserFeedback = '';
    try {
      this.hardware.assertIdle();
      if (this.hardware.session.portId && this.hardware.session.status !== 'open') throw new Error('当前端口仍待释放，请先重试断开。');
      if (!this.sources.browser) throw new Error('此浏览器不支持 Web Serial，可使用本机直连。');
      this.connectingNew = true;
      const choosing = this.hardware.chooseSerialPort(); // No await, scan, HTTP, timer or effect before requestPort.
      this.publish();
      return choosing.then(async id => {
        selected = id;
        if (id) await this.activate(id);
        else this.browserFeedback = this.hardware.session.serialError;
      }).catch(e => { if (!selected) this.browserFeedback = describeError(e); throw e; })
        .finally(() => { this.connectingNew = false; this.publish(); });
    } catch (e) { this.connectingNew = false; this.browserFeedback = describeError(e); this.publish(); return Promise.reject(e); }
  }
  get rows() { return this.allRows.filter(row => row.source === 'local' || row.active); }
  private get allRows(): SerialDeviceRow[] {
    const state = this.hardware.snapshot();
    const protocol = state.use === 'protocol' ? '实时硬件协议占用串口，请先断开协议连接。' : '';
    const held = state.browserPortId && state.connection !== 'open' ? '当前端口仍待释放，请先重试断开。' : '';
    return state.browserPorts.filter(port => !(port.source === 'local' && this.sources.local.confirmed && !port.confirmed && port.id !== state.browserPortId))
      .map(port => {
        const pref = this.preference(port), active = port.id === state.browserPortId, pending = port.id === state.pendingBrowserPortId;
        const local = port.source === 'local';
        const ownership = ({ 'other-client': '其它窗口占用', opening: '本机正在打开', closing: '本机正在关闭', uploading: '本机作业占用' } as Record<string, string>)[port.ownership ?? ''];
        const blocked = this.hardware.serialDisabledReason || protocol || held || (local ? !port.confirmed || this.sources.local.status !== 'online' ? port.reason || this.sources.local.message : ownership || '' : '');
        const status = (pending || active) && state.serialOperation ? phases[state.serialOperation] : active ? state.connection === 'open' ? '已连接' : '待释放 / 状态待确认' : ownership || (local && !port.confirmed ? '上次列表，尚未确认' : '未连接');
        return { id: port.id, name: port.name, port: local ? port.portId! : '浏览器授权端口', source: local ? 'local' : 'browser', active, status,
          draftBaud: pref.draftBaud, savedBaud: pref.saved.baudRate, appliedBaud: active && state.connection === 'open' ? state.options.baudRate : undefined,
          error: pref.error || port.transportError || (active && state.connection !== 'open' ? state.serialError : ''), blocked,
          disconnectBlocked: this.hardware.serialDisabledReason };
      });
  }
}
