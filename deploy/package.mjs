import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { precompressWeb, precompressFastGui } from './precompress.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const ideAuth = process.env.VITE_IDE_AUTH === 'true';
const revision = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const release = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') + '-' + revision;
const output = resolve(root, 'build/deploy', release);
const stage = join(output, 'bundle');
await mkdir(join(stage, 'api'), { recursive: true });
for (const file of ['main.js', 'app.js', 'common/controller-catalog.json']) {
  await stat(resolve(root, 'apps/api/dist', file));
}
for (const file of ['index.html', 'openblock.html', 'openblock-vendor/openblock-gui.js', 'cfzn-extensions/module-loader.js']) {
  await stat(resolve(root, 'apps/web/dist', file));
}
if (ideAuth) {
  for (const file of ['login.html', 'sso.html']) await stat(resolve(root, 'apps/web/dist', file));
}
await cp(resolve(root, 'apps/web/dist'), join(stage, 'web'), { recursive: true, preserveTimestamps: true });
const compression = await precompressWeb(join(stage, 'web'));
compression.fastGui = await precompressFastGui(join(stage, 'web'));
await writeFile(join(stage, 'compression.json'), JSON.stringify(compression, null, 2) + '\n');
await cp(resolve(root, 'apps/api/dist'), join(stage, 'api/dist'), { recursive: true });
for (const file of ['package.json', 'package-lock.json']) {
  await cp(resolve(root, 'apps/api', file), join(stage, 'api', file));
}
await cp(resolve(root, 'deploy/install-server.sh'), join(output, 'install-server.sh'));
await cp(resolve(root, 'deploy/run-server.sh'), join(output, 'run-server.sh'));
const changes = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
await writeFile(join(stage, 'release.json'), JSON.stringify({
  release, revision, builtAt: new Date().toISOString(), workingTreeDirty: Boolean(changes.trim()),
  domain: 'ide.xiaodaiyang.top', ideAuth,
}, null, 2) + '\n');
const archive = join(output, 'cfzn-ide.tar.gz');
execFileSync('tar', ['-czf', archive, '-C', stage, 'web', 'api', 'release.json', 'compression.json']);
const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
const manifest = { release, archive, installer: join(output, 'install-server.sh'), sha256, ideAuth };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify(manifest) + '\n');
