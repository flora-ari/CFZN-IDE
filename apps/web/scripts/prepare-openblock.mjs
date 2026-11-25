import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleSource, patchOpenBlock } from './openblock-hooks.mjs';
import { prepareDeviceDescriptions } from './prepare-device-descriptions.mjs';
import { optimizeGui, guiOptimizerInputs } from './optimize-gui.mjs';
import { fastGuiUrl } from './fast-gui-html.mjs';

const runtime = fileURLToPath(new URL('../../../.runtime/', import.meta.url));
const archiveDir = join(runtime, 'upstream');
const output = join(runtime, 'web-openblock');
const frontend = fileURLToPath(new URL('../', import.meta.url));
const vendorSource = join(frontend, 'vendor');
const publicSource = join(frontend, 'public');
const builtinModuleIds = ['activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments'];
const builtinModuleKinds = ['blocks', 'generator', 'toolbox', 'translations'];
const requiredOutputs = [
  'openblock-vendor/openblock-gui.js',
  'branding/IDE.png',
  'branding/ccraft-logo.png',
  'branding/ccraft-icon.svg',
  'branding/ccraft-tab-icon.png',
  'cfzn-extensions/module-loader.js',
  ...builtinModuleIds.flatMap((id) => builtinModuleKinds.map((kind) => `cfzn-extensions/extensions/${id}/${kind}.mjs`)),
];
async function fingerprint(directory, hash = createHash('sha256')) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(entry.name);
    if (entry.isDirectory()) await fingerprint(join(directory, entry.name), hash);
    else hash.update(await readFile(join(directory, entry.name)));
  }
  return hash;
}
const inputs = await fingerprint(vendorSource);
await fingerprint(publicSource, inputs);
inputs.update(await readFile(new URL('./openblock-hooks.mjs', import.meta.url)));
inputs.update(await readFile(new URL('./audio-unlock-hook.mjs', import.meta.url)));
inputs.update(await readFile(new URL('./optimize-gui.mjs', import.meta.url)));
inputs.update(await readFile(new URL('./gui-lexical-whitespace.mjs', import.meta.url)));
inputs.update(await readFile(new URL('./fast-gui-html.mjs', import.meta.url)));
inputs.update(JSON.stringify(guiOptimizerInputs));
inputs.update(await readFile(new URL('./prepare-openblock.mjs', import.meta.url)));
inputs.update(await readFile(new URL('./prepare-device-descriptions.mjs', import.meta.url)));
const manifest = {
  layout: 3,
  integrationSha256: inputs.digest('hex'),
  upstreamCommit: 'cdd3478c3d9bbced4cb50f4ac0dda8593416c889',
  guiOptimizer: guiOptimizerInputs,
  packages: {
    'openblock-gui': {
      version: '0.1.0-prerelease.20250611102354',
      integrity: 'sha512-+9s1PVa8aDP4sEz2vc+uF9I7osEScBSb40pxm+nPbhO28FjNkmN1TGUBrgYK4t4MM6gdCT3jbX3HhcYp9YEz+A==',
    },
    react: {
      version: '16.14.0',
      integrity: 'sha512-0X2CImDkJGApiAlcf0ODKIneSwBPhqJawOa5wCtKbu7ZECrmS26NvtSILynQ66cgkT/RJ4LidJOc3bUESwmU8g==',
    },
    'react-dom': {
      version: '16.14.0',
      integrity: 'sha512-1gCeQXDLoIqMgqD3IO2Ah9bnf0w9kzhwN5q4FGnHZ67hBm9yePzB5JJAIQCc8x3pFnNlwFq4RidZggNAAkzWWw==',
    },
  },
};
const manifestPath = 'openblock-vendor/manifest.json';
const exists = async (path) => access(path).then(() => true, () => false);

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${executable} failed: ${result.error?.message ?? result.status}`);
  }
}

async function getArchive(name, entry) {
  const file = join(archiveDir, `${name}-${entry.version}.tgz`);
  if (!await exists(file)) {
    const args = ['pack', `${name}@${entry.version}`, '--ignore-scripts', '--pack-destination', archiveDir,
      '--cache', join(runtime, 'npm-cache'), '--loglevel', 'error'];
    if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, ...args]);
    else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { shell: process.platform === 'win32' });
  }
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (`sha512-${hash.digest('base64')}` !== entry.integrity) throw new Error(`npm integrity check failed for ${file}`);
  return file;
}

async function prepare() {
  if (await exists(join(output, manifestPath))) {
    try {
      const cached = JSON.parse(await readFile(join(output, manifestPath), 'utf8'));
      const { fastGui, ...cachedInputs } = cached;
      const fastPath = fastGuiUrl(cached).slice(1);
      if (JSON.stringify(cachedInputs) === JSON.stringify(manifest)
        && (await Promise.all([...requiredOutputs, fastPath].map(file => exists(join(output, file))))).every(Boolean)
        && createHash('sha256').update(await readFile(join(output, fastPath))).digest('hex') === fastGui.sha256
        && createHash('sha256').update(await readFile(join(output, 'openblock-vendor/openblock-gui.js'))).digest('hex') === fastGui.legacySha256) return;
    } catch { /* Missing/corrupt metadata or required output is regenerated. */ }
  }
  await mkdir(archiveDir, { recursive: true });
  const stage = await mkdtemp(join(runtime, 'web-openblock-build-'));
  try {
    const generated = join(stage, 'public');
    const vendor = join(generated, 'openblock-vendor');
    const staticDir = join(generated, 'static');
    await mkdir(vendor, { recursive: true });
    await mkdir(staticDir, { recursive: true });
    for (const [name, entry] of Object.entries(manifest.packages)) {
      const file = await getArchive(name, entry);
      const unpack = join(stage, name);
      await mkdir(unpack);
      const picks = name === 'openblock-gui'
        ? ['package/dist', 'package/static', 'package/LICENSE', 'package/LICENSE.MIT', 'package/TRADEMARK']
        : [`package/umd/${name}.production.min.js`, 'package/LICENSE'];
      run('tar', ['-xf', file, '-C', unpack, ...picks]);
      const pkg = join(unpack, 'package');
      if (name !== 'openblock-gui') {
        await cp(join(pkg, `umd/${name}.production.min.js`), join(vendor, `${name}-16.min.js`));
        await cp(join(pkg, 'LICENSE'), join(vendor, `LICENSE.${name}`));
        continue;
      }
      const dist = join(pkg, 'dist');
      await prepareDeviceDescriptions(await readFile(join(dist, 'openblock-gui.js.map'), 'utf8'), join(vendor, 'device-descriptions.json'));
      await cp(join(pkg, 'static'), staticDir, { recursive: true });
      await cp(join(dist, 'static'), staticDir, { recursive: true });
      for (const directory of ['chunks', 'libraries']) {
        await cp(join(dist, directory), join(staticDir, directory), { recursive: true });
      }
      for (const fileName of await readdir(dist)) {
        if (!fileName.endsWith('worker.js')) continue;
        await cp(join(dist, fileName), join(generated, fileName));
        await cp(join(dist, fileName), join(staticDir, fileName));
      }
      const legacy = patchOpenBlock(await readFile(join(dist, 'openblock-gui.js'), 'utf8'));
      const fast = await optimizeGui(legacy);
      manifest.fastGui = fast.metadata;
      await writeFile(join(vendor, 'openblock-gui.js'), legacy);
      await writeFile(join(generated, fast.metadata.url.slice(1)), fast.code);
      for (const fileName of ['LICENSE', 'LICENSE.MIT', 'TRADEMARK']) {
        await cp(join(pkg, fileName), join(vendor, fileName));
      }
    }
    const resources = join(generated, 'cfzn-extensions');
    await cp(publicSource, generated, { recursive: true });
    await cp(vendorSource, resources, { recursive: true });
    for (const id of builtinModuleIds) {
      for (const kind of builtinModuleKinds) {
        const directory = join(resources, 'extensions', id);
        await writeFile(join(directory, `${kind}.mjs`), moduleSource(await readFile(join(directory, `${kind}.js`), 'utf8'), kind));
      }
    }
    await writeFile(join(generated, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
    // Both paths are fixed children of this repository's runtime directory.
    if (!output.startsWith(runtime) || !stage.startsWith(runtime)) throw new Error('Unexpected preparation directory');
    await rm(output, { recursive: true, force: true });
    await rename(generated, output);
    console.log(`Prepared OpenBlock GUI ${manifest.packages['openblock-gui'].version}.`);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

await prepare();
