import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ApiError, tooLarge } from '../common/api-error';
import { HardwareOwnership, portKey } from './ownership';
import { SerialDirectory } from './serial-directory';
import type { SerialDriver, SerialHandle, SerialOptions } from './serial-driver';
import { serialBytes, serialInteger, serialObject, serialUuid, serialOptions } from './serial-input';

type State = 'opening' | 'open' | 'closing' | 'closed' | 'disconnected' | 'error';
interface SessionView {
  id: string; instanceId: string; deviceRef: string; portId: string;
  state: State; held: boolean; options: SerialOptions; nextWriteSequence: number;
  error?: { code: string; message: string };
}
interface WriteRecord {
  sequence: number; hash: string; settled: boolean; operation: Promise<{ sequence: number; sizeBytes: number }>;
}
interface Session {
  view: SessionView; client: Client; events: EventEmitter; abort: AbortController;
  port?: SerialHandle; openTask?: Promise<void>; closeTask?: Promise<void>;
  rx: Buffer; base: number; delivered: number; reading: boolean; firstRead: boolean; expires: number;
  fault?: ApiError; disconnected?: boolean; endedAt?: number; writes: Map<number, WriteRecord>; writeTail: Promise<unknown>; pendingBytes: number;
}
interface OpenRequest { hash: string; operation: Promise<{ session: SessionView }>; session?: Session; endedAt?: number }
export interface Client { lastUsed: number; current?: Session; requests: Map<string, OpenRequest> }
export interface SerialManagerOptions { clock?: () => number; ioTimeoutMs?: number }

const error = (status: number, code: string, message: string) => new ApiError(status, code, message);
const stateError = () => error(409, 'SERIAL_SESSION_STATE', 'The serial session is not open.');
const ioError = (message: string) => error(503, 'SERIAL_IO_ERROR', message);
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const message = (value: unknown) => value instanceof Error ? value.message : String(value);
const bodyError = (value: ApiError) => (value.getResponse() as { error: { code: string; message: string } }).error;
const HISTORY_MS = 120000;

function until<T>(operation: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const fail = (cause: unknown) => { cleanup(); reject(cause); };
    const abort = () => fail(signal!.reason);
    const timer = setTimeout(() => fail(error(504, 'SERIAL_IO_TIMEOUT', 'Serial I/O timed out. Bytes may already have been sent. Check session state before retrying.')), ms);
    timer.unref();
    operation.then(value => { cleanup(); resolve(value); }, fail);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export class SerialManager {
  readonly instanceId = randomUUID();
  private readonly clients = new Map<string, { origin: string; client: Client }>();
  private readonly sessions = new Map<string, Session>();
  private readonly timer: NodeJS.Timeout;
  private readonly now: () => number;
  private readonly ioTimeout: number;
  private stopping = false;

  constructor(
    readonly directory: SerialDirectory,
    private readonly ownership: HardwareOwnership,
    private readonly driver?: SerialDriver,
    private readonly unavailableReason = 'Native serial binding is unavailable.',
    options: SerialManagerOptions = {},
  ) {
    this.now = options.clock ?? Date.now;
    this.ioTimeout = options.ioTimeoutMs ?? 30000;
    directory.onRemoved = ref => {
      for (const session of this.sessions.values()) {
        if (session.view.deviceRef === ref && session.view.held) this.fail(session, ioError('The OS device disappeared or changed identity.'), true);
      }
    };
    this.timer = setInterval(() => this.sweep(), 1000);
    this.timer.unref();
  }
  capabilities() {
    return { version: 1, available: !!this.driver, ...(!this.driver ? { reason: this.unavailableReason } : {}),
      transport: 'http-poll', instanceId: this.instanceId, maxReadBytes: 65536, maxWriteBytes: 65536,
      maxWaitMs: 15000, readLeaseMs: 45000, firstReadMs: 5000 };
  }
  createClient(origin: string, body: unknown) {
    serialObject(body, []);
    this.sweep();
    if (this.stopping || this.clients.size >= 64) throw error(429, 'SERIAL_CAPACITY_EXCEEDED', 'The local serial client limit has been reached.');
    const clientToken = randomBytes(32).toString('hex');
    this.clients.set(digest(clientToken), { origin, client: { lastUsed: this.now(), requests: new Map() } });
    return { clientToken, instanceId: this.instanceId };
  }
  client(origin: string, token: unknown): Client {
    this.sweep();
    const entry = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? this.clients.get(digest(token)) : undefined;
    if (!entry || entry.origin !== origin) throw error(401, 'SERIAL_CLIENT_REQUIRED', 'A serial client token issued for this Origin and executor is required.');
    entry.client.lastUsed = this.now();
    return entry.client;
  }
  async devices(client: Client) {
    const devices = await this.refreshDirectory();
    return { instanceId: this.instanceId, items: devices.map(({ identity: _identity, ...device }) => {
      const session = [...this.sessions.values()].find(item => item.view.held && portKey(item.view.portId) === portKey(device.portId));
      let ownership = 'idle';
      if (this.ownership.isUploading(device.portId)) ownership = 'uploading';
      else if (session) ownership = session.client !== client ? 'other-client' :
        session.view.state === 'opening' || session.view.state === 'closing' ? session.view.state : 'owned';
      return { ...device, ownership, ...(session?.client === client ? { session: this.view(session) } : {}) };
    }) };
  }
  async open(client: Client, body: unknown): Promise<{ session: SessionView }> {
    let request: OpenRequest | undefined;
    try {
      const input = serialObject(body, ['requestId', 'deviceRef', 'options']);
      const requestId = serialUuid(input.requestId, 'requestId');
      request = client.requests.get(requestId);
      const deviceRef = serialUuid(input.deviceRef, 'deviceRef');
      const options = serialOptions(input.options);
      const hash = digest(JSON.stringify({ deviceRef, options }));
      if (request) {
        if (request.hash !== hash) throw error(409, 'SERIAL_SEQUENCE_CONFLICT', 'This open request ID has a different payload.');
        await request.operation;
        return { session: this.view(request.session!) };
      }
      if (client.requests.size >= 64 || [...this.clients.values()].reduce((count, entry) => count + entry.client.requests.size, 0) >= 256) {
        throw error(429, 'SERIAL_CAPACITY_EXCEEDED', 'Serial request history is full. Retry after its 120 second retention window.');
      }
      const created: OpenRequest = { hash, operation: Promise.resolve(undefined!) };
      request = created;
      client.requests.set(requestId, created);
      created.operation = this.openDevice(client, created, deviceRef, options).catch(cause => { created.endedAt = this.now(); throw cause; });
      return await created.operation;
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : ioError(message(cause));
      const response = (failure.getResponse() as { error: { code: string; message: string; details?: Record<string, unknown> } }).error;
      const session = request?.session ?? (client.current?.view.held ? client.current : undefined);
      throw new ApiError(failure.getStatus(), response.code, response.message, {
        ...response.details, session: session ? this.view(session) : null,
      });
    }
  }
  status(client: Client, id: string) {
    const session = this.owned(client, id);
    const pending = [...session.writes.values()].find(write => !write.settled);
    return { session: this.view(session), ...(pending ? { pendingWriteSequence: pending.sequence } : {}) };
  }
  async read(client: Client, id: string, after: number, waitMs: number, signal: AbortSignal) {
    const session = this.owned(client, id);
    if (session.reading) throw error(409, 'SERIAL_SESSION_STATE', 'Only one read may be in flight for a session.');
    if (session.fault) throw session.fault;
    if (session.view.state !== 'open') return { session: this.view(session), from: after, next: after, dataBase64: '' };
    if (after < session.base || after > session.delivered) {
      const invalid = error(409, 'SERIAL_CURSOR_INVALID', 'The RX cursor was not delivered or has already been acknowledged.');
      this.fail(session, invalid);
      throw invalid;
    }
    session.rx = session.rx.subarray(after - session.base);
    session.base = after;
    session.reading = true;
    session.firstRead = true;
    session.expires = this.now() + 45000;
    try {
      if (signal.aborted) throw signal.reason;
      if (!session.rx.length && waitMs && session.view.state === 'open') await this.waitForChange(session, waitMs, signal);
      if (session.fault) throw session.fault;
      const bytes = session.rx.subarray(0, 65536);
      const next = session.base + bytes.length;
      session.delivered = Math.max(session.delivered, next);
      return { session: this.view(session), from: session.base, next, dataBase64: bytes.toString('base64') };
    } catch (cause) {
      if (signal.aborted) this.fail(session, ioError('The serial read consumer disconnected.'));
      throw cause;
    } finally { session.reading = false; }
  }
  write(client: Client, id: string, body: unknown) {
    const session = this.owned(client, id);
    const input = serialObject(body, ['sequence', 'dataBase64']);
    const sequence = serialInteger(input.sequence, 'sequence', Number.MAX_SAFE_INTEGER, 1);
    const bytes = serialBytes(input.dataBase64);
    const hash = digest(bytes);
    const existing = session.writes.get(sequence);
    if (existing) {
      if (existing.hash !== hash) throw error(409, 'SERIAL_SEQUENCE_CONFLICT', 'This write sequence has different bytes.');
      return existing.operation;
    }
    if (sequence !== session.view.nextWriteSequence) throw error(409, 'SERIAL_SEQUENCE_CONFLICT', 'The write sequence is expired or out of order.');
    if (session.view.state !== 'open' || !session.view.held) throw stateError();
    if (session.pendingBytes + bytes.length > 262144 || [...session.writes.values()].filter(write => !write.settled).length >= 64) {
      throw error(429, 'SERIAL_CAPACITY_EXCEEDED', 'The serial pending write limit has been reached.');
    }
    const release = this.ownership.beginWrite();
    session.pendingBytes += bytes.length;
    session.view.nextWriteSequence++;
    const accepted = this.now();
    const record: WriteRecord = { sequence, hash, settled: false, operation: Promise.resolve(undefined!) };
    record.operation = session.writeTail.then(async () => {
      if (session.view.state !== 'open') throw stateError();
      const remaining = this.ioTimeout - (this.now() - accepted);
      if (remaining <= 0) throw error(504, 'SERIAL_IO_TIMEOUT', 'Serial write deadline expired. Bytes may already have been sent.');
      await until(this.writeBytes(session, bytes), remaining, session.abort.signal);
      return { sequence, sizeBytes: bytes.length };
    }).catch(cause => {
      let failure = cause instanceof ApiError ? cause : ioError(`Serial write failed: ${message(cause)}`);
      const detail = bodyError(failure);
      if (!/may already have been sent/i.test(detail.message)) {
        failure = new ApiError(failure.getStatus(), detail.code, `${detail.message} Bytes may already have been sent. Check session state before retrying.`);
      }
      this.fail(session, failure);
      throw failure;
    }).finally(() => {
      record.settled = true;
      session.pendingBytes -= bytes.length;
      release();
      while (session.writes.size > 64) {
        const oldest = session.writes.values().next().value!;
        if (!oldest.settled) break;
        session.writes.delete(oldest.sequence);
      }
    });
    session.writes.set(sequence, record);
    session.writeTail = record.operation.catch(() => {});
    return record.operation;
  }
  async close(client: Client, id: string, body: unknown) {
    serialObject(body, []);
    const session = this.owned(client, id);
    await this.closeSession(session);
    return { session: this.view(session) };
  }
  sweep(): void {
    const now = this.now();
    for (const session of this.sessions.values()) {
      if (session.view.state === 'open' && now >= session.expires) this.fail(session, ioError(session.firstRead ? 'The serial read lease expired.' : 'No reader started within five seconds.'));
      if (session.endedAt !== undefined && now - session.endedAt >= HISTORY_MS) this.sessions.delete(session.view.id);
    }
    for (const [token, entry] of this.clients) {
      const client = entry.client;
      for (const [id, request] of client.requests) {
        const ended = request.session ? request.session.endedAt : request.endedAt;
        if (ended !== undefined && now - ended >= HISTORY_MS) client.requests.delete(id);
      }
      if (now - client.lastUsed >= 1800000) {
        if (client.current?.view.held) this.fail(client.current, ioError('The serial client expired.'));
        else this.clients.delete(token);
      }
    }
  }
  async shutdown(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await Promise.all([...this.sessions.values()].filter(session => session.view.held).map(session => this.closeSession(session)));
  }
  private async openDevice(client: Client, request: OpenRequest, deviceRef: string, options: SerialOptions) {
    if (!this.driver || this.stopping) throw error(503, 'SERIAL_UNAVAILABLE', this.unavailableReason);
    if (client.current?.view.held) throw error(409, 'SERIAL_SESSION_STATE', 'This editor already holds a serial session.');
    if ([...this.sessions.values()].filter(session => session.view.held).length >= 16) throw error(429, 'SERIAL_CAPACITY_EXCEEDED', 'The active serial session limit has been reached.');
    const release = this.ownership.beginSerial();
    let session: Session | undefined;
    try {
      const device = this.directory.find(deviceRef);
      const id = randomUUID();
      this.ownership.hold(device.portId, id);
      session = {
        view: { id, instanceId: this.instanceId, deviceRef, portId: device.portId, state: 'opening', held: true, options, nextWriteSequence: 1 },
        client, events: new EventEmitter(), abort: new AbortController(), rx: Buffer.alloc(0), base: 0, delivered: 0,
        reading: false, firstRead: false, expires: Infinity, writes: new Map(), writeTail: Promise.resolve(), pendingBytes: 0,
      };
      client.current = session;
      request.session = session;
      this.sessions.set(id, session);
      await until(this.refreshDirectory(), this.ioTimeout);
      this.directory.find(deviceRef);
      if (session.fault) throw session.fault;
      if (!session.view.held || session.view.state !== 'opening' || session.abort.signal.aborted) throw stateError();
      const port = this.driver.create(device.portId, options);
      session.port = port;
      this.listen(session, port);
      session.openTask = Promise.resolve().then(() => new Promise<void>((resolve, reject) => port.open(cause => cause ? reject(cause) : resolve())));
      await until(session.openTask, this.ioTimeout, session.abort.signal);
      if (session.view.state !== 'opening' || !port.isOpen) throw session.fault ?? stateError();
      session.view.state = 'open';
      session.expires = this.now() + 5000;
      return { session: this.view(session) };
    } catch (cause) {
      const failure = cause instanceof ApiError ? cause : ioError(`Could not open the selected OS port: ${message(cause)}`);
      if (session) {
        this.fail(session, failure);
        if (!session.port) this.released(session);
      }
      throw failure;
    } finally { release(); }
  }
  private listen(session: Session, port: SerialHandle): void {
    port.on('data', (bytes: Buffer) => {
      if (!session.view.held || session.fault) return;
      if (bytes.length > 1048576 - session.rx.length) {
        this.fail(session, tooLarge('Serial RX exceeded 1 MiB of unacknowledged bytes. The stream was closed.'));
        return;
      }
      session.rx = Buffer.concat([session.rx, bytes]);
      session.events.emit('change');
    });
    port.on('error', cause => {
      if (!session.view.held) return;
      const disconnected = !!cause?.disconnected;
      if (disconnected) this.directory.invalidate(session.view.deviceRef);
      this.fail(session, ioError(`Serial driver error: ${message(cause)}`), disconnected);
    });
    port.on('close', cause => {
      if (!session.view.held) return;
      if (session.view.state !== 'closing' && session.view.state !== 'closed' && !session.fault) {
        session.fault = ioError(`Serial device disconnected${cause ? `: ${message(cause)}` : '.'}`);
        session.view.error = bodyError(session.fault);
        session.disconnected = true;
        session.view.state = 'disconnected';
        this.directory.invalidate(session.view.deviceRef);
      }
      if (cause?.disconnected) { session.disconnected = true; this.directory.invalidate(session.view.deviceRef); }
      this.released(session);
    });
  }
  private fail(session: Session, failure: ApiError, disconnected = false): void {
    if (!session.fault) {
      session.fault = failure;
      session.disconnected = disconnected;
      session.view.error = bodyError(failure);
      session.view.state = disconnected ? 'disconnected' : 'error';
    }
    session.abort.abort(failure);
    session.events.emit('change');
    void this.closeSession(session).catch(() => {});
  }
  private closeSession(session: Session): Promise<void> {
    if (!session.view.held) return Promise.resolve();
    if (session.closeTask) return until(session.closeTask, this.ioTimeout);
    const release = this.ownership.beginSerial(true);
    session.view.state = 'closing';
    session.abort.abort(stateError());
    session.events.emit('change');
    const operation = (async () => {
      await session.openTask?.catch(() => {});
      if (!session.port?.isOpen) { this.released(session); return; }
      await new Promise<void>((resolve, reject) => {
        const port = session.port!;
        const closed = () => { port.off('close', closed); resolve(); };
        port.once('close', closed);
        try {
          port.close(cause => {
            port.off('close', closed);
            if (cause) reject(cause);
            else if (port.isOpen) reject(new Error('The driver did not confirm that the port closed.'));
            else resolve();
          });
        } catch (cause) { port.off('close', closed); reject(cause); }
      });
      this.released(session);
    })();
    session.closeTask = operation.catch(cause => {
      const failure = ioError(`Serial close failed; port ownership is retained: ${message(cause)}`);
      session.view.state = 'error';
      session.view.error = bodyError(failure);
      session.events.emit('change');
      throw failure;
    }).finally(() => { release(); session.closeTask = undefined; });
    return until(session.closeTask, this.ioTimeout).catch(cause => {
      if (session.view.held) { session.view.state = 'error'; session.view.error = bodyError(cause); }
      throw cause;
    });
  }
  private released(session: Session): void {
    if (!session.view.held) return;
    session.view.held = false;
    session.view.state = session.fault ? (session.disconnected ? 'disconnected' : 'error') : 'closed';
    if (session.fault) session.view.error = bodyError(session.fault);
    else delete session.view.error;
    session.endedAt = this.now();
    session.rx = Buffer.alloc(0);
    session.port = undefined;
    session.openTask = undefined;
    this.ownership.free(session.view.portId, session.view.id);
    session.abort.abort(session.fault ?? stateError());
    session.events.emit('change');
  }
  private async writeBytes(session: Session, bytes: Buffer): Promise<void> {
    if (session.abort.signal.aborted) throw session.abort.signal.reason;
    await new Promise<void>((resolve, reject) => session.port!.write(bytes, cause => cause ? reject(cause) : resolve()));
    if (session.abort.signal.aborted) throw session.abort.signal.reason;
    await new Promise<void>((resolve, reject) => session.port!.drain(cause => cause ? reject(cause) : resolve()));
  }
  private waitForChange(session: Session, waitMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(ioError('The read request was interrupted.')); };
      const timer = setTimeout(finish, waitMs);
      const cleanup = () => { clearTimeout(timer); session.events.off('change', finish); signal.removeEventListener('abort', abort); };
      session.events.once('change', finish);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  private owned(client: Client, id: string): Session {
    const session = this.sessions.get(id);
    if (!session || session.client !== client) throw error(404, 'SERIAL_SESSION_NOT_FOUND', 'Serial session not found.');
    return session;
  }
  private async refreshDirectory() {
    try { return await this.directory.refresh(); }
    catch (cause) { throw ioError(`Local OS enumeration failed: ${message(cause)}`); }
  }
  private view(session: Session): SessionView {
    return { ...session.view, options: { ...session.view.options }, ...(session.view.error ? { error: { ...session.view.error } } : {}) };
  }
}
