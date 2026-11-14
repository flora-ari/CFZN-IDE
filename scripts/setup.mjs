import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const directory of ['.', 'apps/api', 'apps/web']) {
  console.log(`\nInstalling ${directory}`);
  const result = spawnSync(npm, ['install', '--cache', path.join(root, '.runtime/npm-cache')], {
    cwd: path.join(root, directory), stdio: 'inherit', shell: process.platform === 'win32'
  });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || 'Dependency installation failed');
    process.exit(result.status || 1);
  }
}
