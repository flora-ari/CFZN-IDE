import { chromium } from '@playwright/test';
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import assert from 'node:assert/strict';

const web = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(web, 'evidence/toolbox-v05'); await mkdir(output, { recursive: true });
const moduleNames = { atomizer: '雾化模块', activateBuzzer: '有源蜂鸣器', pirSensor: '人体红外', flameSensor: '火焰传感器', raindropSensor: '水滴传感器', moreComments: '积木注释' };
const moduleCategories = ['ACTIVATEBUZZER_CATEGORY', 'ATOMIZER_CATEGORY', 'PIRSENSOR_CATEGORY', 'FLAMESENSOR_CATEGORY', 'RAINDROPSENSOR_CATEGORY', 'MORECOMMENTS_CATEGORY'];
const surfaces = process.argv.includes('--dev') ? ['dev'] : process.argv.includes('--dist') ? ['dist'] : ['dev', 'dist'];
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
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [], resourceRequests = [], checks = {};
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', req => { if (req.url().includes('/cfzn-extensions/extensions/') && req.url().includes('.mjs')) resourceRequests.push(req.url()); });
  await page.route('http://127.0.0.1:3002/api/v1/hardware/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/ports') ? { items: [] } : { protocolVersion: 1, executionHost: 'local', profiles: [], toolchain: { cliVersion: null, description: 'no hardware used' } }) }));
  await page.addInitScript(initialize);
  let frame;
  const bridge = (type, payload) => bridgeOn(page, type, payload);
  const categories = () => frame.evaluate(() => {
    const xml = new DOMParser().parseFromString(window.testStore.getState().scratchGui.toolbox.toolboxXML, 'application/xml');
    return [...xml.documentElement.children].filter(node => node.tagName === 'category').map(category => ({ id: category.id, name: category.getAttribute('name'), nested: category.querySelectorAll('category').length,
      blocks: [...category.querySelectorAll('block')].map(block => ({ type: block.getAttribute('type'), disabled: block.getAttribute('disabled') })) }));
  });
  const mode = label => frame.getByRole('button', { name: label, exact: true }).click();
  const closeLibrary = () => frame.getByText('返回', { exact: true }).click();
  async function flyout(id) {
    await frame.evaluate(id => window.testBlockly.getMainWorkspace().toolbox_.scrollToCategoryById(id), id);
    await page.waitForTimeout(300); // Native toolbox scroll animation must finish before pointer coordinates are measured.
    return frame.evaluate(id => {
      const xml = new DOMParser().parseFromString(window.testStore.getState().scratchGui.toolbox.toolboxXML, 'application/xml');
      const category = [...xml.getElementsByTagName('category')].find(category => category.id === id);
      const types = new Set([...category.children].filter(node => node.tagName === 'block').map(node => node.getAttribute('type')));
      return window.testBlockly.getMainWorkspace().getFlyout().getFlyoutItems().filter(block => types.has(block.type)).map(block => ({ id: block.id, type: block.type, disabled: block.disabled }));
    }, id);
  }
  try {
    await page.goto(origin); await page.locator('iframe').waitFor();
    frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 90000 });
    await frame.evaluate(() => {
      const library = CFZNOpenBlock.renderLibrary; CFZNOpenBlock.renderLibrary = (...args) => { window.testVm = args[2].vm; return library(...args); };
      const workspace = CFZNOpenBlock.renderUploadWorkspace; CFZNOpenBlock.renderUploadWorkspace = (...args) => {
        const props = args[2], mounted = props.onCodeEditorDidMount;
        return workspace(args[0], args[1], { ...props, onCodeEditorDidMount: editor => { window.testEditor = editor; mounted(editor); } });
      };
    });
    assert.equal(await frame.getByRole('button', { name: '编程模式', exact: true }).getAttribute('aria-pressed'), 'true');
    await frame.locator('[class*="extension-button"]').first().click();
    await frame.getByRole('button', { name: '主控扩展', exact: true }).click();
    await frame.getByRole('button', { name: 'FireBeetle ESP32-E', exact: true }).click();
    await frame.waitForFunction(() => window.testVm?.runtime.getDevice().deviceId === 'firebeetleEsp32E' && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'));
    assert.equal(await frame.evaluate(() => window.testVm.runtime.isRealtimeMode()), true);
    await closeLibrary();
    let list = await categories();
    assert.ok(list.some(category => category.id === 'motion')); assert.ok(list.some(category => category.id === 'looks'));
    assert.equal(list.filter(category => category.id.startsWith('cfzn-controller-')).length, 1);
    assert.ok(list.every(category => category.nested === 0)); checks.modeAndBaseCategories = true;
    await frame.locator('[class*="extension-button"]').first().click();
    await frame.getByRole('button', { name: '模块扩展', exact: true }).click();
    let manifestFailures = 1, moduleFailures = 1;
    await page.route('**/openblock-vendor/manifest.json', route => manifestFailures-- > 0 ? route.fulfill({ status: 503, body: 'temporary manifest failure' }) : route.continue());
    await page.route('**/extensions/atomizer/generator.mjs*', route => moduleFailures-- > 0 ? route.fulfill({ status: 404, body: 'temporary module failure' }) : route.continue());
    const beforePreparation = await frame.evaluate(() => window.testVm.toJSON());
    const atomizerCard = frame.getByRole('button', { name: '雾化模块', exact: true });
    await atomizerCard.click(); await frame.locator('.cfzn-extension-error').filter({ hasText: '清单' }).waitFor();
    assert.equal(await frame.evaluate(() => window.testVm.toJSON()), beforePreparation);
    await atomizerCard.click(); await frame.locator('.cfzn-extension-error').filter({ hasText: 'generator.mjs' }).waitFor();
    assert.equal(await frame.evaluate(() => window.testVm.toJSON()), beforePreparation);
    assert.deepEqual(await frame.evaluate(() => window.testVm.runtime.getLoadedDeviceExtension()), []);
    checks.preparationRetryKeepsDocument = true;
    for (const [id, name] of Object.entries(moduleNames)) {
      await frame.getByRole('button', { name, exact: true }).click();
      await frame.waitForFunction(id => window.testVm.runtime.getLoadedDeviceExtension().includes(id) && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'), id, { timeout: 20000 });
    }
    await closeLibrary();
    await frame.evaluate(() => window.testVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: Blockly => { window.testBlockly = Blockly; return Blockly; } }));
    list = await categories();
    for (const id of moduleCategories) { const entry = list.filter(category => category.id === id); assert.equal(entry.length, 1, id); assert.ok(entry[0].blocks.every(block => block.disabled === 'true')); }
    assert.equal(await frame.evaluate(() => window.testVm.runtime.isRealtimeMode()), true);
    assert.equal(await frame.locator('vite-error-overlay').count(), 0);
    assert.ok(resourceRequests.length >= 24); assert.ok(resourceRequests.every(url => !new URL(url).searchParams.has('import')));
    checks.sixModulesInProgramming = true;
    for (const id of moduleCategories) {
      const blocks = await flyout(id);
      assert.ok(blocks.length > 0, id); assert.ok(blocks.every(block => block.disabled), `${id}: ${JSON.stringify(blocks)}`);
    }
    await frame.evaluate(() => window.testBlockly.getMainWorkspace().toolbox_.setSelectedCategoryById('ATOMIZER_CATEGORY'));
    await page.screenshot({ path: resolve(output, `${surface}-programming.png`) });
    const upload = '<block type="event_whenarduinobegin" id="upload" x="300" y="50"><next><block type="atomizer_init" id="atomizer" ><field name="PIN">4</field><next><block type="atomizer_setState"><field name="STATE">LOW</field></block></next></block></next></block>';
    const stage = '<block type="event_whenflagclicked" id="flag" x="30" y="50"><next><block type="motion_changexby" id="move"><value name="DX"><shadow type="math_number"><field name="NUM">20</field></shadow></value></block></next></block>';
    const setBlocks = xml => frame.evaluate(xml => { const B = window.testBlockly; B.Xml.clearWorkspaceAndLoadFromXml(B.Xml.textToDom(xml), B.getMainWorkspace()); }, `<xml xmlns="http://www.w3.org/1999/xhtml">${xml}</xml>`);
    await setBlocks(stage + upload);
    await frame.waitForFunction(() => window.testVm.editingTarget.blocks.getBlock('flag'));
    const x = await frame.evaluate(() => window.testVm.editingTarget.x); await bridge('RUN');
    await frame.waitForFunction(x => window.testVm.editingTarget.x === x + 20, x);
    checks.pureScratchAlongsideUpload = true;
    await setBlocks(stage.replace('</block></next></block>', '<next><block type="atomizer_toggle"/></next></block></next></block>') + upload);
    await frame.waitForFunction(() => Object.values(window.testVm.editingTarget.blocks._blocks).some(block => block.opcode === 'atomizer_toggle'));
    await assert.rejects(bridge('RUN'), /仅上传模式/);
    await frame.evaluate(() => window.testStore.dispatch({ type: 'scratch-gui/modals/CLOSE_MODAL', modal: 'messageBox' }));
    checks.mixedExecutionBlocked = true;
    await mode('上传模式');
    assert.ok(await frame.evaluate(() => !!window.testBlockly.getMainWorkspace().getBlockById('flag')));
    await frame.evaluate(() => { document.body.focus(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', keyCode: 46, bubbles: true })); });
    assert.equal(await frame.locator('.cfzn-mode-message').filter({ hasText: '请切换到编程模式运行舞台' }).count(), 0);
    await setBlocks(upload);
    await frame.waitForFunction(() => window.testStore.getState().scratchGui.code.codeEditorValue.includes('atomizerPin = 4'));
    let code = await frame.evaluate(() => window.testStore.getState().scratchGui.code.codeEditorValue);
    assert.match(code, /pinMode\(atomizerPin, OUTPUT\)/); assert.match(code, /digitalWrite\(atomizerPin, LOW\)/);
    list = await categories(); assert.equal(list.some(category => category.id === 'motion'), false);
    assert.ok(list.filter(category => moduleCategories.includes(category.id)).every(category => category.blocks.every(block => block.disabled !== 'true')));
    await frame.evaluate(() => window.testBlockly.getMainWorkspace().getBlockById('atomizer').setFieldValue('5', 'PIN'));
    await frame.waitForFunction(() => window.testStore.getState().scratchGui.code.codeEditorValue.includes('atomizerPin = 5'));
    checks.parameterSensitiveGenerator = true;
    const flyoutEvidence = [];
    for (const id of moduleCategories) {
      const blocks = await flyout(id);
      assert.ok(blocks.length > 0, id); assert.ok(blocks.every(block => !block.disabled), `${id}: ${JSON.stringify(blocks)}`);
      const before = await frame.evaluate(() => window.testBlockly.getMainWorkspace().getAllBlocks().length);
      const box = await frame.evaluate(blockId => {
        const block = window.testBlockly.getMainWorkspace().getFlyout().getFlyoutItems().find(item => item.id === blockId);
        const rect = block.getSvgRoot().getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }, blocks[0].id);
      const iframe = await page.locator('iframe').boundingBox();
      await page.mouse.move(iframe.x + box.x + 30, iframe.y + box.y + 18); await page.mouse.down();
      await page.mouse.move(iframe.x + 650, iframe.y + 350 + flyoutEvidence.length * 65, { steps: 15 }); await page.mouse.up();
      await frame.waitForFunction(before => window.testBlockly.getMainWorkspace().getAllBlocks().length > before, before, { timeout: 5000 }).catch(error => { throw new Error(`Drag failed ${id}; before ${before}: ${error}`); });
      flyoutEvidence.push({ id, blocks, dragged: true });
    }
    checks.uploadFlyoutsEnabledAndDragged = true;
    await writeFile(resolve(output, `${surface}-flyouts.json`), JSON.stringify(flyoutEvidence, null, 2));
    await page.screenshot({ path: resolve(output, `${surface}-upload.png`) });
    assert.deepEqual(errors, []);
    results.push({ surface, checks, resourceRequests, errors, physicalSerial: false });
    await writeFile(resolve(output, `${surface}-result.json`), JSON.stringify(results.at(-1), null, 2));
    console.log(JSON.stringify({ surface, checks, resources: resourceRequests.length, errors }));
  } catch (error) {
    console.log('BODY', (await frame?.locator('body').innerText())?.slice(-3500));
    console.log('CATEGORIES', frame ? await categories().catch(() => null) : null);
    await page.screenshot({ path: resolve(output, `${surface}-failure.png`) }); throw error;
  } finally { await browser.close(); await vite?.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
await writeFile(resolve(output, 'result.json'), JSON.stringify(results, null, 2));
