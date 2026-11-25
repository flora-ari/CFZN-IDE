const assert = require('node:assert/strict');
const { ZipFile } = require('yazl');
const { mkdtemp, mkdir, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { createHardwareApp } = require('../dist/hardware/app.js');
const { loadHardwareConfig, PROFILES } = require('../dist/hardware/config.js');
const { digest, discoverProfiles, toolIdentity } = require('../dist/hardware/toolchain.js');
const { runCommand } = require('../dist/hardware/process.js');
const { JobLog } = require('../dist/hardware/log.js');

Logger.overrideLogger(false);
const headers = { 'Content-Type': 'application/json' };
const buildBody = { deviceId: 'arduinoEsp32', profileId: 'esp32-4mb-dio', code: 'void setup(){} void loop(){}', moduleIds: ['activateBuzzer'] };
const ok = (stdout = '', stderr = '', code = 0) => ({ code, signal: null, stdout, stderr, cancelled: false, timedOut: false });
const post = (request, path, body) => request(path, { method: 'POST', headers, body: JSON.stringify(body) });
async function error(response, status, code) {
  assert.equal(response.status, status);
  assert.equal((await response.json()).error.code, code);
}
async function wait(request, id) {
  for (let n = 0; n < 500; n++) {
    const response = await request(`/jobs/${id}`);
    assert.equal(response.status, 200);
    const value = await response.json();
    if (value.job.stage === 'complete') {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Hardware job did not terminate.');
}
async function fixture(t, handler, { configuredLibrary, ...options } = {}) {
  const runtimeDir = await mkdtemp(join(tmpdir(), 'cfzn-hardware-'));
  const platformPath = join(runtimeDir, 'platform');
  await mkdir(platformPath);
  await writeFile(join(platformPath, 'boards.txt'), 'esp32.name=ESP32\n');
  await writeFile(join(platformPath, 'platform.txt'), 'name=test\n');
  const view = { ...PROFILES.find((profile) => profile.id === buildBody.profileId), compileAvailable: true, uploadAvailable: true, realtimeAvailable: false };
  const profile = { view, binding: { toolchain: 'test', coreVersion: '1.0.6', libraries: [] },
    cliPath: process.execPath, configPath: join(runtimeDir, 'cli.json'), platformPath, cliVersion: 'fixture-cli-1', env: process.env };
  if (configuredLibrary) {
    const path = join(runtimeDir, 'local-library');
    await mkdir(path);
    await writeFile(join(path, 'library.properties'), `name=${configuredLibrary}\nversion=0.1.0\n`);
    profile.binding.libraries.push(path);
  }
  profile.identity = await toolIdentity(profile);
  const calls = [];
  const runner = async (command) => {
    calls.push(command);
    if (handler) return handler(command);
    if (command.args[0] === 'compile') {
      const path = command.args[command.args.indexOf('--build-path') + 1];
      for (const suffix of ['bin', 'partitions.bin', 'elf']) await writeFile(join(path, `sketch.ino.${suffix}`), `real fixture bytes ${suffix}`);
      command.output?.('stdout', 'fixture compiled\n');
      return ok('fixture compiled\n');
    }
    command.output?.('stdout', 'Hash of data verified.\n');
    return ok('Hash of data verified.\n');
  };
  const config = { runtimeDir, toolchains: {}, profiles: {}, allowedOrigins: ['https://ide.example.test'] };
  const views = PROFILES.map((base) => base.id === view.id ? view : { ...base, compileAvailable: false, uploadAvailable: false, realtimeAvailable: false, reason: 'missing fixture core' });
  const app = await createHardwareApp(config, { runner, ports: async () => [{ portId: 'COM_TEST', displayName: 'Mock serial' }],
    discovered: { views, ready: new Map([[view.id, profile]]), cliVersion: profile.cliVersion }, ...options });
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1/hardware`;
  t.after(async () => { await app.close(); await rm(runtimeDir, { recursive: true, force: true }); });
  return { request: (path, options) => fetch(`${base}${path}`, options), runtimeDir, calls, profile };
}

test('hardware compiles exact job-local library versions and rejects unsafe packages before CLI launch', async (t) => {
  const packages = new Map();
  for (const version of ['1.2.2', '1.3.0', '1.4.0', '1.5.0', '1.6.0']) {
    const zip = new ZipFile();
    zip.addBuffer(Buffer.from(`name=Fixture Servo\nversion=${version}\n`), 'FixtureRoot/library.properties');
    zip.addBuffer(Buffer.from(version), 'FixtureRoot/src/FixtureServo.h');
    if (version === '1.5.0') zip.addBuffer(Buffer.from('unsafe'), 'FixtureRoot/NUL.txt');
    if (version === '1.6.0') zip.addBuffer(Buffer.from('duplicate'), 'FixtureRoot/src/fixtureservo.h');
    zip.end();
    const chunks = [];
    for await (const chunk of zip.outputStream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const name = 'Fixture Servo';
    const url = `https://downloads.arduino.cc/libraries/github.com/f/FixtureServo-${version}.zip`;
    const checksum = `SHA-256:${version === '1.4.0' ? 'b'.repeat(64) : digest(bytes)}`;
    packages.set(url, { bytes, row: { name, version, url, checksum, size: bytes.length } });
  }
  let requestedDownload;
  const downloading = new Promise((resolve) => { requestedDownload = resolve; });
  let holdDownload = false;
  const arduinoLibraryFetch = async (url, { redirect, signal }) => {
    assert.equal(redirect, 'error');
    if (url === 'https://downloads.arduino.cc/libraries/library_index.json') {
      return Response.json({ libraries: [...packages.values()].map(({ row }) => row) });
    }
    assert.ok(packages.has(url));
    if (holdDownload) {
      requestedDownload();
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }
    return new Response(packages.get(url).bytes);
  };
  const { request, calls, runtimeDir } = await fixture(t, undefined, { arduinoLibraryFetch, configuredLibrary: 'Fixture Servo' });
  const library = (version) => ({ name: 'Fixture Servo', version });
  const build = (libraries) => post(request, '/builds', { ...buildBody, libraries });
  const start = async (libraries) => {
    const response = await build(libraries);
    assert.equal(response.status, 202);
    return (await response.json()).job.id;
  };
  for (const [position, version] of ['1.2.2', '1.3.0'].entries()) {
    const id = await start([library(version), library(version)]);
    const { job } = await wait(request, id);
    assert.equal(job.state, 'succeeded', job.error?.message);
    const [command] = calls.slice(position);
    assert.equal(command.args.filter((arg) => arg === '--library').length, 1);
    const path = command.args[command.args.indexOf('--library') + 1];
    assert.equal(path, join(runtimeDir, 'jobs', id, 'l', '0', 'Fixture_Servo'));
    assert.equal(await readFile(join(path, 'src', 'FixtureServo.h'), 'utf8'), version);
  }
  const conflict = await build([library('1.2.2'), library('1.3.0')]);
  assert.equal(conflict.status, 400);
  assert.match((await conflict.json()).error.message, /1\.2\.2.*1\.3\.0/);
  await error(await build([{ ...library('1.2.2'), url: 'https://example.test/a.zip' }]), 400, 'VALIDATION_ERROR');
  for (const [version, code, message] of [
    ['1.4.0', 'ARDUINO_LIBRARY_PREPARATION_FAILED', /SHA-256/],
    ['1.5.0', 'ARDUINO_LIBRARY_PREPARATION_FAILED', /unsafe library path/],
    ['1.6.0', 'ARDUINO_LIBRARY_PREPARATION_FAILED', /conflicting or duplicate paths/],
    ['1.7.0', 'ARDUINO_LIBRARY_NOT_FOUND', /unavailable in the official index/],
  ]) {
    const id = await start([library(version)]);
    const { job } = await wait(request, id);
    assert.equal(job.state, 'failed');
    assert.equal(job.error.code, code);
    assert.match(job.error.message, message);
    await assert.rejects(readFile(join(runtimeDir, 'jobs', id, 'l', '0', 'Fixture_Servo', 'library.properties')), { code: 'ENOENT' });
  }
  holdDownload = true;
  const cancelled = await start([library('1.2.2')]);
  await downloading;
  assert.equal((await post(request, `/jobs/${cancelled}/cancel`, {})).status, 200);
  assert.equal((await wait(request, cancelled)).job.state, 'cancelled');
  assert.equal(calls.length, 2);
});

test('hardware HTTP binds source/profile/artifacts and upload verification without project API routes', async (t) => {
  const { request, calls, runtimeDir } = await fixture(t);
  const capabilities = await (await request('/capabilities')).json();
  assert.equal(capabilities.protocolVersion, 1);
  assert.equal(capabilities.executionHost, 'local');
  assert.equal(capabilities.profiles.length, 5);
  assert.equal(capabilities.profiles.filter((profile) => profile.compileAvailable).length, 1);
  assert.deepEqual(await (await request('/ports')).json(), { items: [{ portId: 'COM_TEST', displayName: 'Mock serial' }] });
  const response = await post(request, '/builds', buildBody);
  assert.equal(response.status, 202);
  const { job } = await response.json();
  assert.equal(job.state, 'running'); assert.equal(job.stage, 'compiling');
  assert.equal(job.sourceHash, digest(buildBody.code));
  const done = await wait(request, job.id);
  assert.equal(done.job.state, 'succeeded');
  assert.ok(done.job.finishedAt);
  assert.ok(done.logs.some((entry) => entry.text.includes('Verified build artifacts')));
  assert.deepEqual((await (await request(`/jobs/${job.id}?afterLog=${done.nextLog}`)).json()).logs, []);
  await error(await post(request, '/uploads', { buildId: job.id, portId: 'COM_NOT_SELECTED' }), 404, 'PORT_NOT_FOUND');
  const uploadResponse = await post(request, '/uploads', { buildId: job.id, portId: 'COM_TEST' });
  assert.equal(uploadResponse.status, 202);
  const upload = (await uploadResponse.json()).job;
  assert.equal(upload.buildId, job.id); assert.equal(upload.sourceHash, job.sourceHash);
  const uploaded = await wait(request, upload.id);
  assert.equal(uploaded.job.state, 'succeeded');
  const evidence = JSON.parse(await readFile(join(runtimeDir, 'jobs', job.id, 'result.json'), 'utf8'));
  assert.equal(evidence.artifacts.length, 3);
  assert.equal(evidence.moduleIds[0], 'activateBuzzer');
  assert.ok(evidence.artifacts.every((artifact) => artifact.sizeBytes > 0 && artifact.sha256.length === 64));
  assert.equal(calls[0].executable, process.execPath);
  assert.ok(calls[1].args.includes('--verify'));
  assert.equal(calls[1].args[calls[1].args.indexOf('--port') + 1], 'COM_TEST');
  assert.equal(calls[0].args[calls[0].args.indexOf('--fqbn') + 1], capabilities.profiles.find((profile) => profile.id === buildBody.profileId).fqbn);
  await writeFile(join(runtimeDir, 'jobs', job.id, 'build', 'sketch.ino.bin'), 'tampered');
  await error(await post(request, '/uploads', { buildId: job.id, portId: 'COM_TEST' }), 409, 'BUILD_NOT_READY');
  await error(await request('/projects'), 404, 'NOT_FOUND');
});

test('hardware validates exact fields, sizes, profiles, origin and missing jobs', async (t) => {
  const { request } = await fixture(t);
  for (const body of [{ ...buildBody, fqbn: 'injected' }, { ...buildBody, deviceId: 'arduinoUno' },
    { ...buildBody, moduleIds: ['../../lib'] }, { ...buildBody, moduleIds: ['atomizer', 'atomizer'] }, { ...buildBody, code: '' }]) {
    await error(await post(request, '/builds', body), 400, 'VALIDATION_ERROR');
  }
  await error(await post(request, '/builds', { ...buildBody, code: '界'.repeat(350000) }), 413, 'PAYLOAD_TOO_LARGE');
  await error(await post(request, '/builds', { ...buildBody, deviceId: 'arduinoEsp32S3', profileId: 'esp32s3-default' }), 503, 'TOOLCHAIN_UNAVAILABLE');
  await error(await request('/jobs/missing'), 404, 'JOB_NOT_FOUND');
  await error(await post(request, '/uploads', { buildId: 'missing', portId: 'COM_TEST' }), 404, 'JOB_NOT_FOUND');
  const created = (await (await post(request, '/builds', buildBody)).json()).job;
  await wait(request, created.id);
  await error(await request(`/jobs/${created.id}?afterLog=-1`), 400, 'VALIDATION_ERROR');
  await error(await post(request, `/jobs/${created.id}/cancel`, { anything: true }), 400, 'VALIDATION_ERROR');
  await error(await request('/capabilities', { headers: { Origin: 'https://unconfigured.test' } }), 400, 'VALIDATION_ERROR');
  const cors = await request('/builds', { method: 'OPTIONS', headers: { Origin: 'https://ide.example.test', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(cors.status, 204); assert.equal(cors.headers.get('access-control-allow-origin'), 'https://ide.example.test');
});

test('hardware enforces one active job and remains cancelling until runner confirms exit', async (t) => {
  let release;
  let started;
  const running = new Promise((resolve) => { started = resolve; });
  const { request } = await fixture(t, async (command) => {
    started();
    return new Promise((resolve) => { release = () => resolve({ ...ok(), code: null, cancelled: command.signal.aborted }); });
  });
  const first = (await (await post(request, '/builds', buildBody)).json()).job;
  await running;
  await error(await post(request, '/builds', buildBody), 409, 'HARDWARE_BUSY');
  await error(await post(request, '/uploads', { buildId: first.id, portId: 'COM_TEST' }), 409, 'HARDWARE_BUSY');
  const cancelled = await post(request, `/jobs/${first.id}/cancel`, {});
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).job.state, 'cancelling');
  assert.equal((await (await request(`/jobs/${first.id}`)).json()).job.state, 'cancelling');
  await error(await post(request, '/builds', buildBody), 409, 'HARDWARE_BUSY');
  release();
  assert.equal((await wait(request, first.id)).job.state, 'cancelled');
  assert.equal((await (await post(request, `/jobs/${first.id}/cancel`, {})).json()).job.state, 'cancelled');
});

test('exit zero without actual artifacts fails, and timeout carries its own error', async (t) => {
  let mode = 'empty';
  const { request } = await fixture(t, async () => mode === 'empty' ? ok() : { ...ok(), code: null, timedOut: true });
  const first = (await (await post(request, '/builds', buildBody)).json()).job;
  const failed = await wait(request, first.id);
  assert.equal(failed.job.state, 'failed'); assert.equal(failed.job.error.code, 'COMPILE_FAILED');
  await error(await post(request, '/uploads', { buildId: first.id, portId: 'COM_TEST' }), 409, 'BUILD_NOT_READY');
  mode = 'timeout';
  const second = (await (await post(request, '/builds', buildBody)).json()).job;
  assert.equal((await wait(request, second.id)).job.error.code, 'TOOL_TIMEOUT');
});

test('logs retain a bounded tail with an explicit truncation notice and monotonic cursors', () => {
  const logs = new JobLog();
  for (let n = 0; n < 1500; n++) logs.append('stdout', `${n}: ${'界'.repeat(800)}\n`);
  const result = logs.read(0);
  assert.match(result.logs[0].text, /truncated/);
  assert.equal(result.nextLog, 1500);
  assert.ok(result.logs.reduce((sum, log) => sum + Buffer.byteLength(log.text), 0) <= 1024 ** 2);
  assert.deepEqual(logs.read(result.nextLog).logs, []);
  logs.append('stderr', 'last diagnostic');
  assert.deepEqual(logs.read(result.nextLog), { logs: [{ index: 1500, stream: 'stderr', text: 'last diagnostic' }], nextLog: 1501 });
  const oversized = new JobLog();
  oversized.append('stderr', 'x'.repeat(2 * 1024 ** 2));
  assert.match(oversized.read(0).logs[0].text, /truncated/);
  assert.ok(Buffer.byteLength(oversized.read(0).logs[0].text) < 1024 ** 2);
});

test('upload reports real failure or missing verification rather than accepting exit zero', async (t) => {
  let uploadMode = 'busy';
  const { request, profile } = await fixture(t, async (command) => {
    if (command.args[0] === 'compile') {
      const path = command.args[command.args.indexOf('--build-path') + 1];
      for (const suffix of ['bin', 'partitions.bin', 'elf']) await writeFile(join(path, `sketch.ino.${suffix}`), suffix);
      return ok();
    }
    if (uploadMode === 'busy') {
      command.output('stderr', 'could not open selected port: Access is denied\n');
      return ok('', 'could not open selected port: Access is denied\n', 2);
    }
    return ok('Upload command finished without verification');
  });
  const build = (await (await post(request, '/builds', buildBody)).json()).job;
  await wait(request, build.id);
  const startUpload = async () => {
    const response = await post(request, '/uploads', { buildId: build.id, portId: 'COM_TEST' });
    assert.equal(response.status, 202);
    return wait(request, (await response.json()).job.id);
  };
  const failed = await startUpload();
  assert.equal(failed.job.state, 'failed'); assert.equal(failed.job.error.code, 'UPLOAD_FAILED');
  assert.match(failed.job.error.message, /Access is denied/);
  uploadMode = 'unverified';
  const unverified = await startUpload();
  assert.equal(unverified.job.state, 'failed'); assert.equal(unverified.job.error.code, 'UPLOAD_FAILED');
  await writeFile(join(profile.platformPath, 'platform.txt'), 'changed core recipe');
  await error(await post(request, '/uploads', { buildId: build.id, portId: 'COM_TEST' }), 409, 'BUILD_NOT_READY');
});

test('configured core data remains read-only and one missing core does not disable an installed profile', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cfzn-tool-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDataDir = join(root, 'installed');
  const core = join(sourceDataDir, 'packages', 'esp32', 'hardware', 'esp32', '1.0.6');
  await mkdir(core, { recursive: true });
  await writeFile(join(core, 'boards.txt'), 'esp32.name=ESP32\n');
  await writeFile(join(core, 'platform.txt'), 'name=fixture-core\n');
  await writeFile(join(sourceDataDir, 'package_esp32_index.json'), '{"packages":[]}');
  const config = { runtimeDir: join(root, 'cfzn'), allowedOrigins: [],
    toolchains: { local: { cliPath: process.execPath, sourceDataDir, packages: ['esp32'] } },
    profiles: { 'esp32-4mb-dio': { toolchain: 'local', coreVersion: '1.0.6' },
      'esp32s3-default': { toolchain: 'local', coreVersion: 'not-installed' } } };
  const calls = [];
  const discovery = await discoverProfiles(config, async (command) => {
    calls.push(command);
    if (command.args[0] === 'version') return ok('fixture CLI');
    const cliConfig = JSON.parse(await readFile(command.args[command.args.indexOf('--config-file') + 1], 'utf8'));
    assert.ok(cliConfig.directories.data.startsWith(config.runtimeDir));
    assert.ok(cliConfig.directories.user.startsWith(config.runtimeDir));
    assert.equal(await readFile(join(cliConfig.directories.data, 'packages', 'esp32', 'hardware', 'esp32', '1.0.6', 'platform.txt'), 'utf8'), 'name=fixture-core\n');
    return ok('{}');
  });
  assert.equal(discovery.views.find((view) => view.id === 'esp32-4mb-dio').compileAvailable, true);
  assert.equal(discovery.views.find((view) => view.id === 'esp32s3-default').compileAvailable, false);
  assert.equal(calls.length, 2);
  assert.equal(await readFile(join(core, 'platform.txt'), 'utf8'), 'name=fixture-core\n');
  assert.equal(await readFile(join(sourceDataDir, 'package_esp32_index.json'), 'utf8'), '{"packages":[]}');
});

test('real spawn keeps shell syntax inert and task cancellation/timeout closes owned children', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cfzn-process-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const literal = 'COM_TEST & echo SHOULD_NOT_RUN $(pwd)';
  const quoted = await runCommand({ executable: process.execPath, args: ['-e', 'process.stdout.write(process.argv[1])', literal], cwd: directory, timeoutMs: 5000 });
  assert.equal(quoted.code, 0); assert.equal(quoted.stdout, literal);
  const abort = new AbortController();
  let childPid;
  const command = runCommand({ executable: process.execPath,
    args: ['-e', 'const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"inherit"}); console.log(child.pid); setInterval(()=>{},1000);'],
    cwd: directory, timeoutMs: 5000, signal: abort.signal,
    output: (stream, text) => { if (stream === 'stdout' && text.trim()) { childPid = Number(text.trim()); abort.abort(); } } });
  const result = await command;
  assert.equal(result.cancelled, true); assert.notEqual(result.code, 0);
  assert.ok(childPid > 0);
  assert.throws(() => process.kill(childPid, 0), /ESRCH/);
  const timeout = await runCommand({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 });
  assert.equal(timeout.timedOut, true); assert.notEqual(timeout.code, 0);
});

test('unconfigured deployment starts with five truthful unavailable profiles', async (t) => {
  const runtimeDir = await mkdtemp(join(tmpdir(), 'cfzn-unconfigured-'));
  const config = await loadHardwareConfig({ HARDWARE_RUNTIME_DIR: runtimeDir }, join(runtimeDir, 'missing.json'));
  const app = await createHardwareApp(config);
  t.after(async () => { await app.close(); await rm(runtimeDir, { recursive: true, force: true }); });
  await app.listen(0, '127.0.0.1');
  const capabilities = await (await fetch(`${await app.getUrl()}/api/v1/hardware/capabilities`)).json();
  assert.equal(capabilities.toolchain.cliVersion, null);
  assert.equal(capabilities.profiles.length, 5);
  assert.ok(capabilities.profiles.every((profile) => !profile.compileAvailable && !profile.uploadAvailable && profile.reason));
});
