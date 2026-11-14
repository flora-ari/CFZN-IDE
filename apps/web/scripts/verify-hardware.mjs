import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const web = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(web, 'evidence/hardware-v02'); await mkdir(output, { recursive: true });
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
const errors = [], sockets = [], calls = [];
const checks = {};
page.on('pageerror', error => errors.push(String(error)));
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
async function idle(timeout = 20000) { await expect.poll(async () => (await bridge('GET_HARDWARE_STATE')).busy, { timeout }).toBe(false); }
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.locator('iframe').waitFor();
  frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
  await frame.evaluate(() => {
    const original = window.CFZNOpenBlock.renderLibrary;
    window.CFZNOpenBlock.renderLibrary = (...args) => { window.testVm = args[2].vm; return original(...args); };
  });
  await frame.locator('[class*="extension-button"]').first().click();
  await frame.waitForFunction(() => !!window.testVm);
  await frame.evaluate(() => window.testStore.dispatch({ type: 'scratch-gui/modals/CLOSE_MODAL', modal: 'extensionLibrary' }));
  const archiveResults = [];
  for (const id of ids) {
    await frame.evaluate(async id => {
      const metadata = window.CFZNDeviceMetadata.find(d => d.deviceId === id);
      await window.testVm.extensionManager.loadDeviceURL(metadata);
      for (const module of ['activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments']) await window.testVm.extensionManager.loadDeviceExtension(module);
    }, id);
    assert.equal((await bridge('GET_HARDWARE_STATE')).deviceId, id);
    await frame.evaluate(() => {
      window.testVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.testBlockly = B; return B; } });
      window.testBlockly.Xml.clearWorkspaceAndLoadFromXml(window.testBlockly.Xml.textToDom('<xml><block type="event_whenarduinobegin" id="hw-hat" x="30" y="40"><next><block type="activeBuzzer_init" id="hw-init"><field name="PIN">4</field></block></next></block></xml>'), window.testBlockly.getMainWorkspace());
    });
    await frame.waitForFunction(() => window.testVm.editingTarget.blocks._blocks['hw-hat']?.next === 'hw-init');
    const saved = await frame.evaluate(async () => {
      const archive = await window.testVm.saveProjectSb3(); const bytes = await archive.arrayBuffer();
      const before = JSON.parse(window.testVm.toJSON());
      await window.testVm.loadProject(bytes);
      return { device: window.testVm.runtime.getDevice().deviceId, size: bytes.byteLength, json: JSON.parse(window.testVm.toJSON()), before,
        code: window.testBlockly.Arduino.workspaceToCode(window.testBlockly.getMainWorkspace()) };
    });
    // The original VM normalizes SVG asset hashes on load. Check the complete visual metadata,
    // sound references and block graph rather than treating that upstream normalization as loss.
    const preserved = project => project.targets.map(t => ({ blocks: t.blocks,
      costumes: t.costumes.map(({ assetId, md5ext, ...metadata }) => metadata), sounds: t.sounds }));
    assert.deepEqual(preserved(saved.json), preserved(saved.before));
    assert.match(saved.code, /activeBuzzerPin = 4/);
    assert.equal(saved.device, id); assert.ok(saved.size > 1000); assert.equal(saved.json.deviceExtensions.length, 6); archiveResults.push({ id, bytes: saved.size, modules: saved.json.deviceExtensions });
  }
  checks.fiveBoardsArchiveRestore = archiveResults;
  await frame.evaluate(() => window.testVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.testBlockly = B; return B; } }));
  const pinMenus = await frame.evaluate(() => Object.fromEntries(['arduino_pin_setDigitalOutput', 'arduino_pin_readAnalogPin'].map(op => [op, window.testBlockly.Device.getPinOptions(op)])));
  assert.ok(pinMenus.arduino_pin_setDigitalOutput.some(([text, value]) => text.includes('D2') && value === '25'));
  assert.ok(!pinMenus.arduino_pin_setDigitalOutput.some(([, value]) => ['34', '35', '36', '39'].includes(value)));
  assert.ok(pinMenus.arduino_pin_readAnalogPin.some(([text, value]) => text.includes('A0') && value === '36'));
  checks.firebeetlePins = pinMenus;
  await bridge('OPEN_HARDWARE_CONNECT');
  await frame.getByTestId('hardware-connect').waitFor(); await frame.getByText('尚未选择串口。', { exact: true }).waitFor();
  await frame.evaluate(() => { window.chooserCancel = true; });
  await frame.getByRole('button', { name: '添加新设备', exact: true }).click();
  await frame.getByText('未选择串口。', { exact: true }).waitFor();
  assert.equal((await bridge('GET_HARDWARE_STATE')).connection, 'disconnected');
  await frame.evaluate(() => { window.chooserCancel = false; });
  await frame.getByRole('button', { name: '添加新设备', exact: true }).click();
  await frame.getByText(/串口已打开/).waitFor();
  const connected = await bridge('GET_HARDWARE_STATE'); assert.equal(connected.connection, 'open');
  assert.equal(await page.evaluate(() => window.serialRequests), 0); assert.equal(await frame.evaluate(() => window.serialRequests), 2);
  await page.screenshot({ path: resolve(output, 'native-connected.png') });
  await frame.evaluate(() => window.testStore.dispatch({ type: 'scratch-gui/modals/CLOSE_MODAL', modal: 'connectionModal' }));
  await frame.evaluate(() => { window.nativeRx = []; window.testVm.on('PERIPHERAL_RECIVE_DATA', bytes => window.nativeRx.push([...bytes])); });
  await frame.evaluate(() => window.mockPort.input.enqueue(new TextEncoder().encode('shared RX\n')));
  await frame.getByRole('log', { name: '共享串口记录' }).filter({ hasText: 'shared RX' }).waitFor();
  await frame.waitForFunction(() => window.nativeRx.length > 0);
  assert.equal(await frame.evaluate(() => new TextDecoder().decode(new Uint8Array(window.nativeRx[0]))), 'shared RX\n');
  await frame.getByLabel('上传串口发送内容', { exact: true }).fill('41 00 FF');
  await frame.getByLabel('上传串口发送格式', { exact: true }).selectOption('hex');
  await frame.getByTestId('upload-terminal').getByRole('button', { name: '发送', exact: true }).click();
  await frame.waitForFunction(() => window.mockPort.writes.length > 0);
  assert.deepEqual(await frame.evaluate(() => window.mockPort.writes.at(-1)), [65, 0, 255]);
  await frame.evaluate(() => window.testVm.writeToPeripheral('firebeetleEsp32E', 'native TX\n'));
  await frame.waitForFunction(() => window.mockPort.writes.length > 1);
  assert.equal(await frame.evaluate(() => new TextDecoder().decode(new Uint8Array(window.mockPort.writes.at(-1)))), 'native TX\n');
  assert.equal(await frame.evaluate(() => window.mockPort.opens), 1);
  checks.sharedSerial = true;
  await frame.getByRole('button', { name: '编译 / 烧录设置' }).click();
  const profileSelect = frame.getByRole('combobox').filter({ has: frame.locator('option[value="mock-firebeetleEsp32E"]') });
  await profileSelect.waitFor();
  await frame.getByRole('combobox').filter({ has: frame.locator('option[value="COM-MOCK"]') }).selectOption('COM-MOCK');
  const code = '// manually edited C++\nvoid setup(){Serial.begin(115200);}\nvoid loop(){Serial.println(42);delay(1000);}\n';
  await frame.evaluate(code => window.testStore.dispatch({ type: 'scratch-gui/code/UPDATE_CODE', value: code }), code);
  await frame.getByRole('button', { name: '编译并上传', exact: true }).click();
  await expect.poll(async () => (await bridge('GET_HARDWARE_STATE')).busy).toBe(true);
  await idle();
  assert.equal(calls.find(c => c.path.endsWith('/builds')).body.code, code);
  assert.equal((await bridge('GET_HARDWARE_STATE')).job.state, 'succeeded');
  assert.equal(await frame.evaluate(() => window.mockPort.opens), 2);
  checks.uploadReleaseAndRestore = true;
  await page.screenshot({ path: resolve(output, 'native-upload-success.png') });
  holdUpload = true;
  await frame.getByRole('button', { name: '编译并上传', exact: true }).click();
  await frame.waitForFunction(() => document.querySelector('[data-testid="hardware-progress"]').textContent.includes('正在上传'));
  await frame.getByRole('button', { name: '取消作业', exact: true }).click(); await idle();
  assert.equal((await bridge('GET_HARDWARE_STATE')).job.state, 'cancelled'); holdUpload = false; checks.cancel = true;
  await frame.evaluate(() => { window.mockPort.failClose = true; });
  const uploadsBefore = calls.filter(c => c.path.endsWith('/uploads')).length;
  await frame.getByRole('button', { name: '编译并上传', exact: true }).click();
  await frame.getByTestId('hardware-progress').getByRole('alert').filter({ hasText: 'close failure' }).waitFor(); await idle();
  assert.equal(calls.filter(c => c.path.endsWith('/uploads')).length, uploadsBefore);
  assert.match((await bridge('GET_HARDWARE_STATE')).error, /close failure/); checks.failedReleaseBlocksUpload = true;
  await frame.evaluate(() => { window.mockPort.failClose = false; });
  await frame.getByRole('button', { name: '关闭', exact: true }).click();
  await frame.getByTestId('upload-terminal').getByRole('button', { name: '断开', exact: true }).click();
  await frame.getByTestId('upload-terminal').getByRole('status').filter({ hasText: '未连接' }).waitFor();
  assert.equal((await bridge('GET_HARDWARE_STATE')).browserPortId, null);
  assert.equal(await frame.locator('[data-cfzn-menu-host] > .cfzn-project-tools button').count(), 5);
  assert.equal(await frame.evaluate(() => 'CFZNDeviceFactories' in window), false);
  assert.equal(sockets.filter(url => /20111|20112/.test(url)).length, 0);
  assert.deepEqual(errors, []);
  checks.noVmInjectionOrLink = true;
  if (process.argv.includes('--real-compile')) {
    await page.unroute('http://127.0.0.1:3002/api/v1/hardware/**');
    // The isolated random page origin is not in the executor's development allowlist.
    // Forward only compile/read/cancel using the configured 5173 Origin; never upload.
    await page.route('http://127.0.0.1:3002/api/v1/hardware/**', async route => {
      const request = route.request();
      if (new URL(request.url()).pathname.endsWith('/uploads')) { await route.abort(); return; }
      const response = await fetch(request.url(), { method: request.method(), headers: { Origin: 'http://127.0.0.1:5173', ...(request.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(request.method() === 'POST' ? { body: request.postData() } : {}) });
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    await frame.getByRole('button', { name: '编译 / 烧录设置' }).click();
    await frame.getByRole('combobox').filter({ has: frame.locator('option[value="firebeetle-esp32e-4mb"]') }).waitFor({ timeout: 15000 });
    await frame.evaluate(code => window.testStore.dispatch({ type: 'scratch-gui/code/UPDATE_CODE', value: code }), code);
    await frame.getByRole('button', { name: '编译检查', exact: true }).click();
    await expect.poll(async () => (await bridge('GET_HARDWARE_STATE')).busy).toBe(true);
    await idle(180000);
    const result = await bridge('GET_HARDWARE_STATE');
    assert.equal(result.job.kind, 'build'); assert.equal(result.job.state, 'succeeded', result.error || result.job.error?.message);
    checks.realLocalCompile = { job: result.job, logs: result.logs };
    await writeFile(resolve(output, 'real-compile-result.json'), JSON.stringify({ job: result.job, logs: result.logs,
      originForwarding: 'isolated random port -> configured 5173 Origin; compile/read/cancel only; no upload' }, null, 2));
    await page.screenshot({ path: resolve(output, 'real-compile-success.png') });
  }
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, errors, sockets, calls }, null, 2));
  console.log(JSON.stringify({ checks: Object.keys(checks), realCompileJob: checks.realLocalCompile?.job, errors, sockets }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure-current.png') });
  await writeFile(resolve(output, 'failure-current.json'), JSON.stringify({ error: String(error), checks, errors, sockets, calls, text: await frame?.locator('body').innerText() }, null, 2)); throw error;
} finally { await browser.close(); await new Promise(r => server.close(r)); }
