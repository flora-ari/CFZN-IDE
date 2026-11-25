import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const web = join(root, 'apps/web');
const dist = join(web, 'dist');
const out = join(import.meta.dirname, 'evidence/mindplus-desktop-library');
const require = createRequire(import.meta.url);
const { unzipSync } = require('../apps/web/node_modules/fflate');
const historical = 'evidence/controller-catalog-consistency/2026-11-11T08-10-52-878Z/dist-catalog-metadata.json';
const baseline = JSON.parse(await readFile(join(import.meta.dirname, historical))).expected;
const controllerIds = baseline.map(row => row.id);
const moduleIds = ['activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments'];
const moduleTypes = ['全部', '传感器', '执行器', '功能模块'];
const frozenEditor = 'editor-CyzMayYi.js';
const sha = value => createHash('sha256').update(value).digest('hex');
const results = { cases: [], pageErrors: [], blocked: [], failedResponses: [], persistence: {} };
const servers = [];
let browser, api, vite;

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

async function listen(server) {
  servers.push(server);
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  return 'http://127.0.0.1:' + server.address().port;
}

function proxy(req, res, origin) {
  const upstream = request(new URL(req.url, origin), { method: req.method, headers: req.headers }, reply => {
    res.writeHead(reply.statusCode, reply.headers);
    reply.pipe(res);
  });
  upstream.on('error', () => {
    res.writeHead(502).end();
  });
  req.pipe(upstream);
}

async function check(name, run) {
  try {
    const evidence = await run();
    results.cases.push({ name, status: 'PASS', evidence });
    console.log('PASS', name);
  } catch (error) {
    results.cases.push({ name, status: 'FAIL', error: error.stack });
    console.error('FAIL', name, error);
  }
}

async function withPage(origin, label, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'serial', { configurable: true, value: {
        getPorts: async () => [],
        requestPort: async () => {
          window.__qaSerialRequests = (window.__qaSerialRequests || 0) + 1;
          throw Error('Physical serial is outside this test');
        },
      } });
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && !url.pathname.startsWith('/api/v1/hardware')) return route.continue();
      results.blocked.push({ label, url: url.href });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => results.pageErrors.push({ label, error: String(error) }));
    page.on('response', res => {
      if (res.status() >= 400) results.failedResponses.push({ label, path: new URL(res.url()).pathname, status: res.status() });
    });
    await page.goto(origin);
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#boot-message')).toBeHidden({ timeout: 60000 });
    await expect(frame.getByTestId('save-project')).toBeEnabled({ timeout: 30000 });
    await frame.locator('body').evaluate(() => {
      const original = CFZNOpenBlock.renderLibrary;
      CFZNOpenBlock.renderLibrary = (...args) => {
        window.__qaVm = args[2].vm;
        window.__qaControllerCatalog = args[2].deviceData;
        return original(...args);
      };
    });
    const evidence = await run({ page, frame, label });
    assert.equal(await frame.locator('body').evaluate(() => window.__qaSerialRequests || 0), 0);
    return evidence;
  } finally {
    await context.close();
  }
}

const controls = s => s.frame.locator('.cfzn-extension-controls');
const button = (s, name) => s.frame.getByRole('button', { name, exact: true });
const checkbox = (s, name) => s.frame.getByRole('checkbox', { name, exact: true });
const search = s => s.frame.locator('input[class*="library_filter-input"]');
const card = (s, kind, id) => s.frame.locator('[data-cfzn-library-card="' + kind + '-' + id + '"]');
const rows = s => s.frame.locator('[data-cfzn-library-card]');
const select = (s, kind, id) => card(s, kind, id).locator('.cfzn-card-select');
const list = s => s.frame.locator('[class*="library_filter-bar"]').locator('xpath=following-sibling::div[1]');
const status = s => s.frame.locator('.cfzn-extension-status');

async function back(s) {
  if (await controls(s).isVisible()) await s.frame.getByText('返回', { exact: true }).click();
}

async function open(s, entry = 'bottom') {
  await back(s);
  if (entry === 'bottom') {
    await s.frame.locator('[class*="extension-button"]').first().click();
    await expect(button(s, '主控扩展')).toHaveAttribute('aria-pressed', 'true');
  } else {
    await s.frame.locator('[data-cfzn-menu-host] img[class*="device-icon"]').click();
    await expect(s.frame.getByText('选择主控', { exact: true })).toBeVisible();
  }
  await expect(controls(s)).toHaveAttribute('data-category', 'controllers');
}

async function mode(s, name) {
  await back(s);
  const item = button(s, name);
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
}

async function clickCard(s, kind, id) {
  await select(s, kind, id).click();
  await expect(card(s, kind, id)).toHaveAttribute('data-cfzn-selected', 'true', { timeout: 30000 });
  await expect(status(s)).not.toContainText('正在');
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

async function ids(s) {
  return rows(s).evaluateAll(nodes => nodes.map(node => node.dataset.cfznLibraryCard.replace(/^(controller|module)-/, '')));
}

async function groups(s) {
  const visible = await s.frame.locator('[data-cfzn-module-group]').evaluateAll(sections => sections.map(section => [
    section.dataset.cfznModuleGroup,
    [...section.querySelectorAll('[data-cfzn-library-card]')].map(node => node.dataset.cfznLibraryCard.slice(7)),
  ]));
  const all = visible.flatMap(([, entries]) => entries);
  assert.equal(new Set(all).size, all.length);
  return Object.fromEntries(visible);
}

async function badges(s, label, enabled) {
  const data = await rows(s).evaluateAll(nodes => nodes.map(root => {
    const badge = root.querySelector('.cfzn-card-compatibility');
    const a = root.getBoundingClientRect(), b = badge.getBoundingClientRect(), css = getComputedStyle(root);
    const action = root.querySelector('.cfzn-card-select');
    return { id: root.dataset.cfznLibraryCard, label: badge.textContent, direct: badge.parentElement === root,
      top: b.top - a.top - parseFloat(css.borderTopWidth),
      right: a.right - b.right - parseFloat(css.borderRightWidth),
      disabled: action.getAttribute('aria-disabled'), support: badge.title };
  }));
  assert.equal(data.length, 6);
  for (const item of data) {
    assert.equal(item.label, label);
    assert.equal(item.direct, true);
    assert.ok(Math.abs(item.top) < 1 && Math.abs(item.right) < 1, JSON.stringify(item));
    assert.equal(item.disabled, String(!enabled));
    assert.match(item.support, /Arduino Uno.*FireBeetle ESP32-E/);
  }
  return data;
}

async function atViewport(s, size, action) {
  const original = s.page.viewportSize();
  await s.page.setViewportSize(size);
  try {
    return await action();
  } finally {
    await s.page.setViewportSize(original);
  }
}

async function verifyReset(s, action) {
  const scroller = list(s);
  await expect(scroller).toHaveCount(1);
  await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.ok(await scroller.evaluate(el => el.scrollTop) > 0, 'test must start with actual scrolling');
  await action();
  await expect(search(s)).toHaveValue('');
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
}

async function controllers(s) {
  const evidence = {};
  for (const [label, modeName] of [['realtime', '编程模式'], ['upload', '上传模式']]) {
    await mode(s, modeName);
    await open(s);
    await expect(rows(s)).toHaveCount(20);
    if (label === 'realtime') await clickCard(s, 'controller', 'arduinoUno');
    const before = await bridge(s, 'GET_STATE');
    const expectedByMode = await s.frame.locator('body').evaluate((_, modeName) =>
      window.__qaControllerCatalog.filter(item => item.deviceId && item.deviceId !== 'null' && !item.hide &&
        item.programMode?.includes(modeName)).map(item => item.deviceId), label);
    assert.ok(expectedByMode.includes('arduinoUno'));
    assert.equal(expectedByMode.includes('firebeetleEsp32E'), label === 'upload');
    const comparisons = {};
    for (const entry of ['bottom', 'top']) {
      await open(s, entry);
      await expect(checkbox(s, '仅当前模式')).not.toBeChecked();
      assert.deepEqual(await ids(s), controllerIds);
      const details = await rows(s).evaluateAll(nodes => nodes.map(node => {
        const action = node.querySelector('.cfzn-card-select');
        return { id: node.dataset.cfznLibraryCard.slice(11), name: action.getAttribute('aria-label'),
          icon: new URL(node.querySelector('img[class*="library-item_featured-image_"]').src).pathname,
          description: node.querySelector('[class*="library-item_featured-description"]').textContent,
          disabled: action.getAttribute('aria-disabled') === 'true' };
      }));
      assert.deepEqual(details, baseline.map(row => ({ ...row, icon: new URL(row.icon).pathname })));
      await expect(status(s)).toHaveText('当前主控：Arduino Uno');
      const uno = card(s, 'controller', 'arduinoUno');
      await expect(uno).toHaveAttribute('data-cfzn-selected', 'true');
      assert.equal(await uno.evaluate(node => getComputedStyle(node).borderTopColor), 'rgb(76, 151, 255)');
      await expect(uno.getByRole('button', { name: '移除 Arduino Uno' })).toBeEnabled();
      await checkbox(s, '仅当前模式').check();
      assert.deepEqual(await ids(s), expectedByMode);
      await search(s).fill('aRdUiNoUnO');
      const byId = expectedByMode.filter(id => id.toLowerCase().includes('arduinouno'));
      assert.deepEqual(await ids(s), byId);
      await search(s).fill('电子编程入门');
      assert.deepEqual(await ids(s), ['arduinoUno']);
      await search(s).fill('aRdUiNoUnO');
      await checkbox(s, '已加载').check();
      assert.deepEqual(await ids(s), ['arduinoUno']);
      await search(s).fill('ZZ-NO-CONTROLLER');
      await expect(s.frame.getByText('没有符合筛选条件的扩展')).toBeVisible();
      await button(s, '清除筛选').click();
      assert.deepEqual(await ids(s), controllerIds);
      await expect(checkbox(s, '仅当前模式')).not.toBeChecked();
      await expect(checkbox(s, '已加载')).not.toBeChecked();
      assert.deepEqual(await bridge(s, 'GET_STATE'), before);
      comparisons[entry] = { orderedModeIds: expectedByMode, byId, descriptionOnly: ['arduinoUno'], intersection: ['arduinoUno'] };
    }
    assert.deepEqual(comparisons.bottom, comparisons.top);
    evidence[label] = comparisons.bottom;
  }
  return { baseline: controllerIds, ...evidence };
}

async function compatibility(s) {
  const before = await bridge(s, 'GET_STATE');
  await open(s);
  await button(s, '模块扩展').click();
  await expect(rows(s)).toHaveCount(0);
  await expect(s.frame.getByText(/请先选择主控板/)).toBeVisible();
  await button(s, '选择主控').click();
  await expect(button(s, '主控扩展')).toBeFocused();
  await button(s, '模块扩展').click();
  await checkbox(s, '显示全部模块').check();
  assert.deepEqual(await groups(s), { unavailable: moduleIds });
  const noBoard = await badges(s, '未选择主控板', false);
  await select(s, 'module', 'activateBuzzer').press('Enter');
  assert.deepEqual(await bridge(s, 'GET_STATE'), before);
  await button(s, '主控扩展').click();
  await clickCard(s, 'controller', 'microbit');
  const afterBoard = await bridge(s, 'GET_STATE');
  await open(s);
  await button(s, '模块扩展').click();
  await expect(checkbox(s, '显示全部模块')).not.toBeChecked();
  await expect(rows(s)).toHaveCount(0);
  await expect(s.frame.getByText(/当前分类没有兼容此主控的模块/)).toBeVisible();
  await checkbox(s, '显示全部模块').check();
  assert.deepEqual(await groups(s), { unavailable: moduleIds });
  const unsupported = await badges(s, '不支持当前主控', false);
  await select(s, 'module', 'pirSensor').press('Space');
  assert.deepEqual(await bridge(s, 'GET_STATE'), afterBoard);
  await checkbox(s, '显示全部模块').uncheck();
  await expect(rows(s)).toHaveCount(0);
  return { noBoard, unsupported, incompatibleDevice: 'microbit' };
}

async function filtersAndGroups(s) {
  await open(s);
  await clickCard(s, 'controller', 'arduinoUno');
  const before = await bridge(s, 'GET_STATE');
  await atViewport(s, { width: 780, height: 650 }, async () => {
    await search(s).fill('aRdUiNo');
    await verifyReset(s, () => button(s, '模块扩展').click());
  });
  const compatible = await badges(s, '兼容当前主控', true);
  await expect(s.frame.getByText('积木仅上传模式', { exact: true })).toHaveCount(6);
  assert.deepEqual(await groups(s), { available: moduleIds });
  await atViewport(s, { width: 390, height: 844 }, async () => {
    await search(s).fill('传感器');
    await verifyReset(s, () => button(s, '传感器').click());
    assert.deepEqual(await ids(s), moduleIds.slice(2, 5));
  });
  await search(s).fill('数字输入');
  assert.deepEqual(await ids(s), ['pirSensor']);
  await search(s).fill('AcTuAtOr');
  await expect(rows(s)).toHaveCount(0);
  await expect(s.frame.getByRole('group', { name: '扩展类型' }).getByRole('button')).toHaveText(moduleTypes);
  await button(s, '清除筛选').click();
  await expect(search(s)).toHaveValue('');
  await expect(checkbox(s, '显示全部模块')).not.toBeChecked();
  await expect(button(s, '全部')).toBeFocused();
  await search(s).fill('AcTuAtOr');
  assert.deepEqual(await ids(s), moduleIds.slice(0, 2));
  await checkbox(s, '仅当前模式').check();
  await expect(search(s)).toHaveValue('AcTuAtOr');
  await expect(s.frame.getByText(/在编程模式下没有可用模块/)).toBeVisible();
  await button(s, '清除筛选').click();
  assert.deepEqual(await groups(s), { available: moduleIds });
  assert.deepEqual(await bridge(s, 'GET_STATE'), before);

  await clickCard(s, 'module', 'activateBuzzer');
  assert.deepEqual(await groups(s), { loaded: ['activateBuzzer'], available: moduleIds.slice(1) });
  assert.equal((await bridge(s, 'GET_STATE')).editVersion, before.editVersion + 1);
  await back(s);
  await expect(s.frame.locator('.scratchCategoryMenuItemLabel').getByText('有源蜂鸣器', { exact: true })).toBeVisible();
  await mode(s, '上传模式');
  await open(s);
  await button(s, '模块扩展').click();
  await checkbox(s, '仅当前模式').check();
  assert.deepEqual(await groups(s), { loaded: ['activateBuzzer'], available: moduleIds.slice(1) });
  if (s.label === 'dist') {
    await atViewport(s, { width: 1610, height: 1230 }, () => s.page.screenshot({ path: join(out, 'dist-module-groups.png') }));
  }
  const loaded = await bridge(s, 'GET_STATE');
  await checkbox(s, '已加载').check();
  assert.deepEqual(await groups(s), { loaded: ['activateBuzzer'] });
  await search(s).fill('PiRsEnSoR');
  await expect(rows(s)).toHaveCount(0);
  await search(s).fill('');
  assert.deepEqual(await bridge(s, 'GET_STATE'), loaded);

  const mobile = await atViewport(s, { width: 390, height: 844 }, async () => {
    const remove = button(s, '移除 有源蜂鸣器');
    const geometry = {};
    for (const [name, item] of [['search', search(s)], ['mode', checkbox(s, '仅当前模式')], ['remove', remove]]) {
      await item.scrollIntoViewIfNeeded();
      const box = await item.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, JSON.stringify(box));
      geometry[name] = box;
    }
    if (s.label === 'dist') await s.page.screenshot({ path: join(out, 'dist-module-390.png') });
    await remove.press('Enter');
    await expect(rows(s)).toHaveCount(0);
    await expect(button(s, '全部')).toBeFocused();
    await button(s, '清除筛选').press('Enter');
    assert.deepEqual(await groups(s), { available: moduleIds });
    return geometry;
  });
  assert.equal((await bridge(s, 'GET_STATE')).editVersion, loaded.editVersion + 1);
  await button(s, '舞台扩展').click();
  await expect(controls(s)).toHaveAttribute('data-category', 'stage');
  await expect(search(s)).toHaveValue('');
  assert.ok(await list(s).locator('img').count() > 0, 'native stage cards are available');
  return { compatible, mobile, addAndRemoveEdits: [before.editVersion, before.editVersion + 1, loaded.editVersion + 1] };
}

const projectPath = '/api/v1/projects';

function archiveInfo(bytes) {
  const files = unzipSync(bytes);
  const project = JSON.parse(Buffer.from(files['project.json']).toString());
  const assets = [];
  for (const [targetIndex, target] of project.targets.entries()) {
    for (const kind of ['costumes', 'sounds']) {
      for (const [index, asset] of target[kind].entries()) {
        const key = asset.md5ext || asset.assetId + '.' + asset.dataFormat;
        assert.ok(files[key]?.length, key);
        assets.push({ targetIndex, target: target.name, kind, index, name: asset.name, sha256: sha(files[key]), key });
      }
    }
  }
  return { project, assets };
}

async function persistence(origin, label, dataDir) {
  const sample = {};
  let saved;
  const requests = [];
  const record = req => {
    const path = new URL(req.url()).pathname;
    if (path.startsWith(projectPath) && !['GET', 'HEAD'].includes(req.method())) requests.push({ path, method: req.method() });
  };
  await withPage(origin, label + '-save', async s => {
    s.page.on('request', record);
    await mode(s, '上传模式');
    await open(s);
    await expect(rows(s)).toHaveCount(20);
    await clickCard(s, 'controller', 'arduinoUno');
    await button(s, '模块扩展').click();
    await clickCard(s, 'module', 'activateBuzzer');
    await back(s);

    // Read the real Blockly object through the same upstream GUI event used by the adapter.
    await s.frame.locator('body').evaluate(() =>
      window.__qaVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: Blockly => (window.__qaBlockly = Blockly) }));
    await s.frame.locator('.scratchCategoryMenuItemLabel').getByText('有源蜂鸣器', { exact: true }).click();
    const flyout = s.frame.locator('.blocklyFlyout');
    await expect(flyout.first()).toBeVisible();
    const from = await s.frame.locator('body').evaluate(async () => {
      const item = window.__qaBlockly.getMainWorkspace().getFlyout().getFlyoutItems().find(b => b.type === 'activeBuzzer_init');
      if (!item || item.disabled) throw Error('Buzzer block is absent or disabled in the real flyout');
      const view = item.getSvgRoot();
      let previous, stable = 0;
      const deadline = performance.now() + 2500;
      while (stable < 8 && performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        const y = view.getBoundingClientRect().y;
        stable = Math.abs(y - previous) < 0.1 ? stable + 1 : 0;
        previous = y;
      }
      return view.getBoundingClientRect().toJSON();
    });
    const box = await s.page.locator('iframe').boundingBox();
    const workspace = await s.frame.locator('.blocklyMainBackground').first().boundingBox();
    await s.page.mouse.move(box.x + from.x + 30, box.y + from.y + from.height / 2);
    await s.page.mouse.down();
    await s.page.mouse.move(workspace.x + workspace.width * 0.65, workspace.y + workspace.height * 0.42, { steps: 24 });
    await s.page.mouse.up();
    const realFrame = await (await s.page.locator('iframe').elementHandle()).contentFrame();
    await realFrame.waitForFunction(() => Object.values(window.__qaVm.editingTarget.blocks._blocks)
      .some(b => b.opcode === 'activeBuzzer_init' && !b.shadow));
    const block = await realFrame.evaluate(() => {
      const workspace = window.__qaBlockly.getMainWorkspace();
      const b = workspace.getAllBlocks(false).find(item => item.type === 'activeBuzzer_init');
      // Attach the block dragged from the palette to an Arduino setup hat so generated source reflects it.
      const hat = workspace.newBlock('event_whenarduinobegin');
      hat.initSvg();
      hat.render();
      hat.moveBy(320, 120);
      hat.nextConnection.connect(b.previousConnection);
      return { id: b.id, hatId: hat.id };
    });
    await realFrame.waitForFunction(({ id, hatId }) =>
      window.__qaVm.editingTarget.blocks.getBlock(hatId)?.next === id, block);
    const generated = await realFrame.evaluate(() => window.__qaBlockly.Arduino.workspaceToCode(window.__qaBlockly.getMainWorkspace()));
    assert.match(generated, /pinMode\(activeBuzzerPin, OUTPUT\)/);
    sample.generatedLines = generated.split('\n').filter(line => line.includes('activeBuzzerPin'));
    sample.block = block;
    await open(s);
    await button(s, '模块扩展').click();
    await expect(button(s, '移除 有源蜂鸣器')).toBeDisabled();
    await back(s);

    const response = s.page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === projectPath);
    await s.frame.getByTestId('save-project').click();
    const created = await response;
    assert.equal(created.status(), 201);
    assert.equal(created.headers().etag, '"1"');
    saved = (await created.json()).project;
    assert.equal(saved.revision, 1);
    await expect(s.frame.getByTestId('project-status')).toContainText('已保存 · v1');
    const posted = created.request();
    const body = new Response(posted.postDataBuffer(), { headers: { 'content-type': posted.headers()['content-type'] } });
    const archive = (await body.formData()).get('file');
    assert.ok(archive instanceof File);
    const sentBytes = Buffer.from(await archive.arrayBuffer());

    const path = projectPath + '/' + saved.id + '/content';
    const downloaded = await fetch(origin + path, { headers: { 'If-Match': '"1"' } });
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('etag'), '"1"');
    assert.match(downloaded.headers.get('content-disposition'), /attachment/);
    assert.match(downloaded.headers.get('content-type'), /^application\/x\.openblock\.ob/);
    const receivedBytes = Buffer.from(await downloaded.arrayBuffer());
    const directory = join(dataDir, 'projects', saved.id);
    const metadataBytes = await readFile(join(directory, 'metadata.json'));
    const diskMeta = JSON.parse(metadataBytes);
    const diskBytes = await readFile(join(directory, diskMeta.archiveFile));
    assert.deepEqual(diskMeta.project, saved);
    assert.deepEqual(receivedBytes, sentBytes);
    assert.deepEqual(diskBytes, sentBytes);
    assert.equal(sentBytes.length, saved.sizeBytes);
    const { project, assets } = archiveInfo(diskBytes);
    assert.equal(project.device.deviceId, 'arduinoUno');
    assert.equal(project.programMode, 'upload');
    assert.deepEqual(project.deviceExtensions, ['activateBuzzer']);
    const graph = project.targets.find(t => t.blocks[block.id]).blocks;
    assert.equal(graph[block.id].opcode, 'activeBuzzer_init');
    assert.equal(graph[block.hatId].next, block.id);
    assert.ok(assets.length > 0);
    Object.assign(sample, { saved, sha256: sha(diskBytes), assets, blockRecord: graph[block.id] });

    const clean = await bridge(s, 'GET_STATE');
    assert.equal(clean.dirty, false);
    await open(s);
    await button(s, '模块扩展').click();
    await search(s).fill('no-match-qa');
    await checkbox(s, '仅当前模式').check();
    await checkbox(s, '已加载').check();
    await checkbox(s, '显示全部模块').check();
    await button(s, '清除筛选').click();
    await button(s, '执行器').click();
    await button(s, '舞台扩展').click();
    await back(s);
    assert.deepEqual(await bridge(s, 'GET_STATE'), clean);
    assert.deepEqual(requests, [{ path: projectPath, method: 'POST' }]);
    assert.deepEqual(await readFile(join(directory, 'metadata.json')), metadataBytes);
    assert.deepEqual(await readFile(join(directory, diskMeta.archiveFile)), diskBytes);
    sample.cleanSnapshot = clean;
  });

  await withPage(origin, label + '-reopen', async s => {
    s.page.on('request', record);
    const downloaded = s.page.waitForResponse(r => new URL(r.url()).pathname === projectPath + '/' + saved.id + '/content');
    await s.frame.getByTestId('project-list-button').click();
    await s.page.locator('[data-project-id="' + saved.id + '"]').getByRole('button', { name: '打开', exact: true }).click();
    const loaded = await downloaded;
    assert.equal(loaded.status(), 200);
    assert.equal(loaded.headers().etag, '"1"');
    assert.equal(loaded.request().headers()['if-match'], '"1"');
    assert.equal(sha(await loaded.body()), sample.sha256);
    await expect(s.page.getByTestId('project-notice')).toContainText('已打开', { timeout: 30000 });
    await expect(button(s, '上传模式')).toHaveAttribute('aria-pressed', 'true');
    await expect(s.frame.getByTestId('project-status')).toContainText('已保存 · v1');
    await open(s);
    await expect(card(s, 'controller', 'arduinoUno')).toHaveAttribute('data-cfzn-selected', 'true');
    await button(s, '模块扩展').click();
    assert.deepEqual(await groups(s), { loaded: ['activateBuzzer'], available: moduleIds.slice(1) });
    await back(s);
    const { project, assets } = archiveInfo(Buffer.from(await bridge(s, 'EXPORT_PROJECT')));
    assert.equal(project.device.deviceId, 'arduinoUno');
    assert.deepEqual(project.deviceExtensions, ['activateBuzzer']);
    const graph = project.targets.find(t => t.blocks[sample.block.id]).blocks;
    assert.equal(graph[sample.block.hatId].next, sample.block.id);
    assert.deepEqual(graph[sample.block.id], sample.blockRecord);
    const assetContent = entries => entries.map(({ key, ...asset }) => asset);
    assert.deepEqual(assetContent(assets), assetContent(sample.assets));
    assert.deepEqual(requests, [{ path: projectPath, method: 'POST' }]);
    sample.reopen = { ifMatch: '"1"', etag: '"1"', freshContext: true, assets: assets.length,
      reexportRenamedKeys: assets.flatMap(({ key }, index) => key === sample.assets[index].key ? [] : [{ saved: sample.assets[index].key, reexport: key }]) };
  });
  results.persistence[label] = sample;
  return { id: saved.id, sha256: sample.sha256, block: sample.block.id, assets: sample.reopen.assets };
}

function upstreamModules(upstream, local, runtime) {
  const reference = require('../apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json');
  const slices = buffer => {
    const markers = [...buffer.toString('latin1').matchAll(/^\/\* (\d+) \*\//gm)];
    return new Map(markers.map((marker, i) => [marker[1], buffer.subarray(marker.index, markers[i + 1]?.index)]));
  };
  const [original, shipped] = [upstream, local].map(slices);
  assert.deepEqual(runtime, local, 'dev and dist vendored GUI agree byte for byte');
  const groups = {};
  for (const [group, count] of [['vm', 178], ['blockly', 15]]) {
    const entries = reference[group];
    assert.equal(new Set(entries.map(({ id }) => id)).size, count);
    const digests = entries.map(({ id }) => {
      const a = original.get(id), b = shipped.get(id);
      assert.ok(a && b, group + ' module ' + id);
      assert.ok(a.equals(b), group + ' module ' + id);
      return id + ':' + a.length + ':' + sha(a);
    });
    groups[group] = { count, manifestSha256: sha(digests.join('\n')) };
  }
  return { upstreamSha256: sha(upstream), devDistGuiSha256: sha(local), groups };
}

const temp = await mkdtemp(join(await realpath(tmpdir()), 'cfzn-desktop-library-'));
const dataDir = join(temp, 'data');
await mkdir(out, { recursive: true });
try {
  const html = await readFile(join(dist, 'openblock.html'), 'utf8');
  assert.ok(html.includes('/assets/' + frozenEditor));
  const editorPath = join(dist, 'assets', frozenEditor);
  const guiPath = 'openblock-vendor/openblock-gui.js';
  const gui = await readFile(join(dist, guiPath));
  const editorSha = sha(await readFile(editorPath));
  await check('VM and Blockly exact upstream module bytes', async () => {
    const tarball = join(root, '.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz');
    const upstream = execFileSync('tar', ['-xOf', tarball, 'package/dist/openblock-gui.js'], { maxBuffer: 100 * 1024 * 1024 });
    return upstreamModules(upstream, gui, await readFile(join(root, '.runtime/web-openblock', guiPath)));
  });
  api = await require('../apps/api/dist/app.js').createApp(dataDir);
  await api.listen(0, '127.0.0.1');
  const apiOrigin = await api.getUrl();
  const devServer = createServer();
  const viteModule = await import(pathToFileURL(require.resolve('vite', { paths: [web] })).href);
  vite = await viteModule.createServer({
    root: web, configFile: join(web, 'vite.config.ts'), cacheDir: join(temp, 'vite-cache'),
    server: { middlewareMode: true, hmr: { server: devServer }, proxy: { '/api': apiOrigin } },
  });
  devServer.on('request', vite.middlewares);
  const devOrigin = await listen(devServer);
  const distServer = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) return proxy(req, res, apiOrigin);
    const file = resolve(dist, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
    if (!file.startsWith(dist + sep)) return res.writeHead(403).end();
    const stream = createReadStream(file);
    stream.on('open', () => {
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
      stream.pipe(res);
    });
    stream.on('error', () => res.writeHead(404).end());
  });
  const distOrigin = await listen(distServer);
  const generatorPath = '/cfzn-extensions/extensions/activateBuzzer/generator.mjs';
  results.environment = { editor: frozenEditor, editorSha, devOrigin, distOrigin, apiOrigin, mime: {} };
  for (const [label, origin] of [['dev', devOrigin], ['dist', distOrigin]]) {
    const response = await fetch(origin + generatorPath);
    assert.equal(response.status, 200);
    const contentType = response.headers.get('content-type');
    assert.match(contentType, /javascript/);
    results.environment.mime[label] = contentType;
    await response.arrayBuffer();
  }
  browser = await chromium.launch({
    executablePath: process.env.CFZN_TEST_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  results.environment.browser = browser.version();
  for (const [label, origin] of [['dev', devOrigin], ['dist', distOrigin]]) {
    if (process.env.CFZN_TEST_SURFACE && label !== process.env.CFZN_TEST_SURFACE) continue;
    for (const [name, run] of [['controller parity', controllers], ['compatibility and corner badges', compatibility],
      ['module grouping, filters, keyboard, mobile, and stage', filtersAndGroups]]) {
      if (process.env.CFZN_TEST_CASE && !name.includes(process.env.CFZN_TEST_CASE)) continue;
      await check(label + ' ' + name, () => withPage(origin, label, run));
    }
    if (!process.env.CFZN_TEST_CASE || 'persistence'.includes(process.env.CFZN_TEST_CASE)) {
      await check(label + ' persistence', () => persistence(origin, label, dataDir));
    }
  }
  await check('no page exceptions and frozen editor bytes', async () => {
    assert.deepEqual(results.pageErrors, []);
    assert.equal(sha(await readFile(editorPath)), editorSha);
    return { pageErrors: 0, editorSha };
  });
} catch (error) {
  results.cases.push({ name: 'test setup or execution', status: 'FAIL', error: error.stack });
  console.error(error);
} finally {
  const cleanup = [];
  for (const close of [
    () => browser?.close(),
    () => vite?.close(),
    ...servers.map(server => () => new Promise(done => { server.closeAllConnections(); server.close(done); })),
    () => { api?.getHttpServer().closeAllConnections(); return api?.close(); },
    async () => {
      assert.equal(dirname(await realpath(temp)), await realpath(tmpdir()));
      await rm(temp, { recursive: true, force: true });
    },
  ]) {
    try { await close(); } catch (error) { cleanup.push(String(error)); }
  }
  results.cleanupErrors = cleanup;
  await writeFile(join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  if (cleanup.length || results.cases.some(item => item.status === 'FAIL')) process.exitCode = 1;
}
