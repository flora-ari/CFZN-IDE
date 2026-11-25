import { ApiError } from '../common/api-error';

export const portKey = (path: string) => process.platform === 'win32' ? path.toUpperCase() : path;

/** Synchronous reservations span every asynchronous enumeration and driver operation. */
export class HardwareOwnership {
  private cli?: { kind: 'build' | 'upload'; port?: string };
  private transactions = 0;
  private writes = 0;
  private readonly ports = new Map<string, string>();

  beginSerial(closing = false): () => void {
    if (!closing) this.assertNoCli();
    this.transactions++;
    return this.release(() => { this.transactions--; });
  }
  beginWrite(): () => void {
    this.assertNoCli();
    this.writes++;
    return this.release(() => { this.writes--; });
  }
  beginCli(kind: 'build' | 'upload', port?: string): () => void {
    if (this.cli || this.transactions || this.writes) {
      throw new ApiError(409, 'HARDWARE_BUSY', 'A hardware job or serial transaction is still active.');
    }
    this.cli = { kind, port: port && portKey(port) };
    return this.release(() => { this.cli = undefined; });
  }
  hold(path: string, sessionId: string): void {
    this.assertPortFree(path);
    this.ports.set(portKey(path), sessionId);
  }
  free(path: string, sessionId: string): void {
    if (this.ports.get(portKey(path)) === sessionId) this.ports.delete(portKey(path));
  }
  assertPortFree(path: string): void {
    if (this.ports.has(portKey(path))) throw new ApiError(409, 'SERIAL_PORT_BUSY', 'The selected OS port is held by a serial session.');
  }
  isUploading(path: string): boolean { return this.cli?.kind === 'upload' && this.cli.port === portKey(path); }
  private assertNoCli(): void {
    if (this.cli) throw new ApiError(409, 'HARDWARE_BUSY', 'A hardware build/upload is still active.');
  }
  private release(action: () => void): () => void {
    let released = false;
    return () => { if (!released) { released = true; action(); } };
  }
}
