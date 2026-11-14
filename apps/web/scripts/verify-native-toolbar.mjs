import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const web = fileURLToPath(new URL('../', import.meta.url));
const placementOnly = process.argv.includes('--placement');
const output = resolve(web, placementOnly ? 'evidence/native-menu-toolbar' : 'evidence/native-toolbar'); await mkdir(output, { recursive: true });
const temporary = await mkdtemp(resolve(web, '.runtime-toolbar-'));
process.env.PROJECT_DATA_DIR = temporary;
const { createApp } = createRequire(import.meta.url)('../../api/dist/app.js');
const api = await createApp(); await api.listen(0, '127.0.0.1');
const apiBase = await api.getUrl();
const dist = resolve(web, 'dist');
let failWrite = false, holdWrite, writeArrived;
const calls = [];
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local').pathname;
    if (path.startsWith('/api/')) {
      calls.push({ method: req.method, path });
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      if (req.method === 'PUT' && failWrite) {
        res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'STORAGE_ERROR', message: 'Injected save failure' } })); return;
      }
      if (req.method === 'PUT' && holdWrite) { writeArrived?.(); await holdWrite; }
      const headers = { ...req.headers }; delete headers.host; delete headers.connection;
      const response = await fetch(`${apiBase}${req.url}`, { method: req.method, headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const file = resolve(dist, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
    if (!file.startsWith(dist + sep)) throw new Error('Invalid static path');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' };
    const stream = createReadStream(file);
    stream.on('error', () => { if (!res.headersSent) res.writeHead(404); res.end(); });
    res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); stream.pipe(res);
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = []; page.on('pageerror', error => errors.push(String(error)));
await page.addInitScript(() => {
  window.serialRequests = 0;
  Object.defineProperty(navigator, 'serial', { value: { requestPort() { window.serialRequests++; return Promise.reject(new DOMException('Canceled', 'NotFoundError')); }, addEventListener() {}, removeEventListener() {} } });
});
const checks = {};
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.locator('iframe').waitFor();
  const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForURL(/openblock\.html/, { waitUntil: 'domcontentloaded' });
  await frame.getByTestId('save-project').waitFor();
  await frame.waitForFunction(() => !document.querySelector('[data-testid="save-project"]').disabled);
  assert.equal(await page.locator('.app-bar, header').count(), 0);
  const host = frame.locator('[data-cfzn-menu-host]');
  assert.ok((await host.getAttribute('class')).includes('menu-bar_menu-bar_JcuHF'));
  assert.equal(await host.locator(':scope > .cfzn-project-tools button').count(), 5);
  assert.equal(await frame.getByTestId('serial-button').count(), 0);
  assert.equal(await frame.locator('[data-cfzn-alert-host], [data-cfzn-editor-body]').count(), 0);
  assert.equal(await frame.getByText('文件', { exact: true }).count(), 0);
  assert.equal(await frame.getByTestId('project-status').innerText(), '未保存项目');
  checks.nativePlacement = true;
  await page.screenshot({ path: resolve(output, 'initial-native-1440.png') });
  const title = frame.locator('input[class*="title-field"]');
  assert.equal(await title.count(), 1, JSON.stringify(await frame.locator('input').evaluateAll(items => items.map(item => ({ className: item.className, value: item.value })))));
  const setTitle = async text => { await title.fill(text); await title.press('Tab'); };
  const saved = async revision => frame.waitForFunction(revision => document.querySelector('[data-testid="project-status"]').textContent === `已保存 · v${revision}`, revision);
  const dirty = async () => frame.waitForFunction(() => document.querySelector('[data-testid="project-status"]').textContent === '未保存的更改');
  const downloaded = page.waitForEvent('download'); await frame.getByTestId('export-project').click();
  const download = await downloaded; const archive = await readFile(await download.path());
  const chooser = page.waitForEvent('filechooser'); await frame.getByTestId('import-project').click();
  await (await chooser).setFiles({ name: 'native-import.ob', mimeType: 'application/x.openblock.ob', buffer: archive });
  await dirty(); checks.importUserGesture = true;
  await setTitle('Native toolbar check'); await frame.getByTestId('save-project').click(); await saved(1);
  if (!placementOnly) {
  await frame.getByTestId('save-project').click(); await saved(2); checks.createAndUpdate = true;
  await setTitle('Captured earlier edit'); await dirty(); failWrite = true;
  await frame.getByTestId('save-project').click(); await page.getByTestId('project-notice').filter({ hasText: 'Injected save failure' }).waitFor();
  await dirty(); failWrite = false; checks.saveFailure = true;
  let release; holdWrite = new Promise(resolve => { release = resolve; });
  const arrived = new Promise(resolve => { writeArrived = resolve; });
  await frame.getByTestId('save-project').click(); await arrived;
  await setTitle('Later unsaved edit'); release(); holdWrite = null;
  await page.getByTestId('project-notice').filter({ hasText: '已保存较早版本' }).waitFor(); await dirty(); checks.saveWhileEditing = true;
  const projects = (await (await fetch(`${apiBase}/api/v1/projects`)).json()).items;
  const current = projects[0];
  const external = await fetch(`${apiBase}/api/v1/projects/${current.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'If-Match': `"${current.revision}"` }, body: JSON.stringify({ name: 'External revision' }) });
  assert.equal(external.status, 200);
  await frame.getByTestId('save-project').click(); await page.getByRole('button', { name: '另存为新项目', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '重新载入', exact: true }).count(), 1);
  await dirty(); await page.getByRole('button', { name: '另存为新项目', exact: true }).click(); await saved(1); checks.conflictRecovery = true;
  await setTitle('Export stays dirty'); await dirty();
  const writes = calls.filter(call => ['POST', 'PUT', 'PATCH'].includes(call.method)).length;
  const download2 = page.waitForEvent('download'); await frame.getByTestId('export-project').click(); await download2; await dirty();
  assert.equal(calls.filter(call => ['POST', 'PUT', 'PATCH'].includes(call.method)).length, writes); checks.exportKeepsDirty = true;
  const canceled = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await frame.getByTestId('new-project').click(); await canceled; await dirty();
  const confirmed = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await frame.getByTestId('new-project').click(); await confirmed;
  await frame.waitForFunction(() => document.querySelector('[data-testid="project-status"]').textContent === '未保存项目'); checks.newProtection = true;
  await frame.getByTestId('project-list-button').click(); await page.getByTestId('project-panel').waitFor();
  assert.equal(await frame.getByTestId('project-list-button').getAttribute('aria-expanded'), 'true');
  await page.getByTestId('project-row').filter({ hasText: 'Later unsaved edit' }).getByRole('button', { name: '打开', exact: true }).click(); await saved(1); checks.reopen = true;
  } else {
    const nextDownload = page.waitForEvent('download'); await frame.getByTestId('export-project').click(); await nextDownload;
    await saved(1); checks.saveExport = true;
  }
  await frame.evaluate(() => { const render = CFZNOpenBlock.renderLibrary; CFZNOpenBlock.renderLibrary = (...args) => { window.testVm = args[2].vm; return render(...args); }; });
  await frame.getByTestId('project-list-button').click();
  await frame.waitForFunction(() => document.querySelector('[data-testid="project-list-button"]').getAttribute('aria-expanded') === 'true');
  await frame.locator('[class*="extension-button"]').first().click();
  assert.equal(await frame.locator('.cfzn-project-tools').isVisible(), false);
  await page.getByTestId('project-panel').waitFor({ state: 'hidden' });
  await frame.getByRole('button', { name: '主控扩展', exact: true }).waitFor();
  await frame.getByText('返回', { exact: true }).click(); await frame.locator('.cfzn-project-tools').waitFor({ state: 'visible' }); checks.extensionLibrary = true;
  await frame.getByAltText(/全屏|full screen/i).click();
  await frame.locator('.cfzn-project-tools').waitFor({ state: 'hidden' });
  await frame.getByAltText(/全屏|full screen/i).click();
  await frame.locator('.cfzn-project-tools').waitFor({ state: 'visible' }); checks.fullscreen = true;
  await frame.evaluate(() => testVm.emit('PERIPHERAL_CONNECTION_LOST_ERROR', { deviceId: 'arduinoUno' }));
  const alertList = frame.locator('[class*="alerts_alerts-inner-container"]');
  await alertList.locator('[class*="alert_alert"]').first().waitFor();
  await page.screenshot({ path: resolve(output, 'native-alert-1440.png') });
  const close = alertList.locator('[class*="close-button_close-button"]'); await close.first().click();
  await frame.waitForFunction(() => document.querySelector('[class*="alerts_alerts-inner-container"]').children.length === 0); checks.nativeAlert = true;
  await frame.getByText('编辑', { exact: true }).click();
  const editMenu = frame.locator('[class*="menu_menu_"]:visible').first();
  await editMenu.waitFor();
  const menuRect = await editMenu.boundingBox(); assert.ok(menuRect.y >= 48 && menuRect.height > 10);
  await page.screenshot({ path: resolve(output, 'native-edit-menu-1440.png') });
  await frame.getByTestId('project-status').click(); checks.nativeEditDropdown = true;
  const layouts = [];
  for (const width of [1440, 1894, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 400)));
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await frame.evaluate(() => ({ tools: document.querySelector('.cfzn-project-tools').getBoundingClientRect().toJSON(),
      tabs: document.querySelector('[role="tablist"]').getBoundingClientRect().toJSON(),
      menu: document.querySelector('[class*="gui_menu-bar-position"]').getBoundingClientRect().toJSON(),
      status: document.querySelector('[data-testid="project-status"]').getBoundingClientRect().toJSON(),
      buttons: [...document.querySelectorAll('.cfzn-project-tools button')].map(item => ({ text: item.textContent, rect: item.getBoundingClientRect().toJSON() })),
      menuChildren: [...document.querySelector('[data-cfzn-menu-host]').children].map(item => ({ className: item.className, rect: item.getBoundingClientRect().toJSON() })) }));
    assert.equal(geometry.menu.height, 48);
    assert.ok(geometry.tools.top >= geometry.menu.top && geometry.tools.bottom <= geometry.menu.bottom);
    assert.equal(geometry.tabs.top, geometry.menu.bottom);
    assert.ok(geometry.tools.x >= 0 && geometry.tools.right <= width, JSON.stringify(geometry));
    if (width >= 1440) {
      assert.ok(geometry.buttons.every(button => button.rect.x >= 0 && button.rect.right <= width));
      assert.ok(geometry.status.right <= width);
    }
    assert.ok(await frame.evaluate(() => {
      const host = document.querySelector('[data-cfzn-menu-host]');
      return getComputedStyle(host).overflowY === 'visible' &&
        !document.documentElement.style.getPropertyValue('--cfzn-project-tools-space');
    }));
    layouts.push({ width, ...geometry }); await page.screenshot({ path: resolve(output, `toolbar-${width}.png`) });
    if (width === 390) {
      for (const testId of ['project-list-button', 'new-project', 'import-project', 'export-project', 'save-project']) {
        await frame.getByTestId(testId).focus();
        const button = await frame.getByTestId(testId).boundingBox();
        assert.ok(button.x >= 0 && button.x + button.width <= width + 1, JSON.stringify({ testId, button }));
      }
      await frame.locator('.cfzn-project-tools').evaluate(element => { element.scrollLeft = element.scrollWidth; });
      const status = await frame.getByTestId('project-status').boundingBox(); assert.ok(status.x >= 0 && status.x + status.width <= width + 1);
      await page.screenshot({ path: resolve(output, 'toolbar-390-scrolled.png') });
    }
  }
  assert.deepEqual(errors, []); checks.noPageErrors = true;
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ checks, layouts, calls, errors }, null, 2));
  console.log(JSON.stringify(checks));
} catch (error) {
  console.log('checks completed', checks, 'errors', errors);
  const f = page.frames().find(frame => frame.url().includes('openblock.html'));
  console.log('frame tail', (await f?.locator('body').innerText())?.slice(-1800));
  await page.screenshot({ path: resolve(output, 'failure.png') }); throw error;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); await api.close();
  if (!temporary.startsWith(resolve(web, '.runtime-toolbar-'))) throw new Error('Unexpected temporary storage cleanup path');
  await rm(temporary, { recursive: true, force: true });
}
