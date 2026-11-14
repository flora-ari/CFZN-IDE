import { chromium } from '@playwright/test';
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const web = fileURLToPath(new URL('../', import.meta.url));
const surface = process.argv.includes('--dev') ? 'dev' : 'dist'; let vite;
const archivePath = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || resolve(web, '../../tests/evidence/toolbox-v05/2026-11-11T03-43-14-476Z/dist-complete.ob'));
const bytes = await readFile(archivePath), output = resolve(web, 'evidence/toolbox-v05/archive-fix', surface); await mkdir(output, { recursive: true });
const before = unzipSync(bytes), original = JSON.parse(strFromU8(before['project.json']));
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  if (path.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); res.end('{"items":[]}'); return; }
  if (surface === 'dev') { if (vite) vite.middlewares(req, res); else { res.writeHead(503); res.end(); } return; }
  const dist = resolve(web, 'dist'), file = resolve(dist, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
  if (!file.startsWith(dist + sep)) { res.writeHead(400); res.end(); return; }
  res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' })[extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file); stream.on('error', () => { res.writeHead(404); res.end(); }); stream.pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
if (surface === 'dev') vite = await createVite({ root: web, configFile: resolve(web, 'vite.config.ts'), server: { middlewareMode: true, hmr: { server, clientPort: server.address().port } }, logLevel: 'error' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error' && message.text().includes('Workspace Update Error')) errors.push(message.text()); });
await page.route('http://127.0.0.1:3002/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"isolated test"}}' }));
await page.addInitScript(() => { let dom; Object.defineProperty(window, 'ReactDOM', { configurable: true, get: () => dom, set: value => {
  dom = value; let render; Object.defineProperty(value, 'render', { configurable: true, get: () => function (...args) { const result = render.apply(this, args); if (result?.store) window.testStore = result.store; return result; }, set: value => { render = value; } });
} }); });
const bridge = (type, payload) => page.evaluate(({ type, payload }) => new Promise((resolve, reject) => {
  const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
  const timer = setTimeout(() => { removeEventListener('message', listener); reject(new Error(`bridge timeout ${type}`)); }, 45000);
  function listener(event) { if (event.source !== target || event.data.requestId !== requestId) return;
    clearTimeout(timer); removeEventListener('message', listener);
    if (!event.data.payload.ok) { reject(new Error(event.data.payload.error.message)); return; }
    const result = event.data.payload.result; resolve(type === 'EXPORT_PROJECT' ? { ...result, bytes: [...new Uint8Array(result.bytes)] } : result);
  }
  if (type === 'LOAD_PROJECT') payload = { ...payload, bytes: new Uint8Array(payload.bytes).buffer };
  addEventListener('message', listener); target.postMessage({ protocol: 'cfzn.openblock', version: 1, type, payload, requestId }, location.origin);
}), { type, payload });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`); const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 90000 });
  await frame.evaluate(() => { const library = CFZNOpenBlock.renderLibrary; CFZNOpenBlock.renderLibrary = (...args) => { window.testVm = args[2].vm; return library(...args); }; });
  await frame.locator('[class*="extension-button"]').first().click(); await frame.getByText('返回', { exact: true }).click();
  await frame.evaluate(() => {
    window.restoreTrace = []; const vm = window.testVm;
    vm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.testBlockly = B; return B; } });
    const summary = () => JSON.parse(vm.toJSON()).targets.map(target => ({ name: target.name, blocks: Object.keys(target.blocks).length, opcodes: Object.values(target.blocks).map(block => block.opcode) }));
    vm.on('workspaceUpdate', ({ xml }) => restoreTrace.push({ event: 'workspaceUpdate', targets: summary(), xml }));
    vm.on('PROGRAM_MODE_UPDATE', data => restoreTrace.push({ event: 'PROGRAM_MODE_UPDATE', data, targets: summary() }));
  });
  await bridge('LOAD_PROJECT', { bytes: [...bytes], title: 'Programming archive regression' });
  await page.waitForTimeout(500); // Flush the native Blockly event queue before checking for delayed deletion.
  const after = await bridge('EXPORT_PROJECT'), files = unzipSync(new Uint8Array(after.bytes));
  await writeFile(resolve(output, 'restored.ob'), new Uint8Array(after.bytes));
  const restored = JSON.parse(strFromU8(files['project.json']));
  const trace = await frame.evaluate(() => ({ trace: restoreTrace, workspace: testBlockly.getMainWorkspace().getAllBlocks().map(block => ({ id: block.id, type: block.type, disabled: block.disabled })) }));
  const state = await bridge('GET_STATE');
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ original, restored, trace, state, errors }, null, 2));
  await page.screenshot({ path: resolve(output, 'restored.png') });
  assert.deepEqual(restored.targets.map(target => target.blocks), original.targets.map(target => target.blocks));
  assert.equal(restored.programMode, original.programMode); assert.deepEqual(restored.deviceExtensions, original.deviceExtensions);
  assert.deepEqual(JSON.parse(strFromU8(files['cfzn/editor.json'])), JSON.parse(strFromU8(before['cfzn/editor.json'])));
  const digest = value => createHash('sha256').update(value).digest('hex');
  let assets = 0;
  for (const [index, target] of original.targets.entries()) for (const kind of ['costumes', 'sounds']) for (const [assetIndex, asset] of target[kind].entries()) {
    const restoredAsset = restored.targets[index][kind][assetIndex];
    const name = asset.md5ext || `${asset.assetId}.${asset.dataFormat}`, restoredName = restoredAsset.md5ext || `${restoredAsset.assetId}.${restoredAsset.dataFormat}`;
    assert.equal(digest(files[restoredName]), digest(before[name])); assets++;
  }
  assert.equal(state.dirty, false); assert.deepEqual(errors, []);
  assert.ok(trace.workspace.some(block => block.type === 'event_whenarduinobegin'));
  // Native programming mode disables its Arduino start hat; module workspace blocks stay editable.
  assert.ok(trace.workspace.every(block => !block.disabled || block.type === 'event_whenarduinobegin'));
  const localeState = () => frame.evaluate(() => {
    const xml = new DOMParser().parseFromString(testStore.getState().scratchGui.toolbox.toolboxXML, 'application/xml');
    const controllers = [...xml.getElementsByTagName('category')].filter(category => category.id.startsWith('cfzn-controller-'));
    return { locale: testStore.getState().locales.locale, vmLocale: testVm.getLocale(), motion: testBlockly.Msg.CATEGORY_MOTION,
      sameVm: testBindingBefore.vm === testVm, sameLoadProject: testBindingBefore.load === testVm.loadProject,
      sameLoadDeviceURL: testBindingBefore.device === testVm.extensionManager.loadDeviceURL,
      controllers: controllers.map(category => ({ id: category.id, labels: [...category.querySelectorAll('label')].map(label => label.getAttribute('text')) })) };
  });
  await frame.evaluate(() => { window.testBindingBefore = { vm: testVm, load: testVm.loadProject, device: testVm.extensionManager.loadDeviceURL }; });
  const chinese = await localeState();
  await frame.evaluate(() => testStore.dispatch({ type: 'scratch-gui/locales/SELECT_LOCALE', locale: 'en' }));
  await frame.waitForFunction(() => testBlockly.Msg.CATEGORY_MOTION === 'Motion' && testStore.getState().scratchGui.toolbox.toolboxXML.includes('cfzn-controller-firebeetleEsp32E'));
  const english = await localeState(); assert.equal(english.controllers.length, 1); assert.equal(english.vmLocale, 'en');
  assert.ok(english.sameVm && english.sameLoadProject && english.sameLoadDeviceURL);
  assert.notDeepEqual(english.controllers[0].labels, chinese.controllers[0].labels);
  await frame.evaluate(locale => testStore.dispatch({ type: 'scratch-gui/locales/SELECT_LOCALE', locale }), chinese.locale);
  await frame.waitForFunction(motion => testBlockly.Msg.CATEGORY_MOTION === motion && testStore.getState().scratchGui.toolbox.toolboxXML.includes('cfzn-controller-firebeetleEsp32E'), chinese.motion);
  const returned = await localeState(); assert.deepEqual(returned.controllers, chinese.controllers);
  assert.ok(returned.sameVm && returned.sameLoadProject && returned.sameLoadDeviceURL);
  const afterLocale = unzipSync(new Uint8Array((await bridge('EXPORT_PROJECT')).bytes));
  assert.deepEqual(JSON.parse(strFromU8(afterLocale['project.json'])).targets.map(target => target.blocks), original.targets.map(target => target.blocks));
  assert.deepEqual(JSON.parse(strFromU8(afterLocale['cfzn/editor.json'])), JSON.parse(strFromU8(before['cfzn/editor.json'])));
  await frame.getByRole('button', { name: '上传模式', exact: true }).click();
  await frame.waitForFunction(() => testBlockly.getMainWorkspace().getBlockById('qa-hat').disabled === false);
  await frame.getByRole('button', { name: '编程模式', exact: true }).click();
  await frame.waitForFunction(() => testBlockly.getMainWorkspace().getBlockById('qa-hat').disabled === true);
  await frame.evaluate(() => testBlockly.Xml.clearWorkspaceAndLoadFromXml(testBlockly.Xml.textToDom('<xml/>'), testBlockly.getMainWorkspace()));
  await frame.waitForFunction(() => testVm.editingTarget.blocks.getScripts().length === 0);
  const boards = [];
  for (const [name, id] of [['Aijite ESP32-S3', 'aijiteESP32S3'], ['FireBeetle ESP32-E', 'firebeetleEsp32E']]) {
    await frame.locator('[class*="extension-button"]').first().click();
    await frame.getByRole('button', { name: '主控扩展', exact: true }).click();
    await frame.getByRole('button', { name, exact: true }).click();
    await frame.waitForFunction(id => testVm.runtime.getDevice().deviceId === id && testBlockly.Device.getDeviceId() === id &&
      testStore.getState().scratchGui.device.deviceId === id && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'), id);
    await frame.getByText('返回', { exact: true }).click();
    const board = await frame.evaluate(() => ({ id: testVm.runtime.getDevice().deviceId, realtime: testVm.runtime.isRealtimeMode(),
      modules: testVm.runtime.getLoadedDeviceExtension().length, sameLoadProject: testBindingBefore.load === testVm.loadProject,
      sameLoadDeviceURL: testBindingBefore.device === testVm.extensionManager.loadDeviceURL,
      pins: testBlockly.Device.getPinOptions('arduino_pin_setDigitalOutput').map(pin => String(pin[1])) }));
    assert.equal(board.id, id); assert.equal(board.realtime, true); assert.equal(board.modules, 6);
    assert.ok(board.sameLoadProject && board.sameLoadDeviceURL); if (id === 'aijiteESP32S3') assert.ok(!board.pins.includes('3'));
    boards.push(board);
  }
  await bridge('LOAD_PROJECT', { bytes: [...bytes], title: 'Restored after locale and boards' });
  await page.waitForTimeout(500);
  const finalArchive = unzipSync(new Uint8Array((await bridge('EXPORT_PROJECT')).bytes));
  assert.deepEqual(JSON.parse(strFromU8(finalArchive['project.json'])).targets.map(target => target.blocks), original.targets.map(target => target.blocks));
  assert.deepEqual(JSON.parse(strFromU8(finalArchive['cfzn/editor.json'])), JSON.parse(strFromU8(before['cfzn/editor.json'])));
  await writeFile(resolve(output, 'lifecycle.json'), JSON.stringify({ english, returned, boards, restoredAgain: true }, null, 2));
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'locale.json'), JSON.stringify({ chinese, english, returned }, null, 2));
  console.log(JSON.stringify({ surface, restoredBlocks: restored.targets.map(target => Object.keys(target.blocks).length), modules: restored.deviceExtensions.length, mode: restored.programMode, assets,
    manualAndAssets: true, localeRoundtrip: true, sameVmBindings: true, crossBoardRoundtrip: true, restoredAgain: true, dirty: state.dirty, errors }));
} finally { await browser.close(); await vite?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
