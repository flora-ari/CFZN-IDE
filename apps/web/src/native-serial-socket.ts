import { describeError } from './hardware-session.ts';
import type { HardwareController } from './hardware-controller.ts';
import type { SerialOptions } from './serial.ts';
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
export const decodeWire = (message: string, encoding?: string) => encoding === 'base64'
  ? Uint8Array.from(atob(message), ch => ch.charCodeAt(0)) : new TextEncoder().encode(message);

export class NativeSerialSocket {
  private opened = false;
  private onOpen = () => {};
  private onClose = () => {};
  private onError = (_error: unknown) => {};
  private receive = (_message: any) => {};
  private stopBytes?: () => void;
  private reading = false;
  private hardware: HardwareController;
  private protocolAllowed: () => boolean;
  private modeSwitching: () => boolean;
  private mayCloseSession: () => boolean;
  connectionTask?: Promise<unknown>;
  connectionOptions?: SerialOptions;
  discoverySource: 'local' | 'browser' = 'local';
  constructor(hardware: HardwareController, protocolAllowed = () => true, modeSwitching = () => false, mayCloseSession = () => true) { this.hardware = hardware; this.protocolAllowed = protocolAllowed; this.modeSwitching = modeSwitching; this.mayCloseSession = mayCloseSession; }
  setOnOpen(fn: () => void) { this.onOpen = fn; }
  setOnClose(fn: () => void) { this.onClose = fn; }
  setOnError(fn: (error: unknown) => void) { this.onError = fn; }
  setHandleMessage(fn: (message: any) => void) { this.receive = fn; }
  isOpen() { return this.opened; }
  open() { this.opened = true; setTimeout(() => { if (this.opened) this.onOpen(); }, 0); }
  close() {
    this.opened = false; this.stopBytes?.(); this.stopBytes = undefined;
    if (!this.hardware.busy && !this.hardware.session.operation && this.mayCloseSession()) void this.hardware.session.close().catch(this.onError);
    queueMicrotask(this.onClose);
  }
  private notify(method: string, params: unknown) { if (this.opened) this.receive({ jsonrpc: '2.0', method, params }); }
  sendMessage(message: any) {
    if (!message || typeof message.method !== 'string') return;
    void this.call(message.method, message.params ?? {}).then(result => {
      if (message.id !== undefined) this.receive({ jsonrpc: '2.0', id: message.id, result: result ?? null });
    }, error => {
      if (message.id !== undefined) this.receive({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: describeError(error) } });
    });
  }
  private async call(method: string, params: any) {
    const session = this.hardware.session;
    switch (method) {
      case 'discover': {
        await this.hardware.ensureLinkReady();
        const ports = (await session.refresh(this.discoverySource)).filter(port => (port.source ?? 'browser') === this.discoverySource || port.id === session.portId);
        if (this.hardware.linkDisabledReason) throw new Error(this.hardware.linkDisabledReason);
        setTimeout(() => ports.forEach(port => this.notify('didDiscoverPeripheral', { peripheralId: port.id, name: port.label })), 0);
        return null;
      }
      case 'connect': {
        const options = this.hardware.protocolRequested ? { ...session.options, ...params.peripheralConfig?.config } : this.connectionOptions ?? session.options;
        this.connectionOptions = undefined;
        this.connectionTask = this.hardware.applySerialSettings({ browserPortId: String(params.peripheralId), options }, 'native');
        await this.connectionTask;
        return null;
      }
      case 'read':
        this.reading = true;
        this.stopBytes?.(); this.stopBytes = session.onBytes(bytes => { if (this.reading) this.notify('onMessage', { message: encode(bytes) }); });
        return null;
      case 'write':
        if (!this.protocolAllowed()) throw new Error('当前板卡的实时硬件协议不可用；舞台编程不发送硬件指令。');
        this.hardware.assertIdle(); await session.write(decodeWire(params.message, params.encoding)); return null;
      case 'updateBaudrate':
        if (this.modeSwitching() || !this.protocolAllowed()) return null;
        if (Number(params.baudRate) === session.options.baudRate) return null;
        await this.hardware.applySerialSettings({ options: { ...session.options, baudRate: Number(params.baudRate) } }, 'native'); return null;
      case 'upload':
        // Header and bridge use the same controller; native RPC callers are supported too.
        await this.hardware.start(true, new TextDecoder().decode(decodeWire(params.message, params.encoding))); return null;
      case 'abortUpload': return this.hardware.cancel();
      case 'uploadFirmware': throw new Error('当前实时固件未验证，不提供自动刷写。');
      default: throw new Error(`不支持的串口操作：${method}`);
    }
  }
}
