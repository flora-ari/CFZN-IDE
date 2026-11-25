import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { precompressWeb } from '../deploy/precompress.mjs';
import { writeFile } from 'node:fs/promises';
import { EditorBridge } from '../apps/web/src/editor-bridge.ts';
import { envelope } from '../apps/web/src/editor-protocol.ts';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'tests/evidence/startup-timeout-20261123');
const report = { cases: [], browserAndNetwork: 'Not executed. Actual UI and deployed HTTP negotiation are main coordinator coverage.' };
const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => readFile(join(root, path), 'utf8');
const html = await read('apps/web/dist/openblock.html');
const guiPath = join(root, 'apps/web/dist/openblock-vendor/openblock-gui.js');
const gui = await readFile(guiPath);
async function check(name, run) {
  const detail = await run();
  report.cases.push({ name, detail });
  console.log('PASS', name);
}
class Events {
  listeners = new Map();
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type, event) { for (const callback of [...this.listeners.get(type) ?? []]) callback(event); }
  count() { return [...this.listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0); }
}
await mkdir(out, { recursive: true });
try {
  await check('frozen entries, original PNG, protected VM/Blockly bytes and licenses', async () => {
    assert.ok(html.includes('editor-8a8g-MnV.js') && html.includes('editor-BGbwFYeN.css'));
    const appHtml = await read('apps/web/dist/index.html');
    assert.ok(appHtml.includes('app-C0XuQYw1.js') && appHtml.includes('app-C88jyimZ.css'));
    assert.equal(sha(gui), '78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5');
    const png = await readFile(join(root, 'apps/web/dist/branding/ccraft-logo.png'));
    assert.equal(sha(png), 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2');
    const tar = join(root, '.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz');
    const extract = path => execFileSync('tar', ['-xOf', tar, 'package/' + path], { maxBuffer: 100 * 1024 * 1024 });
    const original = extract('dist/openblock-gui.js').toString();
    const chunks = text => {
      const matches = [...text.matchAll(/^\/\* (\d+) \*\//gm)];
      return new Map(matches.map((match, index) => [match[1], text.slice(match.index, matches[index + 1]?.index)]));
    };
    const a = chunks(original), b = chunks(gui.toString());
    const reference = JSON.parse(await read('apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json'));
    for (const [group, count] of [['vm', 178], ['blockly', 15]]) {
      assert.equal(reference[group].length, count);
      for (const { id } of reference[group]) assert.equal(b.get(id), a.get(id), group + ' ' + id);
    }
    for (const name of ['LICENSE', 'LICENSE.MIT', 'TRADEMARK']) {
      assert.deepEqual(await readFile(join(root, 'apps/web/dist/openblock-vendor', name)), extract(name));
    }
    return { guiSha256: sha(gui), pngSha256: sha(png), protectedModules: { vm: 178, blockly: 15 } };
  });
  await check('final inline guard reports stylesheet and modulepreload failures and releases on pagehide', async () => {
    const inline = html.match(/<script id="editor-startup-observer">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(inline);
    assert.equal(inline, (await read('apps/web/openblock.html')).match(/<script id="editor-startup-observer">([\s\S]*?)<\/script>/)[1]);
    const dependencies = ['/openblock-vendor/react-16.min.js', '/openblock-vendor/react-dom-16.min.js',
      '/openblock-vendor/openblock-gui.js', '/cfzn-extensions/module-loader.js'];
    const positions = dependencies.map(path => html.indexOf('src="' + path));
    assert.ok(positions.every((position, index) => position > html.indexOf(inline) && (!index || position > positions[index - 1])));
    const checked = [];
    for (const rel of ['stylesheet', 'modulepreload']) {
      const events = new Events(), document = new Events(), messages = [];
      const element = { hidden: true, textContent: '' };
      const parent = { postMessage: (...args) => messages.push(args) };
      const window = Object.assign(events, { parent, location: { origin: 'http://isolated.invalid', href: 'http://isolated.invalid/openblock.html' } });
      document.getElementById = () => element;
      runInNewContext(inline, { window, document, URL, Error });
      events.emit('error', { target: { tagName: 'LINK', rel, href: 'http://isolated.invalid/assets/missing.js?private=excluded' } });
      assert.equal(messages.length, 1);
      assert.equal(messages[0][0].protocol, 'cfzn.openblock');
      assert.equal(messages[0][0].version, 1);
      assert.equal(messages[0][0].type, 'BOOT_ERROR');
      assert.match(messages[0][0].payload.message, /\/assets\/missing.js/);
      assert.doesNotMatch(messages[0][0].payload.message, /private|excluded/);
      assert.equal(element.hidden, false);
      events.emit('pagehide', {});
      assert.equal(events.count(), 0);
      assert.equal(document.count(), 0);
      checked.push(rel);
    }
    return { checked, criticalDependencyOrder: dependencies, noNetwork: true };
  });
  await check('180s cutoff still accepts authenticated late READY and ready workspaces never become retryable', async () => {
    const window = Object.assign(new Events(), { location: { origin: 'http://isolated.invalid' } });
    const timers = new Map();
    let next = 0;
    window.setTimeout = (callback, milliseconds) => { timers.set(++next, { callback, milliseconds }); return next; };
    window.clearTimeout = id => timers.delete(id);
    const frame = Object.assign(new Events(), { contentWindow: { postMessage() {} } });
    const states = [], boots = [];
    const previous = globalThis.window;
    globalThis.window = window;
    const bridge = new EditorBridge(frame, { onBootState: state => boots.push(state), onState: state => states.push(state),
      onReplace() {}, onImport() {}, onImportError() {}, onToolbarAction() {} });
    try {
      const timer = [...timers.values()].find(timer => timer.milliseconds === 180000);
      timer.callback();
      assert.equal(bridge.canRetryStartup, true);
      const data = envelope('READY', { title: 'User OpenBlock Project', editVersion: 0 });
      window.emit('message', { source: frame.contentWindow, origin: 'http://foreign.invalid', data });
      assert.equal(states.length, 0);
      window.emit('message', { source: frame.contentWindow, origin: window.location.origin, data });
      assert.equal(boots.at(-1).phase, 'ready');
      assert.equal(bridge.canRetryStartup, false);
      assert.equal(timers.size, 0);
      assert.equal(states[0].title, 'User OpenBlock Project');
      const app = await read('apps/web/src/App.tsx');
      assert.match(app, /if \(hasBeenReady.current \|\| snapshotRef.current \|\| !client\?\.canRetryStartup\) return;/);
      const receive = app.match(/function receive\(state: EditorSnapshot\) \{([\s\S]*?)\n  \}/)[1];
      assert.doesNotMatch(receive, /setNotice/);
      assert.match(app, /onBootState: \(state\) => \{ if \(state.phase === 'ready'\) hasBeenReady.current = true; setBoot\(state\); \}/);
      return { cutoff: 180000, lateReady: true, foreignIgnored: true, businessNoticeIndependent: true };
    } finally { bridge.dispose(); globalThis.window = previous; }
  });
  await check('actual GUI precompression roundtrips without changing source bytes or modification time', async () => {
    const parent = await realpath(tmpdir());
    const directory = await mkdtemp(join(parent, 'ccraft-independent-gzip-'));
    const originalStat = await stat(guiPath);
    try {
      const copy = join(directory, 'openblock-gui.js');
      await copyFile(guiPath, copy);
      const before = await stat(copy);
      const totals = await precompressWeb(directory);
      const compressed = await readFile(copy + '.gz');
      assert.equal(totals.files, 1);
      assert.deepEqual(gunzipSync(compressed), gui);
      assert.deepEqual(await readFile(copy), gui);
      assert.equal((await stat(copy)).mtimeMs, before.mtimeMs);
      assert.ok(Math.abs((await stat(copy + '.gz')).mtimeMs - before.mtimeMs) < 1);
      assert.equal((await stat(guiPath)).mtimeMs, originalStat.mtimeMs);
      assert.deepEqual(await readFile(guiPath), gui);
      return { originalBytes: gui.length, gzipBytes: compressed.length, ratio: compressed.length / gui.length,
        sha256: sha(gui), originalMtimePreserved: true, copiedMtimePreserved: true };
    } finally {
      assert.equal(dirname(await realpath(directory)), parent);
      await rm(directory, { recursive: true, force: true });
    }
  });
  await check('IDE gzip negotiation and stable URL caching are configured independently of API compression', async () => {
    const installer = await read('deploy/install-server.sh');
    const api = installer.match(/location \/api\/ \{([\s\S]*?)\n    \}/)[1];
    assert.match(api, /gzip off;/);
    assert.match(api, /gzip_static_setting off/);
    for (const directive of ['gzip on;', 'gzip_vary on;', 'etag on;',
      'add_header X-Content-Type-Options nosniff always;', 'add_header Referrer-Policy strict-origin-when-cross-origin always;',
      'add_header Permissions-Policy "serial=(self), usb=(self)" always;']) assert.ok(installer.includes(directive));
    assert.match(installer, /location \/assets\/ \{[^\n]+expires 1y;/);
    assert.match(installer, /location \/ \{[^\n]+expires -1;/);
    assert.match(installer, /application\/javascript mjs;[^\n]+expires -1;/);
    const functionSource = installer.match(/gzip_static_setting\(\) \{[\s\S]*?\n\}/)[0];
    const git = execFileSync('where.exe', ['git.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    const bash = join(dirname(dirname(git)), 'bin/bash.exe');
    const evidence = [];
    for (const [module, expected] of [['--with-http_gzip_static_module', 'gzip_static on;\ngzip_static off;'], ['--with-http_ssl_module', '']]) {
      const result = spawnSync(bash, ['--noprofile', '--norc', '-c',
        functionSource + '\nnginx() { echo "configure arguments: ' + module + '" >&2; }\ngzip_static_setting on\ngzip_static_setting off'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected);
      evidence.push({ module, configuration: result.stdout.trim() });
    }
    return { gzipModuleSimulation: evidence, actualHttpHeadersAnd304: 'main coordinator verification required' };
  });
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(join(out, 'independent-checks.json'), JSON.stringify(report, null, 2));
}
