import { LOG_LIMIT, type HardwareLog } from './types';

export class JobLog {
  private entries: HardwareLog[] = [];
  private bytes = 0;
  private next = 0;
  append(stream: HardwareLog['stream'], text: string): void {
    if (!text) return;
    // Each record is capped so the tail always fits, including unusually large writes.
    const input = Buffer.from(text);
    const value = input.length > LOG_LIMIT - 256
      ? `[Logs truncated: oversized output chunk exceeded the job limit.]\n${input.subarray(-LOG_LIMIT + 512).toString('utf8')}`
      : text;
    const entry = { index: this.next++, stream, text: value };
    this.entries.push(entry); this.bytes += Buffer.byteLength(value) + 64;
    while (this.bytes > LOG_LIMIT && this.entries.length > 1) {
      this.bytes -= Buffer.byteLength(this.entries.shift()!.text) + 64;
    }
  }
  read(after: number): { logs: HardwareLog[]; nextLog: number } {
    const first = this.entries[0]?.index ?? this.next;
    const logs = this.entries.filter((entry) => entry.index >= after);
    if (after < first) logs.unshift({ index: first - 1, stream: 'system', text: '[Logs truncated: older output exceeded the 1 MiB job limit.]\n' });
    return { logs, nextLog: this.next };
  }
}
