import type { HardwareSession } from './hardware-session.ts';
import type { SerialMode, SerialNewline, SerialOptions } from './serial.ts';
import { SerialLog } from './serial-log.ts';
import type { SerialLogSnapshot } from './serial-log.ts';

export type TerminalSession = Pick<HardwareSession, 'sessionId' | 'options' | 'subscribe' | 'onBytes'>;
interface TerminalDraft {
  input: string;
  sendMode: SerialMode;
  receiveMode: SerialMode;
  newline: SerialNewline;
  baud: string;
  paused: boolean;
  message: string;
}
export interface TerminalSnapshot extends TerminalDraft {
  sessionId: string | null;
  logs: SerialLogSnapshot;
}

const sameOptions = (a: SerialOptions, b: SerialOptions) => a.baudRate === b.baudRate &&
  a.dataBits === b.dataBits && a.stopBits === b.stopBits && a.parity === b.parity && a.flowControl === b.flowControl;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

// Display state belongs to the editor binding, independent of mounted terminal views.
// HardwareSession remains the only owner of the port, reader and writer.
export class TerminalModel {
  private readonly log = new SerialLog(200, 65536);
  private readonly listeners = new Set<() => void>();
  private readonly stopState: () => void;
  private readonly stopBytes: () => void;
  private readonly session: TerminalSession;
  private readonly captureAllowed: () => boolean;
  private sessionId: string | null;
  private options: SerialOptions;
  private disposed = false;
  private draft: TerminalDraft;

  constructor(session: TerminalSession, captureAllowed: () => boolean = () => true) {
    this.session = session;
    this.captureAllowed = captureAllowed;
    this.sessionId = session.sessionId;
    this.options = { ...session.options };
    this.log.setSession(this.sessionId);
    this.draft = { input: '', sendMode: 'text', receiveMode: 'text', newline: 'none',
      baud: String(this.options.baudRate), paused: false, message: '' };
    this.stopState = session.subscribe(() => {
      if (!this.disposed && this.syncSession()) this.publish();
    });
    try {
      this.stopBytes = session.onBytes(bytes => {
        if (this.disposed) return;
        const changed = this.syncSession();
        if (!this.canCapture()) { this.breakReceive(); this.publish(); return; }
        if (!this.sessionId || !bytes.length || this.draft.paused) { if (changed) this.publish(); return; }
        this.log.append('RX', bytes, this.sessionId);
        this.publish();
      });
    } catch (error) {
      this.stopState();
      throw error;
    }
  }

  subscribe(listener: () => void) {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  snapshot(): TerminalSnapshot {
    const logs = this.log.snapshot();
    // A view may format a snapshot, but must never mutate retained raw bytes.
    logs.byteChunks = logs.byteChunks.map(chunk => ({ ...chunk, bytes: [...chunk.bytes] }));
    return { ...this.draft, sessionId: this.sessionId, logs };
  }

  setInput(value: string) { this.set('input', value); }
  setSendMode(value: SerialMode) { this.set('sendMode', value); }
  setReceiveMode(value: SerialMode) { this.set('receiveMode', value); }
  setNewline(value: SerialNewline) { this.set('newline', value); }
  setBaud(value: string) { this.set('baud', value); }
  setMessage(value: string) { this.set('message', value); }
  setPaused(value: boolean) {
    if (this.disposed || this.draft.paused === value) return;
    this.log.setPaused(value);
    this.set('paused', value);
  }

  clear() {
    if (this.disposed) return;
    this.log.clear();
    this.publish();
  }

  // Call only after a successful actual write, with the session ID captured before it.
  // A rejected/stale write must not be represented as successful TX in another session.
  appendSent(bytes: Uint8Array, sessionId: string | null): boolean {
    if (this.disposed) return false;
    const changed = this.syncSession();
    if (!sessionId || sessionId !== this.sessionId || !bytes.length) { if (changed) this.publish(); return false; }
    if (!this.canCapture()) { this.publish(); return false; }
    this.log.append('TX', bytes, sessionId);
    this.publish();
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    try { this.stopState(); } finally { this.stopBytes(); }
  }

  private set<K extends keyof TerminalDraft>(key: K, value: TerminalDraft[K]) {
    if (this.disposed || this.draft[key] === value) return;
    this.draft[key] = value;
    this.publish();
  }

  private syncSession() {
    let changed = false;
    if (this.sessionId !== this.session.sessionId) {
      this.sessionId = this.session.sessionId;
      this.log.setSession(this.sessionId);
      changed = true;
    }
    // Notifications about scans, service health or operations must not erase a baud draft.
    if (!sameOptions(this.options, this.session.options)) {
      this.options = { ...this.session.options };
      this.draft.baud = String(this.options.baudRate);
      changed = true;
    }
    return changed;
  }

  private canCapture() {
    try { return this.captureAllowed(); }
    catch (error) { this.draft.message = `终端记录失败：${errorText(error)}`; return false; }
  }

  private breakReceive() {
    // A protocol-owned gap must not join UTF-8 tails or unfinished lines when capture resumes.
    this.log.setPaused(true);
    this.log.setPaused(this.draft.paused);
  }

  private publish() {
    for (const listener of this.listeners) {
      // A broken display subscriber must not terminate HardwareSession's read loop.
      try { listener(); }
      catch (error) { this.draft.message = `终端显示更新失败：${errorText(error)}`; }
    }
  }
}
