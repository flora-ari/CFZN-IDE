import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PROFILES, type HardwareConfig, type ProfileBinding, type ToolchainConfig } from './config';
import { runCommand, type Command, type CommandResult } from './process';
import type { HardwareProfile } from './types';

export type Runner = (command: Command) => Promise<CommandResult>;
export interface ReadyProfile {
  view: HardwareProfile; binding: ProfileBinding; cliPath: string; configPath: string;
  platformPath: string; cliVersion: string; identity: string; env: NodeJS.ProcessEnv;
}
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

async function linkDirectory(source: string, destination: string): Promise<void> {
  await access(source);
  await mkdir(resolve(destination, '..'), { recursive: true });
  try {
    const existing = await realpath(destination);
    if (existing !== await realpath(source)) throw new Error(`Runtime tool link points to a different installation: ${destination}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await symlink(source, destination, process.platform === 'win32' ? 'junction' : 'dir');
  }
}

export async function toolIdentity(profile: Omit<ReadyProfile, 'identity'> | ReadyProfile): Promise<string> {
  const files = [profile.cliPath, join(profile.platformPath, 'boards.txt'), join(profile.platformPath, 'platform.txt')];
  for (const library of profile.binding.libraries ?? []) files.push(join(library, 'library.properties'));
  return digest(JSON.stringify({ cliVersion: profile.cliVersion, fqbn: profile.view.fqbn, binding: profile.binding,
    files: await Promise.all(files.map(async (file) => [file, digest(await readFile(file))])) }));
}

/** Config and mutable CLI data are isolated; no install/update command ever targets a source installation. */
async function prepare(config: HardwareConfig, id: string, source: ToolchainConfig): Promise<{ configPath: string; env: NodeJS.ProcessEnv }> {
  // Old Windows GCC expands ../lib/... includes before normalization and hits MAX_PATH.
  const root = join(config.runtimeDir, 't', digest(id).slice(0, 8));
  const data = join(root, 'data');
  await Promise.all(['data/packages', 'user', 'downloads', 'cache', 'tmp'].map((part) => mkdir(join(root, part), { recursive: true })));
  for (const packageName of source.packages) {
    const original = join(source.sourceDataDir, 'packages', packageName);
    const tools = join(original, 'tools');
    try { await linkDirectory(tools, join(data, 'packages', packageName, 'tools')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  for (const profile of PROFILES) {
    const binding = config.profiles[profile.id];
    if (!binding || binding.toolchain !== id) continue;
    const [vendor, arch] = (binding.fqbn ?? profile.fqbn).split(':');
    if (!source.packages.includes(vendor)) throw new Error(`Package ${vendor} must be explicitly listed for ${id}`);
    const suffix = join(vendor, 'hardware', arch, binding.coreVersion);
    try { await linkDirectory(join(source.sourceDataDir, 'packages', suffix), join(data, 'packages', suffix)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  // Discovery tools may maintain installation state, so copy builtin rather than link it.
  const builtin = source.builtinToolsDir ?? join(source.sourceDataDir, 'packages', 'builtin');
  try { await cp(builtin, join(data, 'packages', 'builtin'), { recursive: true, force: false, errorOnExist: false }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  for (const filename of await readdir(source.sourceDataDir)) {
    if (/^(package.*\.json(?:\.sig)?|library_index\.json(?:\.sig)?)$/.test(filename)) {
      await cp(join(source.sourceDataDir, filename), join(data, filename));
    }
  }
  try { await access(join(data, 'library_index.json')); }
  catch { await writeFile(join(data, 'library_index.json'), '{"libraries":[]}'); }
  const configPath = join(root, 'arduino-cli.json');
  await writeFile(configPath, JSON.stringify({
    directories: { data, user: join(root, 'user'), downloads: join(root, 'downloads') },
    build_cache: { path: join(root, 'cache') },
    metrics: { enabled: false }, updater: { enable_notification: false },
    logging: { level: 'error' }, output: { no_color: true }, locale: 'en',
  }, null, 2));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('ARDUINO_')));
  Object.assign(env, { TMP: join(root, 'tmp'), TEMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
    ARDUINO_DIRECTORIES_DATA: data, ARDUINO_DIRECTORIES_USER: join(root, 'user'), ARDUINO_DIRECTORIES_DOWNLOADS: join(root, 'downloads'),
    ARDUINO_BUILD_CACHE_PATH: join(root, 'cache'), ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false' });
  return { configPath, env };
}

export async function discoverProfiles(config: HardwareConfig, runner: Runner = runCommand): Promise<{ views: HardwareProfile[]; ready: Map<string, ReadyProfile>; cliVersion: string | null }> {
  const ready = new Map<string, ReadyProfile>();
  const prepared = new Map<string, { configPath: string; env: NodeJS.ProcessEnv; cliVersion: string } | Error>();
  let cliVersion: string | null = null;
  const views: HardwareProfile[] = [];
  for (const base of PROFILES) {
    const binding = config.profiles[base.id];
    const view: HardwareProfile = { ...base, fqbn: binding?.fqbn ?? base.fqbn,
      compileAvailable: false, uploadAvailable: false, realtimeAvailable: false };
    views.push(view);
    try {
      if (!binding) throw new Error('No toolchain configured for this profile.');
      const source = config.toolchains[binding.toolchain];
      if (!prepared.has(binding.toolchain)) {
        try {
          const executable = await stat(source.cliPath);
          if (!executable.isFile()) throw new Error('Configured CLI is not a file.');
          const preparedData = await prepare(config, binding.toolchain, source);
          const version = await runner({ executable: source.cliPath, args: ['version'], env: preparedData.env, timeoutMs: 15_000 });
          if (version.code !== 0 || version.timedOut) throw new Error(`CLI version query failed: ${version.stderr}`);
          prepared.set(binding.toolchain, { ...preparedData, cliVersion: version.stdout.trim() });
        } catch (error) { prepared.set(binding.toolchain, error instanceof Error ? error : new Error(String(error))); }
      }
      const tool = prepared.get(binding.toolchain)!;
      if (tool instanceof Error) throw tool;
      cliVersion ??= tool.cliVersion;
      const [vendor, arch, board] = view.fqbn.split(':');
      const platformPath = join(source.sourceDataDir, 'packages', vendor, 'hardware', arch, binding.coreVersion);
      const boards = await readFile(join(platformPath, 'boards.txt'), 'utf8');
      if (!boards.split(/\r?\n/).some((line) => line.startsWith(`${board}.name=`))) throw new Error(`Board ${board} is not installed in core ${binding.coreVersion}.`);
      const details = await runner({ executable: source.cliPath, args: ['board', 'details', '--fqbn', view.fqbn, '--config-file', tool.configPath, '--json'], env: tool.env, timeoutMs: 30_000 });
      if (details.code !== 0 || details.timedOut) throw new Error(`Board/tool validation failed: ${(details.stderr || details.stdout).slice(-2000)}`);
      for (const library of binding.libraries ?? []) await access(library);
      view.compileAvailable = true; view.uploadAvailable = true;
      const profile = { view, binding: { ...binding, libraries: [...binding.libraries ?? []] }, cliPath: source.cliPath,
        ...tool, platformPath };
      ready.set(view.id, { ...profile, identity: await toolIdentity(profile) });
    } catch (error) {
      view.compileAvailable = false; view.uploadAvailable = false;
      view.reason = error instanceof Error ? error.message : String(error);
    }
  }
  return { views, ready, cliVersion };
}
