import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, invalid, tooLarge } from '../common/api-error';
import type { HardwareConfig } from './config';
import { JobLog } from './log';
import { listLocalPorts } from './ports';
import { runCommand } from './process';
import { digest, discoverProfiles, toolIdentity, type ReadyProfile, type Runner } from './toolchain';
import { MODULE_IDS, SOURCE_LIMIT, type DeviceId, type HardwareJob, type HardwarePort } from './types';

interface BuildInput { deviceId: DeviceId; profileId: string; code: string; moduleIds: string[] }
interface Artifact { name: string; sha256: string; sizeBytes: number }
interface RecordJob {
  job: HardwareJob; log: JobLog; abort: AbortController; profile: ReadyProfile;
  directory: string; buildPath: string; sketchPath: string; artifacts?: Artifact[]; moduleIds: string[];
}
export interface ExecutorOptions {
  runner?: Runner; ports?: () => Promise<HardwarePort[]>;
  discovered?: Awaited<ReturnType<typeof discoverProfiles>>;
  buildTimeoutMs?: number; uploadTimeoutMs?: number;
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

export class HardwareExecutor {
  private readonly jobs = new Map<string, RecordJob>();
  private active?: string;
  private reserving = false;
  private readonly runner: Runner;
  private readonly portsProvider: () => Promise<HardwarePort[]>;
  private constructor(readonly config: HardwareConfig, readonly discovery: Awaited<ReturnType<typeof discoverProfiles>>, private readonly options: ExecutorOptions) {
    this.runner = options.runner ?? runCommand; this.portsProvider = options.ports ?? listLocalPorts;
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
  async ports(): Promise<{ items: HardwarePort[] }> { return { items: await this.portsProvider() }; }
  read(id: string, cursor: unknown) {
    const record = this.requireJob(id);
    const value = cursor === undefined ? '0' : cursor;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw invalid('afterLog must be a nonnegative integer.', 'afterLog');
    return { job: { ...record.job }, ...record.log.read(Number(value)) };
  }
  startBuild(body: unknown): { job: HardwareJob } {
    const input = object(body, ['deviceId', 'profileId', 'code', 'moduleIds']);
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
    this.assertIdle();
    const profile = this.discovery.ready.get(profileId);
    if (!profile) throw new ApiError(503, 'TOOLCHAIN_UNAVAILABLE', view.reason ?? 'Profile is unavailable.');
    const record = this.newRecord('build', profile, digest(code), moduleIds);
    this.active = record.job.id;
    void this.build(record, { deviceId: deviceId as DeviceId, profileId, code, moduleIds });
    return { job: { ...record.job } };
  }
  async startUpload(body: unknown): Promise<{ job: HardwareJob }> {
    const input = object(body, ['buildId', 'portId']);
    const buildId = requiredString(input.buildId, 'buildId');
    const portId = requiredString(input.portId, 'portId');
    this.assertIdle(); this.reserving = true;
    try {
      const build = this.requireJob(buildId);
      if (build.job.kind !== 'build' || build.job.state !== 'succeeded' || !build.artifacts) throw notReady('A successful retained build is required.');
      if (!(await this.portsProvider()).some((port) => port.portId === portId)) throw new ApiError(404, 'PORT_NOT_FOUND', 'The selected local OS port is no longer available.');
      if (await toolIdentity(build.profile) !== build.profile.identity) throw notReady('Toolchain/profile identity changed. Compile again.');
      try {
        const artifacts = await this.artifacts(build);
        if (JSON.stringify(artifacts) !== JSON.stringify(build.artifacts)) throw new Error('Build artifacts changed.');
      } catch { throw notReady('Build artifacts are missing or changed. Compile again.'); }
      const record = this.newRecord('upload', build.profile, build.job.sourceHash, build.moduleIds);
      record.job.buildId = buildId; record.job.portId = portId;
      record.buildPath = build.buildPath; record.sketchPath = build.sketchPath;
      this.active = record.job.id;
      void this.upload(record);
      return { job: { ...record.job } };
    } finally { this.reserving = false; }
  }
  cancel(id: string, body: unknown): { job: HardwareJob } {
    object(body, []);
    const record = this.requireJob(id);
    if (record.job.state === 'running') {
      record.job.state = 'cancelling';
      record.log.append('system', 'Cancellation requested; waiting for the owned process tree to exit.\n');
      record.abort.abort();
    }
    return { job: { ...record.job } };
  }
  async close(): Promise<void> {
    const active = this.active && this.jobs.get(this.active);
    if (active) {
      this.cancel(active.job.id, {});
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => { if (!this.active) { clearInterval(timer); resolve(); } }, 20);
      });
    }
  }
  private assertIdle(): void {
    if (this.active || this.reserving) throw new ApiError(409, 'HARDWARE_BUSY', 'Another hardware build/upload is still active.');
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
  private async build(record: RecordJob, input: BuildInput): Promise<void> {
    await this.execute(record, async () => {
      await Promise.all([record.sketchPath, record.buildPath, join(record.directory, 'tmp')].map((path) => mkdir(path, { recursive: true })));
      await writeFile(join(record.sketchPath, 'sketch.ino'), input.code, { flag: 'wx' });
      if (await toolIdentity(record.profile) !== record.profile.identity) throw new Error('Toolchain identity changed since capabilities validation; restart the executor.');
      const args = ['compile', '--fqbn', record.profile.view.fqbn, '--config-file', record.profile.configPath,
        '--build-path', record.buildPath, '--jobs', '2', '--verbose', '--no-color'];
      for (const library of record.profile.binding.libraries ?? []) args.push('--library', library);
      args.push(record.sketchPath);
      await this.command(record, args, this.options.buildTimeoutMs ?? 10 * 60_000);
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
    if (result.timedOut) throw new ApiError(500, 'TOOL_TIMEOUT', `Hardware ${record.job.kind} exceeded its timeout; owned processes were terminated.`);
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
        record.job.error = { code: error instanceof ApiError ? (error.getResponse() as { error: { code: string } }).error.code : record.job.kind === 'build' ? 'COMPILE_FAILED' : 'UPLOAD_FAILED',
          message: error instanceof Error ? error.message : String(error) };
      }
      record.log.append('system', `${record.job.error?.message ?? 'Task cancelled after the owned process exited.'}\n`);
    } finally {
      record.job.stage = 'complete'; record.job.finishedAt = new Date().toISOString();
      // A terminal task no longer owns a tool process. Pollers may immediately start upload.
      if (this.active === record.job.id) this.active = undefined;
      try {
        await mkdir(record.directory, { recursive: true });
        await writeFile(join(record.directory, 'result.json'), JSON.stringify({ job: record.job, logs: record.log.read(0),
          toolIdentity: record.profile.identity, cliVersion: record.profile.cliVersion, fqbn: record.profile.view.fqbn,
          coreVersion: record.profile.binding.coreVersion, moduleIds: record.moduleIds, artifacts: record.artifacts }, null, 2));
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
