import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArduinoLibraryIndex } from '../arduino-libraries/library-index';
import { libraryReferences, type ArduinoLibraryReference } from '../arduino-libraries/library-input';
import { prepareLibraries, readLibraryProperties, type PreparedLibrary } from '../arduino-libraries/prepare-libraries';
import { ApiError, invalid, tooLarge, type ApiErrorBody } from '../common/api-error';
import type { HardwareConfig } from './config';
import { JobLog } from './log';
import { listLocalPorts } from './ports';
import { runCommand } from './process';
import { digest, discoverProfiles, toolIdentity, type ReadyProfile, type Runner } from './toolchain';
import { MODULE_IDS, SOURCE_LIMIT, type HardwareJob, type HardwarePort } from './types';
import { HardwareOwnership } from './ownership';
import { SerialDirectory } from './serial-directory';
import type { SerialDriver } from './serial-driver';
import type { SerialManagerOptions } from './serial-manager';

interface Artifact { name: string; sha256: string; sizeBytes: number }
interface RecordJob {
  job: HardwareJob; log: JobLog; abort: AbortController; profile: ReadyProfile;
  directory: string; buildPath: string; sketchPath: string; artifacts?: Artifact[]; moduleIds: string[];
  libraries?: Omit<PreparedLibrary, 'path'>[];
  release?: () => void;
}
export interface ExecutorOptions {
  runner?: Runner; ports?: () => Promise<HardwarePort[]>;
  discovered?: Awaited<ReturnType<typeof discoverProfiles>>;
  buildTimeoutMs?: number; uploadTimeoutMs?: number;
  arduinoLibraryFetch?: typeof fetch;
  ownership?: HardwareOwnership;
  directory?: SerialDirectory;
  serialDriver?: SerialDriver | null;
  serialOptions?: SerialManagerOptions;
}
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) {
    throw invalid(`Provide only: ${fields.join(', ')}.`);
  }
  return value as Record<string, unknown>;
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw invalid(`${field} must be a nonempty string.`, field);
  return value;
}
const notReady = (message: string) => new ApiError(409, 'BUILD_NOT_READY', message);
const timeout = (kind: string) => new ApiError(500, 'TOOL_TIMEOUT', `Hardware ${kind} exceeded its timeout.`);

export class HardwareExecutor {
  private readonly jobs = new Map<string, RecordJob>();
  private active?: string;
  private reserving = false;
  private stopping = false;
  private reservation?: Promise<void>;
  private readonly runner: Runner;
  private readonly portsProvider: () => Promise<HardwarePort[]>;
  private readonly libraryFetch: typeof fetch;
  private readonly libraryIndex: ArduinoLibraryIndex;
  private readonly ownership: HardwareOwnership;
  private constructor(readonly config: HardwareConfig, readonly discovery: Awaited<ReturnType<typeof discoverProfiles>>, private readonly options: ExecutorOptions) {
    this.runner = options.runner ?? runCommand; this.portsProvider = options.ports ?? listLocalPorts;
    this.libraryFetch = options.arduinoLibraryFetch ?? globalThis.fetch;
    this.libraryIndex = new ArduinoLibraryIndex(this.libraryFetch);
    this.ownership = options.ownership ?? new HardwareOwnership();
  }
  static async create(config: HardwareConfig, options: ExecutorOptions = {}): Promise<HardwareExecutor> {
    await mkdir(join(config.runtimeDir, 'jobs'), { recursive: true });
    return new HardwareExecutor(config, options.discovered ?? await discoverProfiles(config, options.runner), options);
  }
  capabilities() {
    return { protocolVersion: 1, executionHost: 'local', profiles: this.discovery.views,
      toolchain: { cliVersion: this.discovery.cliVersion,
        description: 'Local Arduino CLI; configured installed cores/tools only. Availability is dependency validation; real build/upload results are reported by jobs. No realtime firmware has been verified.' } };
  }
  async ports(): Promise<{ items: HardwarePort[] }> {
    const ports = this.options.directory ? await this.options.directory.refresh() : await this.portsProvider();
    return { items: ports.map(({ portId, displayName, usbVendorId, usbProductId }) => ({ portId, displayName,
      ...(usbVendorId ? { usbVendorId } : {}), ...(usbProductId ? { usbProductId } : {}) })) };
  }
  read(id: string, cursor: unknown) {
    const record = this.requireJob(id);
    const value = cursor === undefined ? '0' : cursor;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw invalid('afterLog must be a nonnegative integer.', 'afterLog');
    return { job: { ...record.job }, ...record.log.read(Number(value)) };
  }
  startBuild(body: unknown): { job: HardwareJob } {
    const input = object(body, ['deviceId', 'profileId', 'code', 'moduleIds', 'libraries']);
    const profileId = requiredString(input.profileId, 'profileId');
    const deviceId = requiredString(input.deviceId, 'deviceId');
    const view = this.discovery.views.find((profile) => profile.id === profileId && profile.deviceId === deviceId);
    if (!view) throw invalid('deviceId and profileId must identify the same registered hardware profile.');
    const code = requiredString(input.code, 'code');
    if (Buffer.byteLength(code) > SOURCE_LIMIT) throw tooLarge('Source code exceeds 1 MiB UTF-8.');
    const moduleIds = input.moduleIds ?? [];
    if (!Array.isArray(moduleIds) || moduleIds.length > MODULE_IDS.length ||
        moduleIds.some((id) => typeof id !== 'string' || !MODULE_IDS.includes(id)) || new Set(moduleIds).size !== moduleIds.length) {
      throw invalid('moduleIds must contain distinct supported module IDs.', 'moduleIds');
    }
    const libraries = libraryReferences(input.libraries, 'libraries', 64);
    this.assertIdle();
    const profile = this.discovery.ready.get(profileId);
    if (!profile) throw new ApiError(503, 'TOOLCHAIN_UNAVAILABLE', view.reason ?? 'Profile is unavailable.');
    const release = this.ownership.beginCli('build');
    const record = this.newRecord('build', profile, digest(code), moduleIds);
    record.release = release;
    this.active = record.job.id;
    void this.build(record, code, libraries);
    return { job: { ...record.job } };
  }
  async startUpload(body: unknown): Promise<{ job: HardwareJob }> {
    const input = object(body, ['buildId', 'portId']);
    const buildId = requiredString(input.buildId, 'buildId');
    const portId = requiredString(input.portId, 'portId');
    this.assertIdle();
    const release = this.ownership.beginCli('upload', portId);
    let transferred = false;
    let reservationFinished!: () => void;
    const reservation = new Promise<void>(resolve => { reservationFinished = resolve; });
    this.reservation = reservation;
    this.reserving = true;
    try {
      const build = this.requireJob(buildId);
      if (build.job.kind !== 'build' || build.job.state !== 'succeeded' || !build.artifacts) throw notReady('A successful retained build is required.');
      this.ownership.assertPortFree(portId);
      const ports = this.options.directory ? await this.options.directory.refresh() : await this.portsProvider();
      if (!ports.some((port) => port.portId === portId)) throw new ApiError(404, 'PORT_NOT_FOUND', 'The selected local OS port is no longer available.');
      this.ownership.assertPortFree(portId);
      if (await toolIdentity(build.profile) !== build.profile.identity) throw notReady('Toolchain/profile identity changed. Compile again.');
      try {
        const artifacts = await this.artifacts(build);
        if (JSON.stringify(artifacts) !== JSON.stringify(build.artifacts)) throw new Error('Build artifacts changed.');
      } catch { throw notReady('Build artifacts are missing or changed. Compile again.'); }
      if (this.stopping) throw new ApiError(409, 'HARDWARE_BUSY', 'The hardware executor is shutting down.');
      const record = this.newRecord('upload', build.profile, build.job.sourceHash, build.moduleIds);
      record.job.buildId = buildId; record.job.portId = portId;
      record.buildPath = build.buildPath; record.sketchPath = build.sketchPath;
      record.libraries = build.libraries;
      record.release = release;
      transferred = true;
      this.active = record.job.id;
      void this.upload(record);
      return { job: { ...record.job } };
    } finally {
      this.reserving = false;
      if (!transferred) release();
      reservationFinished();
      if (this.reservation === reservation) this.reservation = undefined;
    }
  }
  cancel(id: string, body: unknown): { job: HardwareJob } {
    object(body, []);
    const record = this.requireJob(id);
    if (record.job.state === 'running') {
      record.job.state = 'cancelling';
      record.log.append('system', 'Cancellation requested; waiting for the job to stop.\n');
      record.abort.abort();
    }
    return { job: { ...record.job } };
  }
  async close(): Promise<void> {
    this.stopping = true;
    await this.reservation;
    const active = this.active && this.jobs.get(this.active);
    if (active) {
      this.cancel(active.job.id, {});
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => { if (!this.active) { clearInterval(timer); resolve(); } }, 20);
      });
    }
  }
  private assertIdle(): void {
    if (this.stopping || this.active || this.reserving) throw new ApiError(409, 'HARDWARE_BUSY', 'The executor is stopping or another hardware build/upload is still active.');
  }
  private requireJob(id: string): RecordJob {
    const record = this.jobs.get(id);
    if (!record) throw new ApiError(404, 'JOB_NOT_FOUND', 'Hardware job was not found (jobs are local to this executor session).');
    return record;
  }
  private newRecord(kind: 'build' | 'upload', profile: ReadyProfile, sourceHash: string, moduleIds: string[]): RecordJob {
    const id = randomUUID();
    const directory = join(this.config.runtimeDir, 'jobs', id);
    const record: RecordJob = {
      job: { id, kind, state: 'running', stage: kind === 'build' ? 'compiling' : 'uploading',
        deviceId: profile.view.deviceId, profileId: profile.view.id, sourceHash, createdAt: new Date().toISOString() },
      log: new JobLog(), abort: new AbortController(), profile, directory,
      buildPath: join(directory, 'build'), sketchPath: join(directory, 'sketch'), moduleIds: [...moduleIds],
    };
    this.jobs.set(id, record);
    return record;
  }
  private async artifacts(record: RecordJob): Promise<Artifact[]> {
    const suffixes = record.profile.view.chip === 'avr' ? ['hex', 'elf'] : ['bin', 'partitions.bin', 'elf'];
    const artifacts: Artifact[] = [];
    for (const suffix of suffixes) {
      const name = `sketch.ino.${suffix}`;
      const path = join(record.buildPath, name);
      const info = await lstat(path);
      if (!info.isFile() || info.size === 0) throw new Error(`Expected build artifact missing or empty: ${name}`);
      artifacts.push({ name, sizeBytes: info.size, sha256: digest(await readFile(path)) });
    }
    return artifacts;
  }
  private async build(record: RecordJob, code: string, libraries: ArduinoLibraryReference[]): Promise<void> {
    await this.execute(record, async () => {
      const limit = this.options.buildTimeoutMs ?? 10 * 60_000;
      const started = performance.now();
      const deadline = AbortSignal.timeout(limit);
      const preparationSignal = AbortSignal.any([record.abort.signal, deadline]);
      await Promise.all([record.sketchPath, record.buildPath, join(record.directory, 'tmp')].map((path) => mkdir(path, { recursive: true })));
      await writeFile(join(record.sketchPath, 'sketch.ino'), code, { flag: 'wx' });
      if (await toolIdentity(record.profile) !== record.profile.identity) throw new Error('Toolchain identity changed since capabilities validation; restart the executor.');
      if (libraries.length) {
        record.log.append('system', `Preparing Arduino libraries: ${libraries.map(({ name, version }) => `${name}@${version}`).join(', ')}\n`);
      }
      const selected = await prepareLibraries(libraries, record.directory, this.libraryIndex, this.libraryFetch, preparationSignal).catch((error: unknown) => {
        if (deadline.aborted) throw timeout('build');
        throw error;
      });
      if (selected.length) record.libraries = selected.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
      const args = ['compile', '--fqbn', record.profile.view.fqbn, '--config-file', record.profile.configPath,
        '--build-path', record.buildPath, '--jobs', '2', '--verbose', '--no-color'];
      const selectedNames = new Set(selected.map(({ name }) => name.toLowerCase()));
      for (const library of record.profile.binding.libraries ?? []) {
        if (selectedNames.size) {
          const properties = await readLibraryProperties(library, record.abort.signal);
          const name = properties.get('name')?.toLowerCase();
          if (name && selectedNames.has(name)) continue;
        }
        args.push('--library', library);
      }
      for (const { path } of selected) args.push('--library', path);
      args.push(record.sketchPath);
      record.abort.signal.throwIfAborted();
      const remaining = Math.floor(limit - (performance.now() - started));
      if (remaining <= 0) throw timeout('build');
      await this.command(record, args, remaining);
      record.artifacts = await this.artifacts(record);
      record.log.append('system', `Verified build artifacts: ${record.artifacts.map((file) => `${file.name} (${file.sizeBytes} bytes, sha256 ${file.sha256})`).join(', ')}\n`);
    });
  }
  private async upload(record: RecordJob): Promise<void> {
    await this.execute(record, async () => {
      await mkdir(join(record.directory, 'tmp'), { recursive: true });
      const result = await this.command(record, ['upload', '--fqbn', record.profile.view.fqbn, '--config-file', record.profile.configPath,
        '--build-path', record.buildPath, '--port', record.job.portId!, '--verify', '--verbose', '--no-color', record.sketchPath], this.options.uploadTimeoutMs ?? 3 * 60_000);
      if (!/Hash of data verified\.|avrdude:[^\r\n]*bytes of flash verified|verification (?:successful|succeeded)|verify successful/i.test(result.stdout + result.stderr)) {
        throw new Error('Uploader exited 0 without a verification diagnostic; upload success cannot be confirmed.');
      }
      record.log.append('system', 'Uploader exited 0 and reported verification. Program behaviour still requires serial/hardware validation.\n');
    });
  }
  private async command(record: RecordJob, args: string[], timeoutMs: number) {
    record.log.append('system', `CLI ${record.profile.cliVersion}\n${JSON.stringify([record.profile.cliPath, ...args])}\n`);
    const result = await this.runner({ executable: record.profile.cliPath, args, cwd: record.directory,
      env: { ...record.profile.env, TEMP: join(record.directory, 'tmp'), TMP: join(record.directory, 'tmp'), TMPDIR: join(record.directory, 'tmp') },
      timeoutMs, signal: record.abort.signal, output: (stream, text) => record.log.append(stream, text) });
    record.log.append('system', `Process closed: exit=${result.code}, signal=${result.signal ?? 'none'}.\n`);
    if (result.timedOut) throw timeout(record.job.kind);
    if (result.cancelled || record.abort.signal.aborted) throw new Error('Task cancelled.');
    if (result.code !== 0 || result.signal) throw new Error(`CLI failed (exit ${result.code}, signal ${result.signal ?? 'none'}): ${(result.stderr || result.stdout).slice(-4000)}`);
    return result;
  }
  private async execute(record: RecordJob, operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
      record.job.state = record.abort.signal.aborted ? 'cancelled' : 'succeeded';
    } catch (error) {
      if (record.abort.signal.aborted) record.job.state = 'cancelled';
      else {
        record.job.state = 'failed';
        record.job.error = error instanceof ApiError ? (error.getResponse() as ApiErrorBody).error : {
          code: record.job.kind === 'build' ? 'COMPILE_FAILED' : 'UPLOAD_FAILED',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      record.log.append('system', `${record.job.error?.message ?? 'Task cancelled.'}\n`);
    } finally {
      record.job.stage = 'complete'; record.job.finishedAt = new Date().toISOString();
      // A terminal task no longer owns a tool process. Pollers may immediately start upload.
      if (this.active === record.job.id) this.active = undefined;
      record.release?.();
      try {
        await mkdir(record.directory, { recursive: true });
        await writeFile(join(record.directory, 'result.json'), JSON.stringify({ job: record.job, logs: record.log.read(0),
          toolIdentity: record.profile.identity, cliVersion: record.profile.cliVersion, fqbn: record.profile.view.fqbn,
          coreVersion: record.profile.binding.coreVersion, moduleIds: record.moduleIds, libraries: record.libraries, artifacts: record.artifacts }, null, 2));
      } catch (error) { record.log.append('system', `Could not write local evidence: ${String(error)}\n`); }
      // Retain at most 20 terminal jobs and their generated files in this session.
      while (this.jobs.size > 20) {
        const oldest = [...this.jobs.values()].find((item) => item.job.stage === 'complete' && item !== record &&
          ![...this.jobs.values()].some((other) => other.job.buildId === item.job.id));
        if (!oldest) break;
        this.jobs.delete(oldest.job.id);
        try { await rm(oldest.directory, { recursive: true, force: true }); } catch { /* Unreferenced evidence may be cleaned manually. */ }
      }
    }
  }
}
