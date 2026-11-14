// Independent native-toolbar acceptance. Uses only this run's HTTP servers/storage/browser.
// Run: node tests/native-project-toolbar.mjs
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'apps/web/dist');
const placementOnly = process.argv.includes('--placement');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceRoot = resolve(root, placementOnly ? 'tests/evidence/native-menu-toolbar' : 'tests/evidence/native-project-toolbar');
const out = join(evidenceRoot, runId); await mkdir(out, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'cfzn-native-toolbar-test-'));
const { createApp } = require('../apps/api/dist/app.js');
const api = await createApp(temporary); await api.listen(0, '127.0.0.1');
const apiOrigin = await api.getUrl();
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  const file = resolve(dist, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
  if (!file.startsWith(dist + sep)) { res.writeHead(404); res.end(); return; }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' };
  res.setHeader('content-type', types[extname(file)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store');
  const stream = createReadStream(file); stream.on('error', () => { if (!res.headersSent) res.writeHead(404); res.end(); }); stream.pipe(res);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CFZN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const contexts = [], results = [], calls = [], errors = [], builds = new Set();
const saveRecheck = process.env.CFZN_NATIVE_SAVE_RECHECK === '1';
const onlyCase = process.env.CFZN_NATIVE_CASE && new RegExp(process.env.CFZN_NATIVE_CASE, 'i');
let mode = 'normal', held, arrived, activePage, projectId, exported, serialEvidence;
const sha = b => createHash('sha256').update(b).digest('hex');
const writes = () => calls.filter(c => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method)).length;
const dump = (name, data) => writeFile(join(out, name), JSON.stringify(data, null, 2));
const t = (s, id) => s.f.getByTestId(id);
async function check(name, fn) {
  if (placementOnly) { if (!name.startsWith('MenuBar') || (onlyCase && !onlyCase.test(name))) return; }
  else {
    if (saveRecheck && !/native POST|delayed save|save failure|real 412/.test(name)) return;
    if (onlyCase && !onlyCase.test(name)) return;
  }
  const started = Date.now();
  try { const detail = await fn(); results.push({ name, status: 'PASS', ms: Date.now() - started, detail }); console.log('PASS', name); }
  catch (e) { results.push({ name, status: 'FAIL', ms: Date.now() - started, error: String(e), stack: e.stack }); console.log('FAIL', name, String(e));
    await activePage?.screenshot({ path: join(out, `failure-${results.length}.png`) }).catch(() => {}); }
  await dump('results.json', results);
}
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([80, 75, 5, 6])); assert.ok(end >= 0);
  let c = buffer.readUInt32LE(end + 16); const files = {};
  while (buffer.readUInt32LE(c) === 0x02014b50) {
    const length = buffer.readUInt16LE(c + 28), size = buffer.readUInt32LE(c + 20), offset = buffer.readUInt32LE(c + 42);
    const name = buffer.subarray(c + 46, c + 46 + length).toString();
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const bytes = buffer.subarray(start, start + size);
    files[name] = buffer.readUInt16LE(c + 10) === 8 ? inflateRawSync(bytes) : bytes;
    c += 46 + length + buffer.readUInt16LE(c + 30) + buffer.readUInt16LE(c + 32);
  }
  return files;
}
function semantic(bytes) {
  const files = unzip(bytes), p = JSON.parse(files['project.json']), media = {};
  for (const [i, target] of p.targets.entries()) for (const kind of ['costumes', 'sounds']) for (const [j, asset] of (target[kind] || []).entries()) {
    const ref = asset.md5ext || `${asset.assetId}.${asset.dataFormat}`; assert.ok(files[ref], `missing ${ref}`);
    media[`${target.isStage ? 'stage' : 'sprite'}:${target.name}#${i}/${kind}:${asset.name}#${j}`] = sha(files[ref]);
  }
  return { device: p.device, programMode: p.programMode, extensions: p.extensions, deviceExtensions: p.deviceExtensions,
    targets: p.targets.map(v => ({ name: v.name, blocks: v.blocks })), media };
}
async function create(label) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); contexts.push(c);
  await c.addInitScript(() => {
    window.__serialRequests = [];
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      requestPort() { __serialRequests.push({ isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive }); return Promise.reject(new DOMException('Test canceled chooser', 'NotFoundError')); },
      addEventListener() {}, removeEventListener() {},
    } });
  });
  await c.route('**/api/**', async route => {
    const req = route.request(), u = new URL(req.url());
    const row = { label, method: req.method(), path: u.pathname, headers: req.headers(), body: req.postDataBuffer() }; calls.push(row);
    if (req.method() === 'PUT' && mode === 'failure') {
      row.status = 500; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'STORAGE_ERROR', message: 'Independent injected write failure' } }) }); return;
    }
    if (req.method() === 'PUT' && mode === 'delay') { arrived(); await held; }
    const response = await route.fetch({ url: `${apiOrigin}${u.pathname}${u.search}` }); row.status = response.status();
    await route.fulfill({ response });
  });
  const p = await c.newPage(); activePage = p;
  p.on('pageerror', e => errors.push({ label, error: String(e) }));
  p.on('request', r => { if (/\/assets\/editor-[^/]+\.js/.test(r.url())) builds.add(new URL(r.url()).pathname); });
  await p.goto(origin); const f = await (await p.getByTestId('openblock-frame').elementHandle()).contentFrame();
  await f.getByTestId('save-project').waitFor(); await f.waitForFunction(() => !document.querySelector('[data-testid="save-project"]').disabled);
  await f.evaluate(() => {
    window.__toolbarViews = [];
    addEventListener('message', e => { if (e.source === parent && e.data?.type === 'PROJECT_TOOLBAR_STATE') __toolbarViews.push(e.data.payload); });
  });
  return { c, p, f, label };
}
async function bridge(s, type, payload) {
  return s.p.evaluate(({ type, payload }) => new Promise((ok, fail) => {
    const f = document.querySelector('iframe'), requestId = `toolbar-${Math.random()}`;
    const timer = setTimeout(() => { removeEventListener('message', listener); fail(new Error('bridge timeout')); }, 45000);
    function listener(e) { if (e.source !== f.contentWindow || e.data?.requestId !== requestId) return;
      clearTimeout(timer); removeEventListener('message', listener); e.data.payload.ok ? ok(e.data.payload.result) : fail(new Error(e.data.payload.error.message)); }
    addEventListener('message', listener); f.contentWindow.postMessage({ protocol: 'cfzn.openblock', version: 1, requestId, type, payload }, location.origin);
  }), { type, payload });
}
const snapshot = s => bridge(s, 'GET_STATE');
async function ready(s) { await s.f.waitForFunction(() => !document.querySelector('[data-testid="save-project"]').disabled); }
async function status(s, text) { await s.f.waitForFunction(text => document.querySelector('[data-testid="project-status"]').textContent === text, text); }
async function title(s, value) { const field = s.f.locator('input[class*="title-field"]'); assert.equal(await field.count(), 1); await field.fill(value); await field.press('Tab'); }
async function nativeVm(s) {
  await s.f.evaluate(() => { const render = CFZNOpenBlock.renderLibrary; CFZNOpenBlock.renderLibrary = (...args) => { window.__vm = args[2].vm; return render(...args); }; });
  await s.f.locator('[class*="extension-button"]').first().click(); await s.f.getByText('返回', { exact: true }).click();
  await s.f.evaluate(() => __vm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.__B = B; return B; } }));
}
async function blocks(s, number) {
  await s.f.evaluate(number => __B.Xml.clearWorkspaceAndLoadFromXml(__B.Xml.textToDom(`<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenflagclicked" id="toolbar-hat" x="80" y="60"><next><block type="motion_movesteps" id="toolbar-move"><value name="STEPS"><shadow type="math_number" id="toolbar-number"><field name="NUM">${number}</field></shadow></value></block></next></block></xml>`), __B.getMainWorkspace()), number);
  await s.f.waitForFunction(number => __vm.editingTarget.blocks._blocks['toolbar-number']?.fields.NUM.value === String(number), number);
}
async function editNumber(s, number) {
  await s.f.evaluate(number => { const b = __B.getMainWorkspace().getBlockById('toolbar-move').getInput('STEPS').connection.targetBlock(); window.__numberId = b.id; b.setFieldValue(String(number), 'NUM'); }, number);
  await s.f.waitForFunction(number => __vm.editingTarget.blocks._blocks[__numberId]?.fields.NUM.value === String(number), number);
}
const readNumber = s => s.f.evaluate(() => { const move = __vm.editingTarget.blocks._blocks['toolbar-move']; return __vm.editingTarget.blocks._blocks[move.inputs.STEPS.block].fields.NUM.value; });
const archive = async s => Buffer.from(await s.f.evaluate(async () => Array.from(new Uint8Array(await (await __vm.saveProjectSb3()).arrayBuffer()))));
const record = async id => (await (await fetch(`${apiOrigin}/api/v1/projects/${id}`)).json()).project;
const content = async id => Buffer.from(await (await fetch(`${apiOrigin}/api/v1/projects/${id}/content`)).arrayBuffer());
async function download(s, name) { const event = s.p.waitForEvent('download'); await t(s, 'export-project').click(); const d = await event; const file = join(out, name); await d.saveAs(file); await ready(s); return file; }
async function importFile(s, file) {
  await ready(s); const start = await s.f.evaluate(() => __toolbarViews.length);
  const chooser = s.p.waitForEvent('filechooser'); await t(s, 'import-project').click(); await (await chooser).setFiles(file);
  await s.f.waitForFunction(start => __toolbarViews.slice(start).some(v => v.statusText === '正在导入…') && !document.querySelector('[data-testid="save-project"]').disabled, start);
}
async function save(s, method) {
  const response = s.p.waitForResponse(r => r.request().method() === method && r.url().includes('/api/v1/projects'));
  await t(s, 'save-project').click(); const r = await response; assert.equal(r.status(), method === 'POST' ? 201 : 200); await ready(s); return (await r.json()).project;
}
async function geometry(s, width) {
  await s.p.setViewportSize({ width, height: 900 });
  // Native OpenBlock switches React responsive components after its resize handler.
  await s.f.waitForFunction(width => {
    const group = document.querySelector('.cfzn-project-tools'), r = group.getBoundingClientRect();
    return r.x >= 0 && r.right <= width && (width < 1440 || !!document.querySelector('input[class*="title-field"]'));
  }, width, { timeout: 5000 });
  await s.f.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const value = await s.f.evaluate(() => {
    const group = document.querySelector('.cfzn-project-tools'), host = document.querySelector('[data-cfzn-menu-host]');
    return { width: innerWidth, hostClass: host.className, group: group.getBoundingClientRect().toJSON(),
      tabs: document.querySelector('[role="tablist"]').getBoundingClientRect().toJSON(), menu: document.querySelector('[class*="gui_menu-bar-position"]').getBoundingClientRect().toJSON(),
      status: document.querySelector('[data-testid="project-status"]').getBoundingClientRect().toJSON(),
      directChild: group.parentElement === host, overflowY: getComputedStyle(host).overflowY,
      oldAttributes: document.querySelectorAll('[data-cfzn-alert-host], [data-cfzn-editor-body]').length,
      oldSpace: getComputedStyle(document.documentElement).getPropertyValue('--cfzn-project-tools-space'),
      groupClientWidth: group.clientWidth, groupScrollWidth: group.scrollWidth,
      buttons: [...group.querySelectorAll('button')].map(el => { const rect = el.getBoundingClientRect(); return { text: el.textContent, rect: rect.toJSON(), hit: el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) }; }),
    };
  });
  await dump(`geometry-${width}.json`, value);
  assert.equal(value.menu.height, 48); assert.equal(value.tabs.top, value.menu.bottom);
  assert.equal(value.directChild, true); assert.equal(value.oldAttributes, 0); assert.equal(value.oldSpace.trim(), ''); assert.equal(value.overflowY, 'visible');
  assert.ok(value.group.top >= value.menu.top && value.group.bottom <= value.menu.bottom);
  assert.ok(value.buttons.every(b => b.rect.top >= value.menu.top && b.rect.bottom <= value.menu.bottom));
  assert.ok(value.status.top >= value.menu.top && value.status.bottom <= value.menu.bottom);
  assert.ok(value.group.x >= 0 && value.group.right <= width);
  if (width >= 1440) {
    assert.ok(value.buttons.every(b => b.rect.x >= 0 && b.rect.right <= width && b.hit)); assert.ok(value.status.right <= width);
  }
  await s.p.screenshot({ path: join(out, `layout-${width}.png`) }); return value;
}
async function placement(s) {
  await check('MenuBar direct ownership, File removal, no spacer, 1440/1894 one-row geometry', async () => {
    assert.equal(await s.p.locator('.app-bar, header').count(), 0);
    const host = s.f.locator('.gui_menu-bar-position_3U1T0.menu-bar_menu-bar_JcuHF.box_box_2jjDp'); assert.equal(await host.count(), 1);
    assert.equal(await host.locator(':scope > .cfzn-project-tools').count(), 1);
    for (const id of ['project-list-button', 'new-project', 'import-project', 'export-project', 'save-project', 'project-status']) {
      assert.equal(await host.getByTestId(id).count(), 1); assert.equal(await s.p.getByTestId(id).count(), 0); assert.equal(await s.f.getByTestId(id).count(), 1);
    }
    assert.equal(await s.f.getByText('文件', { exact: true }).count(), 0);
    assert.equal(await s.f.getByText('编辑', { exact: true }).count(), 1); assert.equal(await s.f.getByText('未选择设备', { exact: true }).count(), 1);
    assert.equal(await s.f.locator('input[class*="title-field"]').count(), 1); assert.equal(await s.f.getByTestId('serial-button').count(), 0); await status(s, '未保存项目'); assert.equal((await snapshot(s)).dirty, false);
    return { layouts: [await geometry(s, 1440), await geometry(s, 1894)], clean: true };
  });
  await check('MenuBar 390 internal horizontal scroll reaches all five controls and status', async () => {
    const layout = await geometry(s, 390), group = s.f.locator('.cfzn-project-tools');
    assert.ok(layout.groupScrollWidth > layout.groupClientWidth);
    const offset = await s.p.getByTestId('openblock-frame').boundingBox();
    await s.p.mouse.move(offset.x + layout.group.x + layout.group.width / 2, offset.y + layout.group.y + layout.group.height / 2);
    await s.p.mouse.wheel(400, 0); await s.f.waitForFunction(() => document.querySelector('.cfzn-project-tools').scrollLeft > 0);
    const reached = [];
    for (const id of ['project-list-button', 'new-project', 'import-project', 'export-project', 'save-project']) {
      await t(s, id).focus();
      const rect = await t(s, id).evaluate(el => { const r = el.getBoundingClientRect(), g = el.parentElement.getBoundingClientRect(); return { x: r.x, right: r.right, top: r.top, bottom: r.bottom, groupX: g.x, groupRight: g.right,
        scrollLeft: el.parentElement.scrollLeft, hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; });
      assert.ok(rect.x >= rect.groupX - 1 && rect.right <= rect.groupRight + 1 && rect.hit, `${id}: ${JSON.stringify(rect)}`); reached.push({ id, ...rect });
    }
    await t(s, 'project-status').scrollIntoViewIfNeeded(); const rect = await t(s, 'project-status').boundingBox();
    assert.ok(rect.x >= layout.group.x - 1 && rect.x + rect.width <= layout.group.right + 1);
    assert.equal(await s.f.evaluate(() => scrollX), 0);
    await s.p.screenshot({ path: join(out, 'layout-390-status-scrolled.png') });
    await s.p.setViewportSize({ width: 1440, height: 900 }); await group.evaluate(el => { el.scrollLeft = 0; });
    return { layout, wheelScrolled: true, reached, statusRect: rect };
  });
  await check('MenuBar original Edit dropdown, device selector, alert and extension library retain priority', async () => {
    await s.p.setViewportSize({ width: 1440, height: 900 }); await s.f.waitForFunction(() => !!document.querySelector('input[class*="title-field"]'));
    await s.f.getByText('编辑', { exact: true }).click(); const dropdown = s.f.locator('[class*="menu_menu_"]:visible').first(); await dropdown.waitFor();
    const rect = await dropdown.boundingBox(); assert.ok(rect.y >= 48 && rect.height > 10);
    assert.equal(await dropdown.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + 12, r.y + 12)); }), true);
    await s.p.screenshot({ path: join(out, 'native-edit-dropdown.png') }); await t(s, 'project-status').click();
    await s.f.getByText('未选择设备', { exact: true }).click(); await s.f.getByRole('button', { name: 'Micro:bit', exact: true }).waitFor();
    assert.equal(await s.f.locator('.cfzn-project-tools').isVisible(), false); await s.f.getByText('返回', { exact: true }).click();
    await nativeVm(s); await s.f.evaluate(() => __vm.emit('PERIPHERAL_CONNECTION_LOST_ERROR', { deviceId: 'arduinoUno' }));
    const list = s.f.locator('[class*="alerts_alerts-inner-container"]'); await list.locator('[class*="alert_alert"]').first().waitFor();
    await s.p.screenshot({ path: join(out, 'native-alert.png') }); await list.locator('[class*="close-button_close-button"]').first().click();
    await s.f.waitForFunction(() => document.querySelector('[class*="alerts_alerts-inner-container"]').children.length === 0);
    await s.f.locator('[class*="extension-button"]').first().click(); assert.equal(await s.f.locator('.cfzn-project-tools').isVisible(), false);
    await s.f.getByRole('button', { name: '主控扩展', exact: true }).click(); await s.f.getByRole('button', { name: '模块扩展', exact: true }).click();
    await s.p.screenshot({ path: join(out, 'native-library.png') }); await s.f.getByText('返回', { exact: true }).click();
    return { editDropdown: rect, nativeDeviceLibrary: true, nativeAlert: true, extensionCategories: true };
  });
  await check('MenuBar real import/save/export, New and project drawer clicks', async () => {
    await s.p.setViewportSize({ width: 1440, height: 900 }); await s.f.waitForFunction(() => !!document.querySelector('input[class*="title-field"]'));
    if (!await s.f.evaluate(() => !!window.__vm)) await nativeVm(s);
    await blocks(s, 10); await title(s, 'MenuBar placement acceptance'); await status(s, '未保存的更改');
    const count = writes(), before = await snapshot(s), beforeArchive = await archive(s); const file = await download(s, 'menu-native-export.ob');
    assert.equal(writes(), count); assert.deepEqual(await snapshot(s), before); assert.deepEqual(semantic(await readFile(file)), semantic(beforeArchive));
    const confirm = s.p.waitForEvent('dialog').then(d => d.accept()); await importFile(s, file); await confirm;
    assert.deepEqual(semantic(await archive(s)), semantic(beforeArchive));
    const created = await save(s, 'POST'); await status(s, '已保存 · v1'); assert.deepEqual(semantic(await content(created.id)), semantic(beforeArchive));
    await t(s, 'project-list-button').click(); await s.p.getByTestId('project-panel').waitFor(); assert.equal(await t(s, 'project-list-button').getAttribute('aria-expanded'), 'true');
    await s.p.locator(`[data-project-id="${created.id}"]`).waitFor(); await s.p.getByRole('button', { name: '关闭项目列表' }).click();
    await t(s, 'new-project').click(); await status(s, '未保存项目'); await t(s, 'project-list-button').click();
    await s.p.locator(`[data-project-id="${created.id}"]`).getByRole('button', { name: '打开', exact: true }).click(); await status(s, '已保存 · v1');
    await s.f.waitForFunction(() => __B.getMainWorkspace().getBlockById('toolbar-move')?.getInput('STEPS').connection.targetBlock()?.getFieldValue('NUM') === '10');
    // Removed serial drawer entry has no substitute.
    assert.equal(await s.f.getByTestId('serial-button').count(), 0); assert.deepEqual(errors, []);
    await s.p.screenshot({ path: join(out, 'menu-ui-project-reopen.png') });
    return { createdId: created.id, revision: 1, exportPreservedDirty: true, realFileChooser: true, serialPermissionRequests: 0, errors };
  });
}
let s;
try {
  s = await create('main');
  if (placementOnly) await placement(s);
  if (!placementOnly && (saveRecheck || (onlyCase && /native POST|delayed save|save failure|real 412/i.test(process.env.CFZN_NATIVE_CASE)))) { await nativeVm(s); await blocks(s, 10); await title(s, 'Native save focused recheck'); }
  await check('actual native host, one five-button group, clean fresh status and 1440/390 layout', async () => {
    assert.equal(await s.p.locator('.app-bar, header').count(), 0);
    const host = s.f.locator('.gui_menu-bar-position_3U1T0.menu-bar_menu-bar_JcuHF.box_box_2jjDp'); assert.equal(await host.count(), 1);
    assert.equal(await host.locator(':scope > .cfzn-project-tools').count(), 1);
    for (const id of ['project-list-button', 'new-project', 'import-project', 'export-project', 'save-project', 'project-status']) {
      assert.equal(await host.getByTestId(id).count(), 1); assert.equal(await s.p.getByTestId(id).count(), 0); assert.equal(await s.f.getByTestId(id).count(), 1);
    }
    assert.equal(await host.locator('.cfzn-project-tools button').count(), 5); await status(s, '未保存项目');
    const layouts = [await geometry(s, 1440), await geometry(s, 390)]; await s.p.setViewportSize({ width: 1440, height: 900 }); return layouts;
  });
  await check('real project drawer toggles, keyboard/focus, original title and real VM edits', async () => {
    await t(s, 'project-list-button').focus(); await t(s, 'project-list-button').press('Enter'); await s.p.getByTestId('project-panel').waitFor();
    assert.equal(await t(s, 'project-list-button').getAttribute('aria-expanded'), 'true'); assert.equal(await s.p.getByTestId('project-row').count(), 0);
    await s.p.getByRole('button', { name: '关闭项目列表' }).press('Escape'); await s.p.getByTestId('project-panel').waitFor({ state: 'hidden' });
    await s.f.waitForFunction(() => document.activeElement === document.querySelector('[data-testid="project-list-button"]'));
    await title(s, 'Independent native toolbar'); await status(s, '未保存的更改'); await nativeVm(s); await blocks(s, 10);
    return await snapshot(s);
  });
  await check('actual .ob download preserves dirty and performs no save API; new cancel/confirm; native chooser reimport', async () => {
    const before = await snapshot(s), count = writes(), beforeArchive = await archive(s);
    exported = await download(s, 'actual-native-export.ob'); assert.equal(writes(), count); assert.deepEqual(await snapshot(s), before);
    assert.deepEqual(semantic(await readFile(exported)), semantic(beforeArchive));
    const canceled = s.p.waitForEvent('dialog').then(d => d.dismiss()); await t(s, 'new-project').click(); await canceled; await ready(s);
    assert.deepEqual(await snapshot(s), before); assert.deepEqual(semantic(await archive(s)), semantic(beforeArchive));
    const accepted = s.p.waitForEvent('dialog').then(d => d.accept()); await t(s, 'new-project').click(); await accepted;
    await status(s, '未保存项目'); assert.notEqual((await snapshot(s)).documentId, before.documentId);
    await importFile(s, exported); await status(s, '未保存的更改'); assert.deepEqual(semantic(await archive(s)), semantic(beforeArchive));
    return { chooserFromNativeClick: true, dirtyPreservedOnExport: true, saveApiWrites: writes() - count, media: semantic(beforeArchive).media };
  });
  await check('native POST and PUT show actual saved revisions; fresh project-list reopen preserves blocks/media', async () => {
    const created = await save(s, 'POST'); projectId = created.id; await status(s, '已保存 · v1');
    const posted = calls.filter(c => c.method === 'POST').at(-1).body, downloaded = await content(projectId);
    const begin = posted.indexOf(Buffer.from([80, 75, 3, 4])), end = posted.lastIndexOf(Buffer.from([80, 75, 5, 6]));
    assert.deepEqual(posted.subarray(begin, end + 22 + posted.readUInt16LE(end + 20)), downloaded);
    await editNumber(s, 20); await status(s, '未保存的更改'); const updated = await save(s, 'PUT'); assert.equal(updated.revision, 2); await status(s, '已保存 · v2');
    const persisted = await content(projectId); assert.deepEqual(calls.filter(c => c.method === 'PUT').at(-1).body, persisted);
    const fresh = await create('fresh'); await t(fresh, 'project-list-button').click();
    await fresh.p.locator(`[data-project-id="${projectId}"]`).getByRole('button', { name: '打开', exact: true }).click(); await status(fresh, '已保存 · v2');
    await nativeVm(fresh); assert.deepEqual(semantic(await archive(fresh)), semantic(persisted)); assert.equal((await snapshot(fresh)).dirty, false);
    await fresh.f.waitForFunction(() => {
      const move = __B.getMainWorkspace().getBlockById('toolbar-move');
      return move?.getParent()?.id === 'toolbar-hat' && move.getInput('STEPS').connection.targetBlock()?.getFieldValue('NUM') === '20' && move.getSvgRoot().getBoundingClientRect().width > 0;
    });
    await fresh.f.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok))));
    await fresh.p.screenshot({ path: join(out, 'fresh-ui-api-reopen.png') }); await writeFile(join(out, 'api-revision-2.ob'), persisted);
    activePage = s.p; return { id: projectId, revision: updated.revision, archiveBytes: persisted.length, media: semantic(persisted).media };
  });
  await check('delayed save plus later native title/block edits stays dirty and preserves captured archive', async () => {
    await editNumber(s, 30); let release; held = new Promise(ok => { release = ok; }); const started = new Promise(ok => { arrived = ok; }); mode = 'delay';
    await t(s, 'save-project').click(); await started; await status(s, '正在保存…');
    for (const id of ['new-project', 'import-project', 'export-project', 'save-project']) assert.equal(await t(s, id).isDisabled(), true);
    await title(s, 'Later native title'); await editNumber(s, 40); release(); mode = 'normal';
    await s.p.getByTestId('project-notice').filter({ hasText: '已保存较早版本' }).waitFor(); await status(s, '未保存的更改');
    const savedJson = JSON.parse(unzip(await content(projectId))['project.json']);
    assert.ok(savedJson.targets.some(t => t.blocks['toolbar-move']?.inputs?.STEPS?.[1]?.[1] === '30'));
    assert.equal((await snapshot(s)).title, 'Later native title');
    assert.equal(await readNumber(s), '40');
    const next = await save(s, 'PUT'); const latest = await record(projectId); await status(s, `已保存 · v${latest.revision}`);
    return { capturedPutRevision: next.revision, finalRevisionAfterNamePatch: latest.revision, laterEditsStayedDirty: true };
  });
  await check('save failure stays dirty, original API content stays intact, same native Save retries', async () => {
    const previous = await content(projectId), previousRecord = await record(projectId); await editNumber(s, 50); mode = 'failure';
    await t(s, 'save-project').click(); await s.p.getByTestId('project-notice').filter({ hasText: 'Independent injected write failure' }).waitFor();
    await status(s, '未保存的更改'); assert.deepEqual(await content(projectId), previous); assert.equal((await record(projectId)).revision, previousRecord.revision);
    mode = 'normal'; const updated = await save(s, 'PUT'); await status(s, `已保存 · v${updated.revision}`); return { retryRevision: updated.revision };
  });
  await check('real 412 feedback, canceled reload, save-as recovery, then confirmed reload recovery', async () => {
    const bump = async (id, name) => { const r = await record(id); const response = await fetch(`${apiOrigin}/api/v1/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `"${r.revision}"` }, body: JSON.stringify({ name }) }); assert.equal(response.status, 200); return (await response.json()).project; };
    await bump(projectId, 'External metadata edit'); await editNumber(s, 60);
    const conflict = s.p.waitForResponse(r => r.request().method() === 'PUT'); await t(s, 'save-project').click(); assert.equal((await conflict).status(), 412);
    await s.p.getByRole('button', { name: '重新载入', exact: true }).waitFor(); await status(s, '未保存的更改');
    const before = await snapshot(s), beforeArchive = await archive(s);
    const cancel = s.p.waitForEvent('dialog').then(d => d.dismiss()); await s.p.getByRole('button', { name: '重新载入', exact: true }).click(); await cancel; await ready(s);
    assert.deepEqual(await snapshot(s), before); assert.deepEqual(semantic(await archive(s)), semantic(beforeArchive));
    await s.p.screenshot({ path: join(out, 'real-412-recovery.png') });
    const created = s.p.waitForResponse(r => r.request().method() === 'POST'); await s.p.getByRole('button', { name: '另存为新项目', exact: true }).click();
    const newProject = (await (await created).json()).project; assert.notEqual(newProject.id, projectId); await status(s, '已保存 · v1');
    await bump(newProject.id, 'Reload authoritative'); await editNumber(s, 70);
    await t(s, 'save-project').click(); await s.p.getByRole('button', { name: '重新载入', exact: true }).waitFor();
    const confirm = s.p.waitForEvent('dialog').then(d => d.accept()); await s.p.getByRole('button', { name: '重新载入', exact: true }).click(); await confirm;
    await status(s, '已保存 · v2'); assert.equal((await snapshot(s)).title, 'Reload authoritative');
    assert.equal(await readNumber(s), '60');
    return { firstProject: projectId, saveAsProject: newProject.id, reloadRevision: 2 };
  });
  // Retired 2026-11-10: removed standalone MenuBar serial drawer entry.
  await check('native alerts still render/dismiss; library and fullscreen retain input priority; narrow drawers', async () => {
    await s.f.evaluate(() => __vm.emit('PERIPHERAL_CONNECTION_LOST_ERROR', { deviceId: 'arduinoUno' }));
    const alertList = s.f.locator('[class*="alerts_alerts-inner-container"]'); await alertList.locator('[class*="alert_alert"]').first().waitFor();
    await s.p.screenshot({ path: join(out, 'native-alert.png') }); await alertList.locator('[class*="close-button_close-button"]').first().click();
    await s.f.waitForFunction(() => document.querySelector('[class*="alerts_alerts-inner-container"]').children.length === 0);
    await t(s, 'project-list-button').click(); await s.p.getByTestId('project-panel').waitFor();
    await s.f.locator('[class*="extension-button"]').first().click(); await s.p.getByTestId('project-panel').waitFor({ state: 'hidden' });
    assert.equal(await s.f.locator('.cfzn-project-tools').isVisible(), false);
    for (const name of ['主控扩展', '模块扩展', '舞台扩展']) { const b = s.f.getByRole('button', { name, exact: true }); await b.click(); assert.equal(await b.getAttribute('aria-pressed'), 'true'); }
    await s.p.screenshot({ path: join(out, 'extension-modal-priority.png') }); await s.f.getByText('返回', { exact: true }).click();
    await s.f.getByAltText(/全屏|full screen/i).click(); assert.equal(await s.f.locator('.cfzn-project-tools').isVisible(), false);
    await s.p.screenshot({ path: join(out, 'stage-fullscreen.png') }); await s.f.getByAltText(/全屏|full screen/i).click(); await s.f.locator('.cfzn-project-tools').waitFor();
    await s.p.getByRole('button', { name: '关闭提示' }).click();
    const layout = await geometry(s, 390); await t(s, 'project-list-button').click(); await s.p.getByTestId('project-panel').waitFor();
    await s.p.screenshot({ path: join(out, 'project-drawer-390.png') }); await s.p.getByRole('button', { name: '关闭项目列表' }).click();
    await s.p.setViewportSize({ width: 1440, height: 900 }); assert.deepEqual(errors, []); return { narrowLayout: layout, nativeAlertDismissed: true, pageErrors: errors };
  });
  await check('adapted previous UI→API and real export/import scenario only', async () => {
    const child = spawn(process.execPath, [join(root, 'tests/extensions-independent.mjs')], { cwd: root, env: { ...process.env, CFZN_TEST_URL: origin,
      CFZN_TEST_FILTER: 'top toolbar', CFZN_TEST_EVIDENCE: join(out, 'legacy-extension-smoke') }, windowsHide: true });
    const output = []; child.stdout.on('data', b => output.push(b)); child.stderr.on('data', b => output.push(b));
    const code = await new Promise(ok => child.on('exit', ok)); await writeFile(join(out, 'legacy-smoke.log'), Buffer.concat(output)); assert.equal(code, 0, Buffer.concat(output).toString());
    return { exitCode: code, filter: 'top toolbar', otherExtensionCasesRerun: false };
  });
} catch (e) { results.push({ name: 'harness prerequisite', status: 'FAIL', error: String(e), stack: e.stack }); console.error(e); }
finally {
  mode = 'normal';
  await dump('results.json', results); await dump('network.json', calls.map(({ body, headers, ...c }) => ({ ...c, bodyBytes: body?.length, ifMatch: headers['if-match'] })));
  await dump('page-errors.json', errors); await dump('environment.json', { origin, apiOrigin, temporary, builds: [...builds], runId, placementOnly, saveRecheck, onlyCase: process.env.CFZN_NATIVE_CASE || null });
  await writeFile(join(evidenceRoot, 'latest.json'), JSON.stringify({ runId, evidenceDirectory: out, results }, null, 2));
  for (const c of contexts) await c.close(); await browser.close(); await new Promise(ok => server.close(ok)); await api.close();
  assert.ok(temporary.startsWith(join(tmpdir(), 'cfzn-native-toolbar-test-'))); await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify(results.map(({ name, status, error }) => ({ name, status, error })), null, 2));
if (results.some(v => v.status === 'FAIL')) process.exitCode = 1;
