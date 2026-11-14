import{unzipSync,strFromU8}from'fflate';
import{createHash}from'node:crypto';
import { chromium } from '@playwright/test';
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';

const web = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(web, 'evidence/mindplus-parity-v07'); await mkdir(output, { recursive: true });
const surfaces = process.argv.includes('--dist') ? ['dist'] : ['dev'];
const results = [];
const initialize = () => {
  let dom;
  Object.defineProperty(window, 'ReactDOM', { configurable: true, get: () => dom, set: value => {
    dom = value; let render;
    Object.defineProperty(value, 'render', { configurable: true, get: () => function (...args) { const result = render.apply(this, args); if (result?.store) window.testStore = result.store; return result; }, set: fn => { render = fn; } });
  } });
};
const bridgeOn = (page, type, payload) => page.evaluate(({ type, payload }) => new Promise((resolve, reject) => {
  const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
  const timer = setTimeout(() => { removeEventListener('message', listener); reject(new Error(`bridge timeout ${type}`)); }, 45000);
  function listener(e) {
    if (e.source !== target || e.data.requestId !== requestId) return;
    clearTimeout(timer); removeEventListener('message', listener);
    if (!e.data.payload.ok) { reject(new Error(e.data.payload.error.message)); return; }
    const result = e.data.payload.result;
    resolve(type === 'EXPORT_PROJECT' ? { ...result, bytes: [...new Uint8Array(result.bytes)] } : result);
  }
  if (type === 'LOAD_PROJECT') payload = { ...payload, bytes: new Uint8Array(payload.bytes).buffer };
  addEventListener('message', listener); target.postMessage({ protocol: 'cfzn.openblock', version: 1, type, payload, requestId }, location.origin);
}), { type, payload });
for (const surface of surfaces) {
  let vite;
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://local').pathname;
    if (path.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); res.end('{"items":[]}'); return; }
    if (surface === 'dev') { if (vite) vite.middlewares(req, res); else { res.writeHead(503); res.end(); } return; }
    const dist = resolve(web, 'dist'), file = resolve(dist, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
    if (!file.startsWith(dist + sep)) { res.writeHead(400); res.end(); return; }
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' })[extname(file)] || 'application/octet-stream');
    const stream = createReadStream(file); stream.on('error', () => { res.writeHead(404); res.end(); }); stream.pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port, origin = `http://127.0.0.1:${port}`;
  if (surface === 'dev') vite = await createVite({ root: web, configFile: resolve(web, 'vite.config.ts'), server: { middlewareMode: true, hmr: { server, clientPort: port } }, logLevel: 'error' });
  const browserServer = await chromium.launchServer({ channel: 'msedge', headless: true });
  const browser = await chromium.connect(browserServer.wsEndpoint());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(10000);
  const errors = [], resourceRequests = [], checks = {};
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', req => { if (req.url().includes('/cfzn-extensions/extensions/') && req.url().includes('.mjs')) resourceRequests.push(req.url()); });
  await page.route('http://127.0.0.1:3002/api/v1/hardware/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/ports') ? { items: [] } : { protocolVersion: 1, executionHost: 'local', profiles: [], toolchain: { cliVersion: null, description: 'no hardware used' } }) }));
  await page.addInitScript(initialize);
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, 'CFZNOpenBlock', { configurable: true, get: () => api, set: value => {
      api = value;
      const attach = value.attachPaletteSearch;
      value.attachPaletteSearch = (B, workspace, ...args) => { window.testBlockly = B; window.testWorkspace = workspace; window.testEvents=[]; workspace.addChangeListener(e=>{if(window.testEvents.length<60)window.testEvents.push({type:e.type,element:e.element,workspaceId:e.workspaceId});}); return attach(B, workspace, ...args); };
    } });
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { getPorts: async () => [], requestPort: async () => { throw Error('No physical serial in smoke'); } } });
  });
  let frame, postCount = 0, putCount = 0, saved;
  await page.route('**/api/v1/projects**', async route => {
    const request = route.request(), method = request.method();
    if (method === 'GET') { await route.fulfill({ json: { items: saved ? [saved] : [] } }); return; }
    if (method === 'POST') {
      postCount++;
      const form = await new Response(request.postDataBuffer(), { headers: { 'Content-Type': request.headers()['content-type'] } }).formData();
      const file = form.get('file'), zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
      assert.ok(zip['project.json']);
      saved = { id: '11111111-1111-4111-8111-111111111111', name: form.get('name'), revision: 1, format: 'openblock', sizeBytes: file.size, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    } else if (method === 'PUT') { putCount++; assert.ok(unzipSync(request.postDataBuffer())['project.json']); saved = { ...saved, revision: saved.revision + 1 }; }
    else if (method === 'PATCH') saved = { ...saved, name: request.postDataJSON().name, revision: saved.revision + 1 };
    await route.fulfill({ json: { project: saved } });
  });
  const bridge = (type, payload) => bridgeOn(page, type, payload);
  try {
    await page.goto(origin);
    frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 90000 });
    await frame.getByRole('button', { name: '搜索积木', exact: true }).waitFor(); console.log(surface + ': boot ready');
    const clean = await bridge('GET_STATE'), original = await bridge('GET_PROJECT_JSON');
    await frame.getByRole('button', { name: '搜索积木', exact: true }).click();
    await frame.getByRole('textbox', { name: '搜索当前积木文字' }).fill('移动');
    await frame.waitForFunction(() => /匹配积木/.test(document.querySelector('.cfzn-search-panel [role=status]')?.textContent) && testWorkspace.toolbox_.getSelectedCategoryId() === 'cfzn-search-results', null, { timeout: 15000 });
    checks.search = await frame.evaluate(() => ({ status: document.querySelector('.cfzn-search-panel [role=status]').textContent, selected: testWorkspace.toolbox_.getSelectedCategoryId(), blocks: testWorkspace.getFlyout().getFlyoutItems().filter(b => b.type === 'motion_movesteps').map(b => ({ type:b.type, text:b.toString(),disabled:b.disabled })) }));
    assert.equal(checks.search.selected, 'cfzn-search-results'); assert.ok(checks.search.blocks.length);
    assert.deepEqual(await bridge('GET_PROJECT_JSON'), original); assert.equal((await bridge('GET_STATE')).editVersion, clean.editVersion);
    await page.screenshot({ path: resolve(output, surface + '-search.png') });
    await frame.getByRole('textbox', { name: '搜索当前积木文字' }).press('Escape');
    assert.equal(await frame.locator('.cfzn-search-panel').count(), 0);
    await frame.waitForFunction(() => testWorkspace.toolbox_.getSelectedCategoryId() !== 'cfzn-search-results');
    assert.equal((await bridge('GET_STATE')).editVersion, clean.editVersion); checks.searchNoDirty = true; console.log(surface + ': search and restore verified');
    const title = frame.locator('[class*=menu-bar_menu-bar] input').first(); await title.fill('v07 最后输入标题'); await title.evaluate(input => input.setSelectionRange(2, 5)); await page.keyboard.press('Control+s');
    await page.waitForFunction(() => document.querySelector('.notice')?.textContent.includes('已保存'), null, { timeout: 15000 });
    assert.equal(postCount, 1); assert.equal(putCount, 0); assert.equal(saved.name, 'v07 最后输入标题'); assert.deepEqual(await title.evaluate(input => ({ focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd })), { focused: true, start: 2, end: 5 });
    await page.getByRole('button', { name: '关闭提示', exact: true }).focus();
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1000);
    assert.equal(postCount, 1); assert.equal(putCount, 1); checks.saveDomains = true;
    await frame.getByRole('button', { name: '搜索积木', exact: true }).click();
    await frame.evaluate(() => {
      testWorkspace.createVariable('v07温度', '', 'v07-temp-id'); testWorkspace.createVariable('v07清单', 'list', 'v07-list-id');
      const xml = `<xml><block type="procedures_definition"><statement name="custom_block"><shadow type="procedures_prototype"><mutation proccode="v07函数 %n %s %b" argumentids='["v07-number","v07-text","v07-bool"]' argumentnames='["数字","文本","条件"]' argumentdefaults='[1,"",false]' warp="false"/></shadow></statement></block></xml>`;
      testBlockly.Xml.domToWorkspace(testBlockly.Xml.textToDom(xml), testWorkspace);
    });
    await page.waitForTimeout(300);
    const beforeDynamic = await bridge('GET_STATE'), graph = await bridge('GET_PROJECT_JSON');
    for (const query of ['v07温度', 'v07清单', 'v07函数']) {
      await frame.getByRole('textbox', { name: '搜索当前积木文字' }).fill(query);
      await frame.waitForFunction(() => /个匹配积木/.test(document.querySelector('.cfzn-search-panel [role=status]')?.textContent) && testWorkspace.toolbox_.getSelectedCategoryId() === 'cfzn-search-results', null, {timeout:10000});
      if (query === 'v07函数') {
        checks.procedure = await frame.evaluate(() => testWorkspace.getFlyout().getFlyoutItems().filter(b => b.type === 'procedures_call' && b.toString().includes('v07函数')).map(b => ({text:b.toString(),xml:testBlockly.Xml.domToText(testBlockly.Xml.blockToDom(b))})));
        assert.ok(checks.procedure.length); assert.ok(checks.procedure.at(-1).xml.includes('v07-number')); assert.ok(checks.procedure.at(-1).xml.includes('v07-text')); assert.ok(checks.procedure.at(-1).xml.includes('v07-bool'));
      }
    }
    assert.deepEqual(await bridge('GET_PROJECT_JSON'), graph); assert.equal((await bridge('GET_STATE')).editVersion, beforeDynamic.editVersion);
    assert.equal(await frame.evaluate(() => testBlockly.getMainWorkspace() === testWorkspace), true); checks.dynamicAndNoDirty = true;
    await frame.getByRole('textbox', { name: '搜索当前积木文字' }).fill('移动');
    await frame.waitForFunction(() => /个匹配积木/.test(document.querySelector('.cfzn-search-panel [role=status]')?.textContent));
    await page.waitForTimeout(250);
    const source = await frame.evaluate(() => {const b=testWorkspace.getFlyout().getFlyoutItems().filter(b=>b.type==='motion_movesteps').at(-1);const r=b.getSvgRoot().getBoundingClientRect();return {x:r.x+12,y:r.y+14};});
    const iframeBox = await page.locator('iframe').boundingBox();
    await page.mouse.move(iframeBox.x+source.x,iframeBox.y+source.y); await page.mouse.down(); await page.mouse.move(iframeBox.x+540,iframeBox.y+280,{steps:20}); await page.mouse.up();
    await frame.waitForFunction(() => testWorkspace.getAllBlocks(false).some(b=>b.type==='motion_movesteps')); checks.realSearchDrag = true;
    await frame.getByRole('textbox', { name: '搜索当前积木文字' }).press('Escape');
    await frame.locator('[class*="extension-button"]').first().click();
    await frame.getByRole('button', {name:'主控扩展',exact:true}).click();
    assert.equal(await frame.locator('[data-cfzn-library-card]').count(),20);
    const beforeFilter = await bridge('GET_STATE'); await frame.getByRole('checkbox',{name:'已加载',exact:true}).check();
    assert.equal(await frame.locator('[data-cfzn-library-card]').count(),0);
    await frame.getByRole('button',{name:'清除筛选',exact:true}).click(); assert.equal(await frame.locator('[data-cfzn-library-card]').count(),20);
    assert.equal((await bridge('GET_STATE')).editVersion,beforeFilter.editVersion); checks.loadedFilter = true;
    await frame.locator('[data-cfzn-library-card=controller-arduinoEsp32] .cfzn-card-select').click();
    await frame.waitForFunction(() => testStore.getState().scratchGui.device.deviceId === 'arduinoEsp32');
    await frame.getByText('返回',{exact:true}).click();
    await frame.getByRole('button',{name:'上传模式',exact:true}).click();
    await frame.getByRole('textbox',{name:'上传串口发送内容'}).fill('v07 retained draft');
    await frame.getByLabel('上传串口发送格式',{exact:true}).selectOption('hex');
    await frame.getByLabel('上传串口行尾',{exact:true}).selectOption('CRLF');
    await frame.getByRole('spinbutton',{name:'上传串口波特率'}).fill('256000');
    await frame.getByRole('button',{name:'编程模式',exact:true}).click(); await frame.getByRole('button',{name:'上传模式',exact:true}).click();
    assert.equal(await frame.getByRole('textbox',{name:'上传串口发送内容'}).inputValue(),'v07 retained draft');
    assert.equal(await frame.getByLabel('上传串口发送格式',{exact:true}).inputValue(),'hex');
    assert.equal(await frame.getByLabel('上传串口行尾',{exact:true}).inputValue(),'CRLF');
    assert.equal(await frame.getByRole('spinbutton',{name:'上传串口波特率'}).inputValue(),'256000'); checks.terminalRemount = true;
    const beforeHealth=await bridge('GET_STATE'); await frame.getByRole('button',{name:'编译和设备设置',exact:true}).click();
    await frame.locator('.cfzn-local-service[data-status=online]').waitFor();
    assert.equal(await frame.getByRole('button',{name:'编译检查',exact:true}).isDisabled(),true);
    await frame.locator('[data-testid=hardware-progress]').getByRole('button',{name:'关闭',exact:true}).click();
    assert.equal((await bridge('GET_STATE')).editVersion,beforeHealth.editVersion); checks.serviceSeparate = true;
    assert.equal(errors.length, 0, errors.join('\n'));
    await writeFile(resolve(output, surface + '-smoke.json'), JSON.stringify({ surface, checks, errors, physicalHardware: false, persistence: 'isolated mock API, actual original archive bytes' }, null, 2));
    console.log(JSON.stringify({ surface, checks })); results.push({ surface, checks });
  } catch (error) {
    process.exitCode = 1; await page.screenshot({ path: resolve(output, surface + '-failure.png') }).catch(() => {});
    console.log(JSON.stringify({ error: String(error), pageerrors: errors, search: await frame?.locator('.cfzn-search-panel').textContent({timeout:1000}).catch(() => ''), state: await bridge('GET_STATE').catch(String), events: await frame?.evaluate(()=>window.testEvents) })); throw error;
  } finally {
    browserServer.process().kill('SIGKILL'); console.log(surface + ': owned browser process terminated'); server.closeAllConnections(); const shutdown = setTimeout(() => process.exit(process.exitCode ?? 0), 3000); if (vite) await vite.close(); await new Promise(resolve => server.close(resolve)); clearTimeout(shutdown);
  }
}
