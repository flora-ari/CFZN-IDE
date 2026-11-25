import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { brandMessages, DEFAULT_PROJECT_TITLE } from '../apps/web/src/branding.ts';
import { patchOpenBlock } from '../apps/web/scripts/openblock-hooks.mjs';
import { addEditorMetadata, readEditorMetadata } from '../apps/web/src/editor-archive.ts';
import { ARCHIVE_MIME, PROTOCOL, archiveName } from '../apps/web/src/editor-protocol.ts';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'apps/web/dist');
const out = join(root, 'tests/evidence/ccraft-branding-20261123');
const require = createRequire(import.meta.url);
const { zipSync, unzipSync, strToU8, strFromU8 } = require('../apps/web/node_modules/fflate');
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { cases: [], browserCoverage: 'provided separately by main coordinator' };
const filesOnly = process.env.CCRAFT_FILE_ONLY === '1';
const read = file => readFile(join(root, file), 'utf8');
let api, temp;
const tempRoot = await realpath(tmpdir());
async function check(name, run) {
  const detail = await run();
  report.cases.push({ name, detail });
  console.log('PASS', name);
}
await mkdir(out, { recursive: true });
try {
  const tgz = join(root, '.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz');
  const extract = filename => execFileSync('tar', ['-xOf', tgz, 'package/' + filename], { maxBuffer: 100 * 1024 * 1024 });
  const upstream = extract('dist/openblock-gui.js').toString();
  const gui = await read('apps/web/dist/openblock-vendor/openblock-gui.js');
  await check('frozen HTML, parent and editor entries and local visual resources', async () => {
    const editorHtml = await read('apps/web/dist/openblock.html');
    const appHtml = await read('apps/web/dist/index.html');
    assert.match(appHtml, /<title>CCraft<\/title>/);
    assert.match(editorHtml, /<title>CCraft 编辑器<\/title>/);
    assert.match(editorHtml, /正在启动 CCraft 编辑器…/);
    const editorEntry = editorHtml.match(/assets\/(editor-[\w-]+\.js)/)?.[1];
    const appEntry = appHtml.match(/assets\/(app-[\w-]+\.js)/)?.[1];
    assert.ok(editorEntry && appEntry);
    for (const html of [appHtml, editorHtml]) assert.match(html, /href="\/branding\/ccraft-icon.svg"/);
    const editor = await read('apps/web/dist/assets/' + editorEntry);
    const app = await read('apps/web/dist/assets/' + appEntry);
    for (const text of ['CCraft 启动失败：', '无法读取 CCraft 项目：', 'CCraft-恢复备份.ob', 'CCraft作品', 'CCraft Project']) {
      assert.ok(editor.includes(text), 'missing editor text ' + text);
    }
    for (const text of ['CCraft 编辑器', 'CCraft 编辑器启动超时，请刷新页面。', 'CCraft 编辑器尚未就绪。', 'CCraft 编辑器已关闭。']) {
      assert.ok(app.includes(text), 'missing parent text ' + text);
    }
    const assets = [];
    for (const name of ['ccraft-icon.svg', 'ccraft-logo.png']) {
      const paths = ['apps/web/public/branding/', '.runtime/web-openblock/branding/', 'apps/web/dist/branding/'];
      const copies = await Promise.all(paths.map(path => readFile(join(root, path, name))));
      for (const copy of copies) assert.deepEqual(copy, copies[0]);
      assets.push({ name, sha256: sha(copies[0]) });
      if (name === 'ccraft-logo.png') {
        assert.equal(copies[0].length, 495240);
        assert.equal(copies[0].readUInt32BE(16), 1448);
        assert.equal(copies[0].readUInt32BE(20), 1086);
        assert.equal(sha(copies[0]), 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2');
      }
    }
    assert.ok(gui.includes('"/branding/ccraft-logo.png"'));
    assert.ok(editor.includes('/branding/ccraft-icon.svg'));
    const normal = gui.match(/src: (window.CFZNOpenBlock \? "\/branding\/ccraft-logo.png" : this.state.isOverflow \? this.props.logoSmall : this.props.logo),/);
    assert.ok(normal);
    const resolveLogo = new Function('window', 'return ' + normal[1] + ';');
    for (const isOverflow of [false, true]) {
      assert.equal(resolveLogo.call({ state: { isOverflow }, props: { logo: 'upstream', logoSmall: 'upstream-small' } },
        { CFZNOpenBlock: {} }), '/branding/ccraft-logo.png');
    }
    assert.match(gui, /alt: window.CFZNOpenBlock \? "CCraft" : "OpenBlock",\n      "data-cfzn-brand-logo": window.CFZNOpenBlock \? true : undefined,\n      src: window.CFZNOpenBlock \? "\/branding\/ccraft-logo.png" : openblock_logo_default.a/);
    const cssEntry = editorHtml.match(/assets\/(editor-[\w-]+\.css)/)?.[1];
    const css = await read('apps/web/dist/assets/' + cssEntry);
    assert.match(css, /object-fit:cover/);
    assert.match(css, /object-position:50% 53%/);
    return { editorEntry, appEntry, cssEntry, editorSha256: sha(editor), appSha256: sha(app), assets,
      logoRendering: { normal: 'user PNG', overflow: 'user PNG', fullscreen: 'user PNG', objectFit: 'cover', objectPosition: '50% 53%', geometryVerified: false } };
  });
  await check('shipped GUI matches audited GUI-only hooks and protected modules and original licenses', async () => {
    assert.equal(gui, patchOpenBlock(upstream));
    assert.ok(gui.includes('"/branding/ccraft-logo.png"'));
    const hooks = await read('apps/web/scripts/openblock-hooks.mjs');
    const locations = [...hooks.matchAll(/source: '([^']+)'/g)].map(match => match[1]);
    assert.ok(locations.every(location => location.startsWith('src/')));
    const manifest = JSON.parse(await read('apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json'));
    const slices = text => {
      const matches = [...text.matchAll(/^\/\* (\d+) \*\//gm)];
      return new Map(matches.map((match, i) => [match[1], text.slice(match.index, matches[i + 1]?.index)]));
    };
    const originalModules = slices(upstream), shippedModules = slices(gui);
    for (const [group, count] of [['vm', 178], ['blockly', 15]]) {
      assert.equal(manifest[group].length, count);
      for (const { id } of manifest[group]) assert.equal(shippedModules.get(id), originalModules.get(id), group + ' ' + id);
    }
    const licenses = [];
    for (const name of ['LICENSE', 'LICENSE.MIT', 'TRADEMARK']) {
      const original = extract(name);
      assert.deepEqual(await readFile(join(dist, 'openblock-vendor', name)), original);
      licenses.push({ name, sha256: sha(original) });
    }
    return { guiSha256: sha(gui), hookCount: locations.length, modules: { vm: 178, blockly: 15 }, licenses };
  });
  await check('runtime message cache, locale fallback and shipped Website handler preserve user text and current page', async () => {
    const messages = Object.freeze({ 'user.literal': 'OpenBlock in user data', [DEFAULT_PROJECT_TITLE]: 'OpenBlock legacy default' });
    const locales = [['zh_CN', 'CCraft作品', '官网'], ['zh-Hant', 'CCraft作品', '官網'],
      ['zh-HK', 'CCraft作品', '官網'], ['en_US', 'CCraft Project', 'Website']];
    for (const [locale, title, website] of locales) {
      const result = brandMessages(messages, locale);
      assert.equal(result[DEFAULT_PROJECT_TITLE], title);
      assert.equal(result['gui.menuBar.wiki'], website);
      assert.equal(result['user.literal'], messages['user.literal']);
      assert.equal(brandMessages(messages, locale), result);
      assert.ok(Object.isFrozen(result));
    }
    assert.notEqual(brandMessages(messages, 'en'), brandMessages(messages, 'zh-cn'));
    assert.notEqual(brandMessages({}, 'en'), brandMessages(messages, 'en'));
    assert.equal(brandMessages({ 'gui.menuBar.wiki': 'old cached Wiki' }, 'en')['gui.menuBar.wiki'], 'Website');
    assert.equal(brandMessages(undefined, 'unknown')['gui.menuBar.wiki'], 'Website');
    assert.match(brandMessages(undefined, 'en')['gui.alerts.lostPeripheralConnection'], /\{extensionName\}/);
    const handler = gui.match(/value: function handleClickOpenWiki\(\) \{([\s\S]*?)\n    \}/);
    assert.ok(handler);
    const calls = [];
    const currentPage = { href: 'http://isolated.invalid/openblock.html', title: 'My OpenBlock Project', dirty: true };
    const before = structuredClone(currentPage);
    new Function('window', handler[1])({ location: currentPage, open: (...args) => calls.push(args) });
    assert.deepEqual(calls, [['https://maker.xiaodaiyang.top/', '_blank', 'noopener,noreferrer']]);
    assert.deepEqual(currentPage, before);
    return { locales, website: calls[0], currentPage: 'unchanged in handler simulation' };
  });
  if (!filesOnly) await check('real isolated project API preserves existing OpenBlock name, strings, manual code and asset bytes', async () => {
    assert.equal(PROTOCOL, 'cfzn.openblock');
    assert.equal(ARCHIVE_MIME, 'application/x.openblock.ob');
    const title = '我的 OpenBlock 旧作品';
    assert.equal(archiveName(title), title + '.ob');
    assert.equal(archiveName(' . '), 'CCraft.ob');
    const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg"><text>OpenBlock asset</text></svg>');
    const project = { targets: [{ isStage: true, name: 'Stage', variables: { brand: ['OpenBlock user string', 'OpenBlock'] },
      blocks: {}, costumes: [{ name: 'OpenBlock costume', assetId: 'brandingfixture', dataFormat: 'svg', md5ext: 'brandingfixture.svg' }], sounds: [] }],
      meta: { semver: '3.0.0', vm: 'openblock' }, extensions: [] };
    const metadata = { version: 1, codeMode: 'manual', manualSource: '// generated by OpenBlock\n// user OpenBlock comment\nconst char *brand = "OpenBlock";' };
    const fixture = zipSync({ 'project.json': strToU8(JSON.stringify(project)), 'brandingfixture.svg': svg });
    const blob = await addEditorMetadata(Promise.resolve(new Blob([fixture])), metadata);
    assert.equal(blob.type, ARCHIVE_MIME);
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.deepEqual(readEditorMetadata(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), metadata);
    temp = await mkdtemp(join(tempRoot, 'cfzn-ccraft-brand-'));
    api = await require('../apps/api/dist/app.js').createApp(temp);
    await api.listen(0, '127.0.0.1');
    const origin = await api.getUrl();
    const form = new FormData();
    form.set('name', title);
    form.set('file', new Blob([bytes], { type: ARCHIVE_MIME }), 'old.sb3');
    const saved = await fetch(origin + '/api/v1/projects', { method: 'POST', body: form });
    assert.equal(saved.status, 201);
    assert.equal(saved.headers.get('etag'), '"1"');
    const { project: record } = await saved.json();
    assert.equal(record.name, title);
    assert.equal(record.format, 'openblock');
    const downloaded = await fetch(origin + '/api/v1/projects/' + record.id + '/content', { headers: { 'If-Match': '"1"' } });
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('etag'), '"1"');
    assert.match(downloaded.headers.get('content-type'), /^application\/x\.openblock\.ob/);
    const restored = Buffer.from(await downloaded.arrayBuffer());
    assert.deepEqual(restored, bytes);
    const files = unzipSync(restored);
    assert.deepEqual(JSON.parse(strFromU8(files['project.json'])), project);
    assert.deepEqual(files['brandingfixture.svg'], svg);
    assert.deepEqual(JSON.parse(strFromU8(files['cfzn/editor.json'])), metadata);
    return { name: record.name, format: record.format, bytes: restored.length, sha256: sha(restored), manualAndAssetPreserved: true };
  });
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  api?.getHttpServer().closeAllConnections();
  await api?.close();
  if (temp) {
    assert.equal(dirname(await realpath(temp)), tempRoot);
    await rm(temp, { recursive: true, force: true });
  }
  report.cleaned = true;
  await writeFile(join(out, filesOnly ? 'final-file-checks.json' : 'independent-checks.json'), JSON.stringify(report, null, 2));
}
