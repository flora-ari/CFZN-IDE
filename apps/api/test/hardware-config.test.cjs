const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } = fs;
const { tmpdir } = require('node:os');
const { dirname, join, relative } = require('node:path');
const { test } = require('node:test');
const { loadHardwareConfig } = require('../dist/hardware/config.js');

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, 'cfzn-hardware-config-'));
  t.after(async () => {
    assert.equal(dirname(await realpath(root)), parent);
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('loads the default hardware file and preserves explicit-file and environment precedence', async (t) => {
  const root = await fixture(t);
  const defaultPath = join(root, 'hardware.local.json');
  const explicitPath = join(root, 'explicit.json');
  const definition = {
    runtimeDir: join(root, 'generated'),
    allowedOrigins: ['https://file.example'],
    toolchains: { fixture: { cliPath: process.execPath, sourceDataDir: join(root, 'installed'), packages: ['esp32'] } },
    profiles: { 'firebeetle-esp32e-4mb': {
      toolchain: 'fixture', coreVersion: '2.0.17', fqbn: 'esp32:esp32:dfrobot_firebeetle2_esp32e',
    } },
  };
  await writeFile(defaultPath, JSON.stringify(definition));
  assert.deepEqual(await loadHardwareConfig({}, defaultPath), definition);

  const runtimeDir = join(root, 'override');
  const overridden = await loadHardwareConfig({
    HARDWARE_RUNTIME_DIR: runtimeDir,
    HARDWARE_ALLOWED_ORIGINS: ' https://env.example, ,http://localhost:5173 ',
  }, defaultPath);
  assert.deepEqual(overridden, { ...definition, runtimeDir, allowedOrigins: ['https://env.example', 'http://localhost:5173'] });

  await writeFile(explicitPath, '{}');
  await writeFile(defaultPath, 'invalid default JSON');
  const config = await loadHardwareConfig({
    HARDWARE_CONFIG: relative(process.cwd(), explicitPath), HARDWARE_RUNTIME_DIR: runtimeDir,
  }, defaultPath);
  assert.deepEqual(config, { runtimeDir, toolchains: {}, profiles: {}, allowedOrigins: [] });
});

test('only a missing default file falls back to empty hardware configuration', async (t) => {
  const root = await fixture(t);
  const missing = join(root, 'missing.json');
  const defaultPath = join(root, 'hardware.local.json');
  const env = { HARDWARE_RUNTIME_DIR: join(root, 'generated') };
  assert.deepEqual(await loadHardwareConfig(env, missing), {
    runtimeDir: env.HARDWARE_RUNTIME_DIR, toolchains: {}, profiles: {}, allowedOrigins: [],
  });
  await writeFile(defaultPath, '{}');
  await assert.rejects(loadHardwareConfig({ ...env, HARDWARE_CONFIG: missing }, defaultPath), (error) => {
    assert.ok(error.message.includes(missing));
    assert.equal(error.cause.code, 'ENOENT');
    return true;
  });
});

test('reports the selected file for malformed JSON, nonobjects and invalid hardware fields', async (t) => {
  const root = await fixture(t);
  const selected = join(root, 'selected.json');
  const fallback = join(root, 'fallback.json');
  await writeFile(fallback, '{}');
  const invalid = [
    '{', 'null', '[]', '"configuration"', 'false', '1',
    JSON.stringify({ runtimeDir: {} }),
    JSON.stringify({ toolchains: { invalid: { cliPath: 'relative', sourceDataDir: root, packages: ['esp32'] } } }),
    JSON.stringify({ profiles: { 'esp32-4mb-dio': { toolchain: 'missing', coreVersion: '1.0.6' } } }),
    JSON.stringify({ allowedOrigins: ['https://invalid.example/path'] }),
  ];
  for (const contents of invalid) {
    await writeFile(selected, contents);
    for (const [env, defaultPath] of [[{}, selected], [{ HARDWARE_CONFIG: selected }, fallback]]) {
      await assert.rejects(loadHardwareConfig(env, defaultPath), (error) => {
        assert.ok(error.message.includes(selected));
        assert.ok(error.cause instanceof Error);
        return true;
      });
    }
  }
});

test('reports permission and directory errors without using empty configuration', async (t) => {
  const root = await fixture(t);
  const selected = join(root, 'denied.json');
  await writeFile(selected, '{}');
  const denied = Object.assign(new Error('fixture permission denied'), { code: 'EACCES' });
  t.mock.method(fs, 'readFile', async (path, ...args) => {
    if (path === selected) throw denied;
    return readFile(path, ...args);
  });
  for (const env of [{}, { HARDWARE_CONFIG: selected }]) {
    await assert.rejects(loadHardwareConfig(env, selected), (error) => {
      assert.ok(error.message.includes(selected));
      assert.match(error.message, /fixture permission denied/);
      assert.equal(error.cause, denied);
      return true;
    });
  }
  await assert.rejects(loadHardwareConfig({}, root), (error) => {
    assert.ok(error.message.includes(root));
    assert.ok(['EISDIR', 'EPERM', 'EACCES'].includes(error.cause.code));
    return true;
  });
});

test('finds the project default in source and dist layouts independently of cwd and runtime override', async (t) => {
  const root = await fixture(t);
  const project = join(root, 'project');
  const api = join(project, 'apps', 'api');
  const configDir = join(project, '.runtime', 'hardware');
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, 'hardware.local.json'), JSON.stringify({ allowedOrigins: ['https://module.example'] }));
  const runtimeDir = join(root, 'other-runtime');
  for (const layout of ['src', 'dist']) {
    const moduleDir = join(api, layout, 'hardware');
    await mkdir(moduleDir, { recursive: true });
    const configModule = join(moduleDir, 'config.js');
    await copyFile(require.resolve('../dist/hardware/config.js'), configModule);
    const script = `require(process.argv[1]).loadHardwareConfig({ HARDWARE_RUNTIME_DIR: process.argv[2] })
      .then(config => process.stdout.write(JSON.stringify(config)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });`;
    for (const cwd of [project, api]) {
      const result = spawnSync(process.execPath, ['-e', script, configModule, runtimeDir], { cwd, encoding: 'utf8' });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        runtimeDir, toolchains: {}, profiles: {}, allowedOrigins: ['https://module.example'],
      });
    }
  }
});
