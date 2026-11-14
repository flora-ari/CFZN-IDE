import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const web = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(web, 'evidence/mode-ui-v03'); await mkdir(output, { recursive: true });
const dist = resolve(web, 'dist');
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://local').pathname;
  if (path === '/api/v1/projects') { res.setHeader('content-type', 'application/json'); res.end('{"items":[]}'); return; }
  const file = resolve(dist, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
  if (!file.startsWith(dist + sep)) { res.writeHead(400); res.end(); return; }
  res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file); stream.on('error', () => { res.writeHead(404); res.end(); }); stream.pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], sockets = [], calls = [], consoleErrors = [];
const checks = {};
page.on('pageerror', error => errors.push(String(error)));
page.on('console', event => { if (event.type() === 'error') consoleErrors.push(event.text()); });
page.on('websocket', socket => sockets.push(socket.url()));
const ids = ['arduinoUno', 'arduinoEsp32S3', 'aijiteESP32S3', 'arduinoEsp32', 'firebeetleEsp32E'];
let jobs = new Map(), nextJob = 0, holdBuild = false, holdUpload = false;
await page.route('http://127.0.0.1:3002/api/v1/hardware/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  const body = request.postDataJSON(); calls.push({ path, method: request.method(), body });
  let data;
  if (path.endsWith('/capabilities')) data = { protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: 'mock', description: 'browser mock' },
    profiles: ids.map(id => ({ id: `mock-${id}`, deviceId: id, label: id, chip: id === 'arduinoUno' ? 'avr' : id.includes('S3') ? 'esp32s3' : 'esp32', fqbn: `mock:${id}`, compileAvailable: true, uploadAvailable: true, realtimeAvailable: false })) };
  else if (path.endsWith('/ports')) data = { items: [{ portId: 'COM-MOCK', displayName: 'COM-MOCK · simulated uploader target' }] };
  else if (path.endsWith('/builds') || path.endsWith('/uploads')) {
    const build = path.endsWith('/builds');
    if (!build) assert.equal(await page.frames().find(f => f.url().includes('openblock.html')).evaluate(() => window.mockPort.opened), false, 'port released before upload POST');
    const id = `job-${++nextJob}`;
    const previous = !build && jobs.get(body.buildId);
    const job = { id, kind: build ? 'build' : 'upload', state: 'running', stage: build ? 'compiling' : 'uploading',
      deviceId: build ? body.deviceId : previous.deviceId, profileId: build ? body.profileId : previous.profileId, sourceHash: 'mock-source', createdAt: new Date().toISOString(), ...(build ? {} : { buildId: body.buildId, portId: body.portId }) };
    jobs.set(id, job); data = { job };
  } else {
    const id = path.split('/').at(path.endsWith('/cancel') ? -2 : -1); const job = jobs.get(id);
    if (path.endsWith('/cancel')) { job.state = 'cancelling'; data = { job }; }
    else {
      if (job.state === 'cancelling') { job.state = 'cancelled'; job.stage = 'complete'; }
      else if (!(job.kind === 'build' ? holdBuild : holdUpload)) { job.state = 'succeeded'; job.stage = 'complete'; }
      const after = Number(new URL(request.url()).searchParams.get('afterLog'));
      data = { job, logs: after ? [] : [{ index: 0, stream: 'stdout', text: `${job.kind} mock log\n` }], nextLog: 1 };
    }
  }
  await route.fulfill({ status: request.method() === 'POST' && !path.endsWith('/cancel') ? 202 : 200, contentType: 'application/json', body: JSON.stringify(data) });
});
await page.addInitScript(() => {
  let dom;
  Object.defineProperty(window, 'ReactDOM', { configurable: true, get: () => dom, set: value => {
    dom = value; let original;
    Object.defineProperty(value, 'render', { configurable: true, get: () => function (...args) { const result = original.apply(this, args); if (result?.store) window.testStore = result.store; return result; }, set: fn => { original = fn; } });
  } });
  window.serialRequests = 0; window.chooserCancel = false;
  class MockPort extends EventTarget {
    opens = 0; closes = 0; opened = false; writes = []; failClose = false;
    getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
    async open(options) {
      if (this.opened) throw new Error('second owner'); this.opened = true; this.opens++; this.options = options;
      this.readable = new ReadableStream({ start: c => { this.input = c; } });
      this.writable = new WritableStream({ write: bytes => { this.writes.push([...bytes]); } });
    }
    async close() {
      if (this.readable.locked || this.writable.locked) throw new Error('locked stream');
      if (this.failClose) throw new Error('simulated close failure'); this.opened = false; this.closes++;
    }
  }
  window.mockPort = new MockPort(); window.authorized = false;
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    getPorts: async () => window.authorized ? [window.mockPort] : [],
    requestPort() { window.serialRequests++; if (!navigator.userActivation.isActive) return Promise.reject(new Error('missing user activation'));
      if (window.chooserCancel) return Promise.reject(new DOMException('cancelled', 'NotFoundError'));
      window.authorized = true; return Promise.resolve(window.mockPort); },
  } });
});
async function bridge(type, payload) {
  return page.evaluate(({ type, payload }) => new Promise((resolve, reject) => {
    const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
    const timer = setTimeout(() => { removeEventListener('message', listener); reject(new Error(`bridge timeout ${type}`)); }, 45000);
    function listener(e) { if (e.source !== target || e.data.requestId !== requestId) return; clearTimeout(timer); removeEventListener('message', listener); e.data.payload.ok ? resolve(e.data.payload.result) : reject(new Error(e.data.payload.error.message)); }
    addEventListener('message', listener); target.postMessage({ protocol: 'cfzn.openblock', version: 1, type, payload, requestId }, location.origin);
  }), { type, payload });
}
let frame;
const manual = '// retained manual draft\nvoid setup(){Serial.begin(115200);}\nvoid loop(){Serial.println("mode-v03");delay(1000);}\n';
async function switchMode(label) {
  const button = frame.getByRole('button', { name: label, exact: true });
  await button.click(); await button.filter({ has: frame.locator(':scope') }).count();
  await frame.waitForFunction(label => [...document.querySelectorAll('[data-testid="mode-controls"] button')].some(b => b.textContent === label && b.getAttribute('aria-pressed') === 'true' && !b.disabled), label);
}
async function closeModal(modal) { await frame.evaluate(modal => window.testStore.dispatch({ type: 'scratch-gui/modals/CLOSE_MODAL', modal }), modal); }
async function archiveBytes() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
    const listener = e => { if (e.source !== target || e.data.requestId !== requestId) return; removeEventListener('message', listener);
      e.data.payload.ok ? resolve(Array.from(new Uint8Array(e.data.payload.result.bytes))) : reject(new Error(e.data.payload.error.message)); };
    addEventListener('message', listener); target.postMessage({ protocol: 'cfzn.openblock', version: 1, type: 'EXPORT_PROJECT', requestId }, location.origin);
  }));
}
async function loadArchive(bytes) {
  return page.evaluate(bytes => new Promise(resolve => {
    const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
    addEventListener('message', function listen(e) { if (e.source !== target || e.data.requestId !== requestId) return; removeEventListener('message', listen); resolve(e.data.payload); });
    target.postMessage({ protocol: 'cfzn.openblock', version: 1, type: 'LOAD_PROJECT', requestId, payload: { bytes: new Uint8Array(bytes).buffer, title: 'Test restore' } }, location.origin);
  }), [...bytes]);
}
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.locator('iframe').waitFor();
  frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForFunction(() => document.querySelector('#boot-message')?.hidden || document.body.textContent.includes('OpenBlock出故障'), null, { timeout: 60000 });
  assert.equal(await frame.locator('#boot-message').isHidden(), true, consoleErrors.join('\n'));
  await frame.getByRole('button', { name: '编程模式', exact: true }).waitFor();
  await frame.waitForFunction(() => !document.querySelector('[data-testid="mode-controls"] button').disabled);
  assert.equal(await frame.getByRole('button', { name: '编程模式', exact: true }).getAttribute('aria-pressed'), 'true');
  const clean = await bridge('GET_STATE'); await bridge('MARK_SAVED', { documentId: clean.documentId, editVersion: clean.editVersion });
  await switchMode('上传模式'); await frame.getByTestId('upload-workspace').waitFor();
  assert.equal((await bridge('GET_STATE')).dirty, true);
  await frame.getByText('尚未选择主控，请从主控扩展选择后配置设备。', { exact: true }).waitFor();
  await switchMode('编程模式'); checks.noBoardModes = true;
  await frame.evaluate(() => {
    const original = window.CFZNOpenBlock.renderLibrary;
    window.CFZNOpenBlock.renderLibrary = (...args) => { window.testVm = args[2].vm; return original(...args); };
    const workspace = window.CFZNOpenBlock.renderUploadWorkspace;
    window.CFZNOpenBlock.renderUploadWorkspace = (...args) => {
      const props = args[2], original = props.onCodeEditorDidMount;
      return workspace(args[0], args[1], { ...props, onCodeEditorDidMount: editor => { window.testEditor = editor; original(editor); } });
    };
  });
  await frame.locator('[class*="extension-button"]').first().click();
  await frame.getByRole('button', { name: '主控扩展', exact: true }).click();
  await frame.getByRole('button', { name: 'FireBeetle ESP32-E', exact: true }).click();
  await frame.waitForFunction(() => window.testVm?.runtime.getDevice().deviceId === 'firebeetleEsp32E' && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'));
  const selected = frame.locator('[data-cfzn-controller-selected="true"]');
  assert.equal(await selected.count(), 1); assert.equal(await selected.getAttribute('aria-pressed'), 'true');
  assert.equal(await selected.evaluate(el => getComputedStyle(el).borderTopWidth), '2px');
  assert.equal(await frame.locator('.cfzn-current-controller').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
  await page.screenshot({ path: resolve(output, 'selected-controller.png') });
  await frame.getByText('返回', { exact: true }).click();
  for (const module of ['activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments']) await frame.evaluate(id => window.testVm.extensionManager.loadDeviceExtension(id), module);
  await frame.evaluate(() => {
    window.testVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.testBlockly = B; return B; } });
    window.testBlockly.Xml.clearWorkspaceAndLoadFromXml(window.testBlockly.Xml.textToDom('<xml><block type="event_whenarduinobegin" id="hw-hat" x="30" y="40"><next><block type="activeBuzzer_init" id="hw-init"><field name="PIN">4</field></block></next></block></xml>'), window.testBlockly.getMainWorkspace());
  });
  await frame.waitForFunction(() => window.testStore.getState().scratchGui.code.codeEditorValue.includes('activeBuzzerPin = 4'));
  assert.equal(await frame.evaluate(() => window.testEditor.getRawOptions().readOnly), true);
  await frame.getByRole('tab', { name: '手动编辑', exact: true }).click();
  const beforeEdit = await bridge('GET_STATE');
  await frame.evaluate(code => window.testEditor.setValue(code), manual);
  await frame.waitForFunction(code => window.testStore.getState().scratchGui.code.codeEditorValue === code, manual);
  const afterEdit = await bridge('GET_STATE'); assert.ok(afterEdit.dirty && afterEdit.editVersion > beforeEdit.editVersion);
  await frame.getByRole('tab', { name: '自动生成', exact: true }).click();
  await frame.waitForFunction(() => window.testEditor.getValue().includes('activeBuzzerPin = 4'));
  await frame.getByRole('tab', { name: '手动编辑', exact: true }).click();
  assert.equal(await frame.evaluate(() => window.testEditor.getValue()), manual);
  checks.generatedManualDraft = true;
  await frame.evaluate(() => {
    window.originalSave = window.testVm.saveProjectSb3;
    window.testVm.saveProjectSb3 = () => { const archive = window.originalSave(); return new Promise(resolve => { window.releaseArchive = async () => resolve(await archive); }); };
  });
  await page.evaluate(() => {
    const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID(); window.exportResult = null;
    addEventListener('message', function listen(e) { if (e.source !== target || e.data.requestId !== requestId) return; removeEventListener('message', listen); window.exportResult = e.data.payload; });
    target.postMessage({ protocol: 'cfzn.openblock', version: 1, type: 'EXPORT_PROJECT', requestId }, location.origin);
  });
  await frame.waitForFunction(() => !!window.releaseArchive);
  await frame.evaluate(code => { window.testEditor.setValue(code + '// later edit\n'); window.releaseArchive(); window.testVm.saveProjectSb3 = window.originalSave; }, manual);
  await page.waitForFunction(() => window.exportResult !== null);
  assert.match(await page.evaluate(() => window.exportResult.error.message), /归档期间项目已变化/);
  await frame.evaluate(code => window.testEditor.setValue(code), manual);
  checks.coherentArchiveSnapshot = true;
  await frame.getByTestId('upload-terminal').getByRole('button', { name: '连接串口', exact: true }).click();
  await frame.getByTestId('hardware-connect').getByRole('button', { name: '添加新设备', exact: true }).click();
  await frame.getByText(/串口已打开/).waitFor(); await closeModal('connectionModal');
  const serialBefore = await frame.evaluate(() => ({ opens: window.mockPort.opens, closes: window.mockPort.closes, options: window.mockPort.options, writes: window.mockPort.writes.length }));
  const blockGraph = await frame.evaluate(() => JSON.parse(window.testVm.toJSON()).targets.map(t => t.blocks));
  await switchMode('编程模式');
  await frame.getByRole('tab', { name: '造型', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'programming-costumes.png') });
  await frame.getByRole('tab', { name: '声音', exact: true }).click();
  await frame.getByRole('tab', { name: '代码', exact: true }).click();
  const motion = await frame.evaluate(async () => {
    const target = window.testVm.editingTarget, x = target.x;
    // Create and execute real native motion/looks/sound blocks through VM, preserving hardware scripts.
    const B = window.testBlockly;
    B.Xml.domToWorkspace(B.Xml.textToDom('<xml><block type="event_whenflagclicked" id="stage-hat" x="290" y="40"><next><block type="motion_movesteps" id="stage-motion"><value name="STEPS"><shadow type="math_number" id="stage-num"><field name="NUM">25</field></shadow></value><next><block type="looks_nextcostume" id="stage-looks"><next><block type="sound_play" id="stage-sound"><value name="SOUND_MENU"><shadow type="sound_sounds_menu" id="stage-sound-menu"><field name="SOUND_MENU">啁啾</field></shadow></value></block></next></block></next></block></next></block></xml>'), B.getMainWorkspace());
    await new Promise(r => setTimeout(r, 100)); const costume = target.currentCostume;
    window.testVm.greenFlag(); await new Promise(r => setTimeout(r, 400)); window.testVm.stopAll();
    return { beforeX: x, afterX: target.x, beforeCostume: costume, afterCostume: target.currentCostume, sounds: target.sprite.sounds.length };
  });
  assert.ok(motion.afterX !== motion.beforeX); assert.ok(motion.afterCostume !== motion.beforeCostume); assert.ok(motion.sounds > 0); checks.realStage = motion;
  await page.screenshot({ path: resolve(output, 'programming-stage.png') });
  const serialAfter = await frame.evaluate(() => ({ opens: window.mockPort.opens, closes: window.mockPort.closes, options: window.mockPort.options, writes: window.mockPort.writes.length }));
  assert.deepEqual(serialAfter, serialBefore); assert.equal((await bridge('GET_HARDWARE_STATE')).use, 'terminal');
  // Remove just the stage test stack so upload generation can focus on Arduino blocks again.
  await frame.evaluate(() => window.testBlockly.getMainWorkspace().getBlockById('stage-hat').dispose(false, false));
  await switchMode('上传模式'); assert.equal(await frame.evaluate(() => window.testEditor.getValue()), manual);
  assert.deepEqual(await frame.evaluate(() => JSON.parse(window.testVm.toJSON()).targets.map(t => t.blocks)), blockGraph);
  assert.deepEqual(await frame.evaluate(() => ({ opens: window.mockPort.opens, closes: window.mockPort.closes, options: window.mockPort.options, writes: window.mockPort.writes.length })), serialBefore);
  checks.noSerialSideEffects = true;
  await frame.evaluate(() => window.mockPort.input.enqueue(new TextEncoder().encode('mode shared RX\n')));
  await frame.getByRole('log', { name: '共享串口记录' }).filter({ hasText: 'mode shared RX' }).waitFor();
  await frame.getByLabel('上传串口发送内容', { exact: true }).fill('41 00 FF');
  await frame.getByLabel('上传串口发送格式', { exact: true }).selectOption('hex');
  await frame.getByTestId('upload-terminal').getByRole('button', { name: '发送', exact: true }).click();
  await frame.waitForFunction(() => window.mockPort.writes.length > 0);
  assert.deepEqual(await frame.evaluate(() => window.mockPort.writes.at(-1)), [65, 0, 255]);
  await frame.getByRole('button', { name: '▣ 代码区', exact: true }).click();
  assert.equal(await frame.locator('.cfzn-code-area').isVisible(), false); assert.equal((await bridge('GET_HARDWARE_STATE')).connection, 'open');
  await frame.getByRole('button', { name: '□ 代码区', exact: true }).click();
  await frame.locator('.cfzn-native-monaco .view-line').filter({ hasText: 'retained manual draft' }).waitFor();
  await frame.waitForFunction(() => {
    const host = document.querySelector('.cfzn-native-monaco'); const editor = document.querySelector('.cfzn-native-monaco .monaco-editor');
    return editor.getBoundingClientRect().height > 100 && Math.abs(host.clientWidth - editor.getBoundingClientRect().width) < 3;
  });
  await page.screenshot({ path: resolve(output, 'upload-desktop.png') });
  const geometry = await frame.evaluate(() => [...document.querySelector('[data-cfzn-menu-host]').children].map(el => ({ class: el.className, width: el.getBoundingClientRect().width, scroll: el.scrollWidth, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })));
  assert.ok(geometry.find(row => row.class === 'cfzn-project-tools').width >= geometry.find(row => row.class === 'cfzn-project-tools').scroll - 1);
  for (let i = 1; i < geometry.length; i++) assert.ok(geometry[i].left >= geometry[i - 1].right - 1);
  checks.menuGeometry = geometry;
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.screenshot({ path: resolve(output, 'upload-narrow.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  const savedBytes = await archiveBytes(); const files = unzipSync(new Uint8Array(savedBytes));
  assert.equal(JSON.parse(strFromU8(files['cfzn/editor.json'])).manualSource, manual);
  await writeFile(resolve(output, 'draft-project.ob'), new Uint8Array(savedBytes));
  const invalid = { ...files, 'cfzn/editor.json': strToU8('{"version":99,"codeMode":"manual"}') };
  const beforeInvalid = await bridge('GET_STATE'); const portBeforeInvalid = await frame.evaluate(() => window.mockPort.opens);
  const rejected = await loadArchive(zipSync(invalid)); assert.equal(rejected.ok, false); assert.match(rejected.error.message, /版本|无效/);
  assert.deepEqual(await bridge('GET_STATE'), beforeInvalid); assert.equal(await frame.evaluate(() => window.mockPort.opens), portBeforeInvalid);
  checks.invalidMetadataPreservesDocument = true;
  await switchMode('编程模式');
  const programmingBytes = await archiveBytes(); const programFiles = unzipSync(new Uint8Array(programmingBytes));
  assert.equal(JSON.parse(strFromU8(programFiles['project.json'])).programMode, 'realtime');
  assert.equal(JSON.parse(strFromU8(programFiles['project.json'])).deviceExtensions.length, 6);
  // Fresh browser context: no inherited module factories, UI state or Monaco model.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fresh = await context.newPage();
  await fresh.goto(origin); await fresh.locator('iframe').waitFor();
  const freshFrame = await (await fresh.locator('iframe').elementHandle()).contentFrame();
  await freshFrame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
  const reply = await fresh.evaluate(bytes => new Promise(resolve => {
    const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
    addEventListener('message', function listen(e) { if (e.source !== target || e.data.requestId !== requestId) return; removeEventListener('message', listen); resolve(e.data.payload); });
    target.postMessage({ protocol: 'cfzn.openblock', version: 1, type: 'LOAD_PROJECT', requestId, payload: { bytes: new Uint8Array(bytes).buffer, title: 'Reopened draft' } }, location.origin);
  }), programmingBytes);
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.equal(await freshFrame.getByRole('button', { name: '编程模式', exact: true }).getAttribute('aria-pressed'), 'true');
  await freshFrame.getByRole('button', { name: '上传模式', exact: true }).click();
  await freshFrame.locator('.monaco-editor').waitFor(); await freshFrame.getByText('mode-v03', { exact: false }).first().waitFor();
  assert.equal(await freshFrame.getByRole('tab', { name: '手动编辑', exact: true }).getAttribute('aria-selected'), 'true');
  await fresh.screenshot({ path: resolve(output, 'fresh-reopened.png') }); await context.close();
  checks.archiveFreshRestore = true;
  await switchMode('上传模式');
  await frame.getByRole('button', { name: '编译和设备设置', exact: true }).click();
  await frame.getByRole('combobox').filter({ has: frame.locator('option[value="COM-MOCK"]') }).selectOption('COM-MOCK');
  holdUpload = true;
  await frame.getByRole('button', { name: '编译并上传', exact: true }).click();
  await frame.getByText('正在上传', { exact: true }).waitFor();
  assert.ok(calls.some(c => c.path.endsWith('/builds') && c.body.code === manual));
  assert.equal(await frame.locator('[data-testid="mode-controls"] button').first().isDisabled(), true);
  await frame.getByRole('button', { name: '取消作业', exact: true }).click();
  await frame.getByText('上传：cancelled', { exact: true }).waitFor();
  await frame.getByRole('button', { name: '关闭', exact: true }).click(); holdUpload = false;
  checks.selectedSourceAndBusy = true;
  const historical = { ...files }; delete historical['cfzn/editor.json'];
  const historicalResult = await loadArchive(zipSync(historical)); assert.equal(historicalResult.ok, true, JSON.stringify(historicalResult));
  assert.equal(await frame.getByRole('tab', { name: '自动生成', exact: true }).getAttribute('aria-selected'), 'true');
  await frame.getByRole('tab', { name: '手动编辑', exact: true }).click();
  assert.notEqual(await frame.evaluate(() => window.testEditor.getValue()), manual);
  checks.historicalClearsDraft = true;
  await frame.evaluate(code => window.testEditor.setValue(code), manual);
  await frame.evaluate(() => window.testVm.extensionManager.loadDeviceURL(window.CFZNDeviceMetadata.find(d => d.deviceId === 'arduinoEsp32')));
  assert.equal(await frame.evaluate(() => window.testEditor.getValue()), manual);
  await frame.getByText('手稿 · 当前主控：ESP32 · 切板后请核对源码', { exact: true }).waitFor();
  await switchMode('编程模式'); await switchMode('上传模式');
  assert.equal(await frame.evaluate(() => window.testEditor.getValue()), manual);
  assert.equal(await frame.evaluate(() => window.testVm.runtime.getLoadedDeviceExtension().length), 6);
  await frame.evaluate(async () => {
    try { await window.testVm.extensionManager.loadDeviceURL({ deviceId: 'unknown-board', type: 'arduino', name: 'Unknown board' }); throw new Error('unexpected acceptance'); }
    catch (error) { if (String(error).includes('unexpected acceptance')) throw error; }
  });
  assert.equal(await frame.evaluate(() => window.testEditor.getValue()), manual);
  checks.esp32ModesAndBoardDraft = true;
  await bridge('NEW_PROJECT');
  assert.equal(await frame.getByRole('button', { name: '编程模式', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal((await bridge('GET_HARDWARE_STATE')).deviceId, null);
  checks.newProjectProgramming = true;
  assert.equal(await frame.locator('[data-cfzn-menu-host] > .cfzn-project-tools button').count(), 5);
  assert.equal(await frame.evaluate(() => 'CFZNDeviceFactories' in window), false);
  assert.deepEqual(errors, []); assert.equal(sockets.length, 0);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, calls, errors, sockets }, null, 2));
  console.log(JSON.stringify({ checks, errors, sockets }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure-current.png') });
  await writeFile(resolve(output, 'failure-current.json'), JSON.stringify({ error: String(error), checks, errors, consoleErrors, calls, text: await frame?.locator('body').innerText() }, null, 2)); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); }
