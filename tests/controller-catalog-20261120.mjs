import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const web = join(root, 'apps/web');
const dist = join(web, 'dist');
const out = join(root, 'tests/evidence/controller-catalog-20261120');
const require = createRequire(import.meta.url);
const shared = JSON.parse(await readFile(join(root, 'apps/api/src/common/controller-catalog.json')));
const baseline = JSON.parse(await readFile(join(root,
  'tests/evidence/controller-catalog-consistency/2026-11-11T08-10-52-878Z/dist-catalog-metadata.json'))).expected;
const expected = baseline.map(({ id, name }) => ({ id, name }));
assert.deepEqual(expected.map(row => row.id), shared);
const five = ['arduinoUno', 'arduinoEsp32S3', 'aijiteESP32S3', 'arduinoEsp32', 'firebeetleEsp32E'];
const modulePath = '/api/v1/custom-modules';
const projectPath = '/api/v1/projects';
const name = 'Nano Catalog QA';
const report = { steps: [], pageErrors: [] };
const tempRoot = await realpath(tmpdir());
const temp = await mkdtemp(join(tempRoot, 'cfzn-catalog20-'));
const servers = [];
let api, apiOrigin, browser, vite, activePage;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const { unzipSync } = require('../apps/web/node_modules/fflate');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const b = (s, name) => s.frame.getByRole('button', { name, exact: true });
const library = s => s.frame.locator('[class*="extension-button"]').first().click();
const back = s => s.frame.getByText('返回', { exact: true }).click();
const modules = s => b(s, '模块扩展').click();
const factory = s => b(s, '自定义模块扩展').click();
const card = (s, kind, id) => s.frame.locator('[data-cfzn-library-card="' + kind + '-' + id + '"]');
const has = (page, path, method) => page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
const pass = (name, detail) => { report.steps.push({ name, detail }); console.log('PASS', name); };
const content = editor => editor.locator('.view-lines');
const code = (s, label) => s.frame.locator('[data-factory-code="' + label + '"]');
async function listen(server) {
  servers.push(server);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return 'http://127.0.0.1:' + server.address().port;
}
function proxy(req, res) {
  const upstream = request(new URL(req.url, apiOrigin), { method: req.method, headers: req.headers }, reply => {
    res.writeHead(reply.statusCode, reply.headers);
    reply.pipe(res);
  });
  upstream.on('error', () => res.writeHead(502).end());
  req.pipe(upstream);
}
async function ordered(s) {
  return s.frame.locator('[data-cfzn-library-card]').evaluateAll(cards => cards.map(card => ({
    id: card.dataset.cfznLibraryCard.slice(11), name: card.querySelector('.cfzn-card-select').getAttribute('aria-label'),
  })));
}
async function openEntry(s, entry) {
  if (await s.frame.locator('.cfzn-extension-controls').isVisible()) await back(s);
  if (entry === 'bottom') await library(s);
  else await s.frame.locator('[data-cfzn-menu-host] img[class*="device-icon"]').click();
  await expect(s.frame.locator('.cfzn-extension-controls')).toHaveAttribute('data-category', 'controllers');
}
async function checked(s) {
  return s.frame.locator('.cfzn-factory-board-picker input:checked').evaluateAll(inputs =>
    inputs.map(input => input.parentElement.textContent.trim()));
}
async function factoryCatalog(s) {
  return s.frame.locator('.cfzn-factory-board-picker label').evaluateAll(labels => labels.map(label => ({
    id: label.querySelector('input').value, name: label.textContent.trim(),
  })));
}
async function compareFactory(s) {
  const entries = await factoryCatalog(s);
  // HTML checkbox values default to "on". Identity is verified independently through each saved supportDevice.
  assert.deepEqual(entries.map(row => row.name), expected.map(row => row.name));
  assert.equal(entries.length, shared.length);
  return entries;
}
async function catalog(s, label) {
  await library(s);
  const search = s.frame.locator('input[class*="library_filter-input"]');
  for (const entry of ['bottom', 'top']) {
    await openEntry(s, entry);
    assert.deepEqual(await ordered(s), expected);
    await expect(s.frame.getByRole('group', { name: '扩展类型' })).toHaveCount(0);
    await expect(b(s, '全部')).toHaveCount(0);
    await expect(b(s, '主控板')).toHaveCount(0);
    for (const [query, id] of [['Nano', 'arduinoNano'], ['NodeMCU', 'arduinoEsp8266NodeMCU']]) {
      await search.fill(query);
      assert.deepEqual(await ordered(s), expected.filter(row => row.id === id));
    }
    await search.fill('');
    assert.deepEqual(await ordered(s), expected);
    const modeOnly = s.frame.getByRole('checkbox', { name: '仅当前模式', exact: true });
    await modeOnly.check();
    const realtime = await s.inner.evaluate(() => window.__qaCatalog.filter(item => item.deviceId &&
      item.deviceId !== 'null' && !item.hide && item.programMode?.includes('realtime')).map(item => item.deviceId));
    assert.deepEqual((await ordered(s)).map(row => row.id), realtime);
    await modeOnly.uncheck();
    assert.deepEqual(await ordered(s), expected);
    await s.frame.getByRole('checkbox', { name: '已加载', exact: true }).check();
    await expect(s.frame.locator('[data-cfzn-library-card]')).toHaveCount(0);
    await b(s, '清除筛选').click();
    assert.deepEqual(await ordered(s), expected);
  }
  await s.page.screenshot({ path: join(out, label + '-controllers.png') });
  await card(s, 'controller', 'arduinoNano').locator('.cfzn-card-select').click();
  await expect(card(s, 'controller', 'arduinoNano')).toHaveAttribute('data-cfzn-selected', 'true');
  await s.frame.getByRole('checkbox', { name: '已加载', exact: true }).check();
  assert.deepEqual(await ordered(s), expected.filter(row => row.id === 'arduinoNano'));
  await s.frame.getByRole('checkbox', { name: '已加载', exact: true }).uncheck();
  await openEntry(s, 'bottom');
  await modules(s);
  await expect(s.frame.getByRole('group', { name: '扩展类型' }).getByRole('button'))
    .toHaveText(['全部', '传感器', '执行器', '功能模块']);
  await b(s, '传感器').click();
  await b(s, '主控扩展').click();
  assert.deepEqual(await ordered(s), expected);
  await expect(s.frame.getByRole('group', { name: '扩展类型' })).toHaveCount(0);
  await modules(s);
  await b(s, '全部').click();
  await s.frame.getByRole('checkbox', { name: '显示全部模块', exact: true }).check();
  await expect(s.frame.locator('[data-cfzn-library-card]')).toHaveCount(6);
  await expect(s.frame.locator('.cfzn-card-select[aria-disabled="true"]')).toHaveCount(6);
  const support = await s.frame.locator('.cfzn-card-compatibility').evaluateAll(badges => badges.map(badge => badge.title));
  for (const text of support) {
    assert.equal(text.replace('支持：', '').split('、').length, 5);
    assert.ok(!text.includes('Arduino Nano'));
  }
  pass(label + ' paired catalogs, retained filters and five-board built-in compatibility', { expected, support });
}

async function factoryFlow(s, origin, label, context) {
  await factory(s);
  await b(s, '新建模块').click();
  const choices = await compareFactory(s);
  assert.deepEqual(await checked(s), ['Arduino Nano']);
  await s.frame.getByLabel('模块名称', { exact: true }).fill(name);
  await s.frame.locator('[data-factory-add-shape="command"]').click();
  const modify = s.frame.getByRole('dialog', { name: 'Modify Block', exact: true });
  await modify.getByLabel('Block ID').fill('nano_write');
  await modify.getByRole('button', { name: 'OK', exact: true }).click();
  await b(s, '积木逻辑 nano_write').click();
  await setCode(code(s, '积木代码'), 'digitalWrite(13, HIGH);');
  await s.frame.getByRole('dialog', { name: 'Arduino 生成器：nano_write', exact: true })
    .getByRole('button', { name: 'OK', exact: true }).click();
  await s.page.screenshot({ path: join(out, label + '-factory20.png') });
  const save = has(s.page, modulePath, 'POST');
  await b(s, '保存模块').click();
  const response = await save;
  assert.equal(response.status(), 201);
  const original = (await response.json()).item;
  assert.deepEqual(original.definition.supportDevice, ['arduinoNano']);
  assert.deepEqual((await (await context.request.get(origin + modulePath + '/' + original.id)).json()).item, original);
  const record = s.frame.locator('[data-cfzn-custom-module-id="' + original.id + '"]');
  await record.getByRole('button', { name: '查看详情 ' + name }).click();
  await compareFactory(s);
  assert.deepEqual(await checked(s), ['Arduino Nano']);
  await b(s, '返回私有模块').click();
  await record.getByRole('button', { name: '创建新版本 ' + name }).click();
  const inputs = s.frame.locator('.cfzn-factory-board-picker input');
  for (let i = 0; i < shared.length; i++) await inputs.nth(i).check();
  assert.deepEqual(await checked(s), expected.map(row => row.name));
  await s.frame.getByLabel('版本', { exact: true }).fill('2.0.0');
  const nextSave = has(s.page, modulePath, 'POST');
  await b(s, '保存新版本').click();
  const nextResponse = await nextSave;
  assert.equal(nextResponse.status(), 201);
  const next = (await nextResponse.json()).item;
  assert.notEqual(next.id, original.id);
  assert.deepEqual(next.definition.supportDevice, ['arduinoNano', ...shared.filter(id => id !== 'arduinoNano')]);
  assert.deepEqual((await (await context.request.get(origin + modulePath + '/' + next.id)).json()).item, next);
  const legacyDefinition = { ...original.definition, name: 'Legacy five boards', supportDevice: five };
  const legacyResponse = await context.request.post(origin + modulePath, { headers: { Origin: origin }, data: { definition: legacyDefinition } });
  assert.equal(legacyResponse.status(), 201);
  const legacy = (await legacyResponse.json()).item;
  const legacyRead = await context.request.get(origin + modulePath + '/' + legacy.id);
  assert.deepEqual((await legacyRead.json()).item.definition.supportDevice, five);
  pass(label + ' UI Nano save, details, immutable all20 new version and five-board reread', { choices, original, next, legacy });

  await b(s, '返回扩展库').click();
  const search = s.frame.locator('input[class*="library_filter-input"]');
  await search.fill(name);
  await card(s, 'module', original.id).locator('.cfzn-card-select').click();
  await expect(card(s, 'module', original.id)).toHaveAttribute('data-cfzn-selected', 'true');
  await back(s);
  await b(s, '上传模式').click();
  await blockly(s);
  const block = await dragBlock(s, original.id + '_nano_write');
  assert.match(await generate(s), /digitalWrite\(13, HIGH\);/);
  const projectSave = has(s.page, projectPath, 'POST');
  await s.frame.getByTestId('save-project').click();
  const projectResponse = await projectSave;
  assert.equal(projectResponse.status(), 201);
  const project = (await projectResponse.json()).project;
  const uploaded = await new Response(projectResponse.request().postDataBuffer(), {
    headers: { 'content-type': projectResponse.request().headers()['content-type'] },
  }).formData();
  const bytes = Buffer.from(await uploaded.get('file').arrayBuffer());
  const download = await context.request.get(origin + projectPath + '/' + project.id + '/content');
  assert.deepEqual(await download.body(), bytes);
  const stored = archive(bytes);
  assert.equal(stored.project.device.deviceId, 'arduinoNano');
  assert.deepEqual(stored.project.deviceExtensions, [original.id]);
  const fresh = await start(context, origin, label + '-reopen');
  await openProject(fresh, project.id);
  await expect(fresh.page.getByTestId('project-notice')).toContainText('已打开', { timeout: 30000 });
  await library(fresh);
  await modules(fresh);
  await expect(card(fresh, 'module', original.id)).toHaveAttribute('data-cfzn-selected', 'true');
  await back(fresh);
  await blockly(fresh);
  assert.match(await generate(fresh), /digitalWrite\(13, HIGH\);/);
  const roundtrip = archive(Buffer.from(await bridge(fresh, 'EXPORT_PROJECT')));
  assert.equal(roundtrip.project.device.deviceId, 'arduinoNano');
  assert.deepEqual(roundtrip.project.deviceExtensions, [original.id]);
  assert.deepEqual(roundtrip.assets, stored.assets);
  assert.equal(roundtrip.project.targets.find(t => t.blocks[block.id]).blocks[block.id].opcode, original.id + '_nano_write');
  const outsider = await browser.newContext();
  try {
    await outsider.request.get(origin + modulePath);
    assert.deepEqual(await (await outsider.request.get(origin + modulePath)).json(), { items: [] });
    for (const id of [original.id, next.id, legacy.id]) {
      assert.equal((await outsider.request.get(origin + modulePath + '/' + id)).status(), 404);
    }
  } finally { await outsider.close(); }
  pass(label + ' Nano native drag, Arduino generation, OB roundtrip and cross-session isolation', { block, project, sha256: sha(bytes) });
}

async function setCode(editor, value) {
  const field = editor.locator('.monaco-editor textarea');
  await expect(field).toBeVisible();
  await field.focus();
  await field.press('Control+a');
  await field.press('Backspace');
  const page = editor.page();
  await page.keyboard.insertText(value);
  await expect(content(editor)).toContainText(value);
}

async function start(context, origin, label) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      getPorts: async () => [],
      requestPort: async () => { throw Error('Physical serial used in isolated test'); },
    } });
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin && !url.pathname.startsWith('/api/v1/hardware') ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push({ label, message: String(error) }));
  await page.goto(origin);
  const frame = page.frameLocator('iframe');
  await expect(frame.getByTestId('save-project')).toBeEnabled({ timeout: 60000 });
  const inner = await (await page.locator('iframe').elementHandle()).contentFrame();
  await inner.evaluate(() => {
    const original = CFZNOpenBlock.renderLibrary;
    CFZNOpenBlock.renderLibrary = (...args) => {
      window.__qaVm = args[2].vm; window.__qaCatalog = args[2].deviceData;
      return original(...args);
    };
  });
  return { page, frame, inner, context };
}

async function bridge(s, type) {
  return s.page.evaluate(type => new Promise((done, fail) => {
    const source = document.querySelector('iframe').contentWindow;
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener('message', receive);
      fail(Error('Bridge timeout: ' + type));
    }, 12000);
    function receive(event) {
      if (event.origin !== location.origin || event.source !== source || event.data?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      const { ok, result, error } = event.data.payload;
      if (!ok) return fail(Error(error.message));
      done(type === 'EXPORT_PROJECT' ? Array.from(new Uint8Array(result.bytes)) : result);
    }
    window.addEventListener('message', receive);
    source.postMessage({ protocol: 'cfzn.openblock', version: 1, type, requestId }, location.origin);
  }), type);
}

async function blockly(s) {
  await s.inner.evaluate(() =>
    window.__qaVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: Blockly => (window.__qaBlockly = Blockly) }));
}
async function dragBlock(s, opcode) {
  await s.frame.locator('.scratchCategoryMenuItemLabel').getByText(name, { exact: true }).click();
  await expect(s.frame.locator('.blocklyFlyout').first()).toBeVisible();
  const from = await s.inner.evaluate(async opcode => {
    const item = window.__qaBlockly.getMainWorkspace().getFlyout().getFlyoutItems().find(b => b.type === opcode);
    if (!item || item.disabled) throw Error('Custom block missing or disabled in real flyout: ' + opcode);
    const view = item.getSvgRoot();
    let last, stable = 0;
    const deadline = performance.now() + 2500;
    while (stable < 8 && performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
      const y = view.getBoundingClientRect().y;
      stable = Math.abs(y - last) < 0.1 ? stable + 1 : 0;
      last = y;
    }
    return view.getBoundingClientRect().toJSON();
  }, opcode);
  const box = await s.page.locator('iframe').boundingBox();
  const workspace = await s.frame.locator('.blocklyMainBackground').first().boundingBox();
  await s.page.mouse.move(box.x + from.x + 30, box.y + from.y + from.height / 2);
  await s.page.mouse.down();
  await s.page.mouse.move(workspace.x + workspace.width * 0.65, workspace.y + workspace.height * 0.42, { steps: 24 });
  await s.page.mouse.up();
  await s.inner.waitForFunction(opcode => Object.values(window.__qaVm.editingTarget.blocks._blocks)
    .some(item => item.opcode === opcode && !item.shadow), opcode);
  const block = await s.inner.evaluate(opcode => {
    const workspace = window.__qaBlockly.getMainWorkspace();
    const item = workspace.getAllBlocks(false).find(item => item.type === opcode);
    const hat = workspace.newBlock('event_whenarduinobegin');
    hat.initSvg();
    hat.render();
    hat.moveBy(320, 120);
    hat.nextConnection.connect(item.previousConnection);
    return { id: item.id, hatId: hat.id };
  }, opcode);
  await s.inner.waitForFunction(({ id, hatId }) =>
    window.__qaVm.editingTarget.blocks.getBlock(hatId)?.next === id, block);
  return block;
}
const generate = s => s.inner.evaluate(() => window.__qaBlockly.Arduino.workspaceToCode(window.__qaBlockly.getMainWorkspace()));

function archive(bytes) {
  const zip = unzipSync(bytes);
  const project = JSON.parse(Buffer.from(zip['project.json']).toString('utf8'));
  const assets = Object.entries(zip).filter(([key]) => key !== 'project.json').map(([, bytes]) => sha(bytes)).sort();
  return { project, assets };
}

async function openProject(s, id) {
  const response = has(s.page, projectPath + '/' + id + '/content', 'GET');
  await s.frame.getByTestId('project-list-button').click();
  await s.page.locator('[data-project-id="' + id + '"]').getByRole('button', { name: '打开', exact: true }).click();
  const downloaded = await response;
  assert.equal(downloaded.status(), 200);
  assert.equal(downloaded.request().headers()['if-match'], '"1"');
  return downloaded;
}

await mkdir(out, { recursive: true });
try {
  const html = await readFile(join(dist, 'openblock.html'), 'utf8');
  assert.ok(html.includes('editor-0hVWSKVB.js'));
  const editorSha256 = sha(await readFile(join(dist, 'assets/editor-0hVWSKVB.js')));
  const deployed = await listen(createServer((req, res) => {
    if (req.url.startsWith('/api/')) return proxy(req, res);
    const pathname = new URL(req.url, 'http://test').pathname;
    const file = resolve(dist, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
    if (!file.startsWith(dist + sep)) return res.writeHead(403).end();
    const stream = createReadStream(file);
    stream.on('open', () => { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); stream.pipe(res); });
    stream.on('error', () => res.writeHead(404).end());
  }));
  const devServer = createServer((req, res) => {
    if (req.url.startsWith('/api/')) return proxy(req, res);
    vite.middlewares(req, res);
  });
  const dev = await listen(devServer);
  api = await require('../apps/api/dist/app.js').createApp(join(temp, 'data'), { customModuleOrigins: [deployed, dev] });
  await api.listen(0, '127.0.0.1');
  apiOrigin = await api.getUrl();
  const { createServer: createVite } = await import(pathToFileURL(require.resolve('vite', { paths: [web] })).href);
  vite = await createVite({ root: web, configFile: join(web, 'vite.config.ts'), cacheDir: join(temp, 'vite-cache'),
    server: { middlewareMode: true, hmr: { server: devServer }, proxy: {} } });
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  report.environment = { editor: 'editor-0hVWSKVB.js', editorSha256, browser: browser.version(), deployed, dev, apiOrigin };
  for (const [label, origin] of [['dist', deployed], ['dev', dev]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const session = await start(context, origin, label);
      await catalog(session, label);
      await factoryFlow(session, origin, label, context);
    } finally { await context.close(); }
  }
  assert.deepEqual(report.pageErrors, []);
  assert.equal(await readFile(join(dist, 'openblock.html'), 'utf8'), html);
  assert.equal(sha(await readFile(join(dist, 'assets/editor-0hVWSKVB.js'))), editorSha256);
  pass('No page exceptions and frozen dist bytes', { pageErrors: 0, editorSha256 });
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  console.error(error);
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: join(out, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close();
  await vite?.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
  api?.getHttpServer().closeAllConnections();
  await api?.close();
  assert.equal(dirname(await realpath(temp)), tempRoot);
  await rm(temp, { recursive: true, force: true });
  report.cleaned = true;
  await writeFile(join(out, 'result.json'), JSON.stringify(report, null, 2));
}

