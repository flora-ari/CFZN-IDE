export type SerialDirection = 'RX' | 'TX';
export interface SerialTextRow {
  id: number; sessionId: string; direction: SerialDirection; text: string; ended: boolean;
}
export interface SerialByteChunk {
  id: number; sessionId: string; direction: SerialDirection; bytes: number[];
}
export interface SerialLogSnapshot { textRows: SerialTextRow[]; byteChunks: SerialByteChunk[] }
const stream = () => ({ decoder: new TextDecoder(), skipLF: false });

// Display state only. Serial chunks are transport boundaries, not text line boundaries.
export class SerialLog {
  private sessionId: string | null = null;
  private streams = { RX: stream(), TX: stream() };
  private rows: SerialTextRow[] = [];
  private chunks: SerialByteChunk[] = [];
  private sequence = 0;
  private paused = false;
  private maxRows: number;
  private maxBytes: number;

  constructor(maxRows = 300, maxBytes = 65536) { this.maxRows = maxRows; this.maxBytes = maxBytes; }

  snapshot(): SerialLogSnapshot {
    return { textRows: this.rows.map(row => ({ ...row })), byteChunks: [...this.chunks] };
  }

  setSession(sessionId: string | null) {
    if (sessionId === this.sessionId) return;
    this.breakLine();
    this.sessionId = sessionId;
    this.streams = { RX: stream(), TX: stream() };
  }

  clear() {
    this.rows = []; this.chunks = [];
    this.streams = { RX: stream(), TX: stream() };
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    // Pause drops RX as before. Neither UTF-8 tails nor line joins may bridge that gap.
    this.streams.RX = stream();
    this.breakLine('RX');
  }

  append(direction: SerialDirection, bytes: Uint8Array, sessionId: string | null = this.sessionId) {
    if (!sessionId || sessionId !== this.sessionId || !bytes.length || (direction === 'RX' && this.paused)) return;
    this.chunks.push({ id: this.sequence++, sessionId, direction, bytes: Array.from(bytes) });
    const state = this.streams[direction];
    const text = state.decoder.decode(bytes, { stream: true });
    for (const match of text.matchAll(/[^\r\n]+|\r\n|\r|\n/g)) {
      const value = match[0];
      if (state.skipLF) { state.skipLF = false; if (value === '\n') continue; }
      const last = this.rows.at(-1);
      const row = last && !last.ended && last.sessionId === sessionId && last.direction === direction ? last :
        { id: this.sequence++, sessionId, direction, text: '', ended: false };
      if (row !== last) this.rows.push(row);
      if (value === '\r' || value === '\n' || value === '\r\n') {
        row.ended = true; state.skipLF = value === '\r';
      } else row.text += value;
    }
    this.trim();
  }

  private breakLine(direction?: SerialDirection) {
    const last = this.rows.at(-1);
    if (last && (!direction || last.direction === direction)) last.ended = true;
  }

  private trim() {
    if (this.rows.length > this.maxRows) this.rows.splice(0, this.rows.length - this.maxRows);
    let characters = this.rows.reduce((total, row) => total + row.text.length, 0);
    while (characters > this.maxBytes && this.rows.length) {
      const row = this.rows[0], excess = characters - this.maxBytes;
      if (row.text.length <= excess) { characters -= row.text.length; this.rows.shift(); }
      else { row.text = row.text.slice(excess); break; }
    }
    if (this.chunks.length > this.maxRows) this.chunks.splice(0, this.chunks.length - this.maxRows);
    let bytes = this.chunks.reduce((total, chunk) => total + chunk.bytes.length, 0);
    while (bytes > this.maxBytes && this.chunks.length) {
      const chunk = this.chunks[0], excess = bytes - this.maxBytes;
      if (chunk.bytes.length <= excess) { bytes -= chunk.bytes.length; this.chunks.shift(); }
      else { this.chunks[0] = { ...chunk, bytes: chunk.bytes.slice(excess) }; break; }
    }
  }
}
