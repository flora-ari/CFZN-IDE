import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const web = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(web, 'evidence/connection-modal-v04'); await mkdir(output, { recursive: true });
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
    opens = 0; closes = 0; opened = false; writes = []; failClose = false; failOpen = false;
    getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
    async open(options) {
      if (this.failOpen) throw new Error('simulated open failure'); if (this.opened) throw new Error('second owner'); if ([window.mockPort, window.mockPort2].some(p => p && p !== this && p.opened)) throw new Error('two physical owners'); this.opened = true; this.opens++; this.options = options;
      this.readable = new ReadableStream({ start: c => { this.input = c; } });
      this.writable = new WritableStream({ write: bytes => { this.writes.push([...bytes]); } });
    }
    async close() {
      if (this.readable.locked || this.writable.locked) throw new Error('locked stream');
      if (this.failClose) throw new Error('simulated close failure'); this.opened = false; this.closes++;
    }
  }
  window.mockPort = new MockPort(); window.mockPort2 = new MockPort(); window.authorized = true;
  Object.defineProperty(navigator, 'serial', { configurable: true, value: {
    getPorts: async () => { if (window.scanFails) throw new Error('simulated enumeration failure'); return window.authorized ? [window.mockPort, window.mockPort2] : []; },
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
const state = () => bridge('GET_HARDWARE_STATE');
async function waitState(predicate, description) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { const value = await state(); if (predicate(value)) return value; await new Promise(r => setTimeout(r, 30)); }
  throw new Error(`State timeout: ${description}: ${JSON.stringify(await state())}`);
}
async function closeModal() { await frame.evaluate(() => window.testStore.dispatch({ type: 'scratch-gui/modals/CLOSE_MODAL', modal: 'connectionModal' })); }
try {
  await page.goto(origin); await page.locator('iframe').waitFor();
  frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
  const bytes = [...await (await import('node:fs/promises')).readFile(resolve(web, 'evidence/mode-ui-v03/draft-project.ob'))];
  const loaded = await page.evaluate(bytes => new Promise(resolve => {
    const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
    addEventListener('message', function listen(e) { if (e.source !== target || e.data.requestId !== requestId) return; removeEventListener('message', listen); resolve(e.data.payload); });
    target.postMessage({ protocol: 'cfzn.openblock', version: 1, type: 'LOAD_PROJECT', requestId, payload: { bytes: new Uint8Array(bytes).buffer, title: 'Connection v0.4 mock' } }, location.origin);
  }), bytes);
  assert.equal(loaded.ok, true, JSON.stringify(loaded));
  await frame.evaluate(() => { const render = CFZNOpenBlock.renderLibrary; CFZNOpenBlock.renderLibrary = (...args) => { window.testVm = args[2].vm; return render(...args); }; });
  await frame.locator('[class*="extension-button"]').first().click();
  await frame.waitForFunction(() => !!window.testVm);
  await frame.evaluate(() => window.testStore.dispatch({ type: 'scratch-gui/modals/CLOSE_MODAL', modal: 'extensionLibrary' }));
  await frame.getByTestId('upload-terminal').getByRole('button', { name: '连接串口', exact: true }).click();
  const modal = frame.getByTestId('hardware-connect'); await modal.waitFor();
  await frame.getByText('连接 FireBeetle ESP32-E', { exact: true }).waitFor();
  await modal.getByRole('table').getByText('Silicon Labs CP210x', { exact: true }).first().waitFor();
  assert.equal(await frame.evaluate(() => window.serialRequests), 0);
  assert.equal((await state()).browserPorts.length, 2);
  assert.equal((await state()).portId, '');
  assert.equal(await page.getByTestId('serial-panel').count(), 0);
  assert.equal(await frame.locator('.cfzn-project-tools button').count(), 5);
  await page.screenshot({ path: resolve(output, 'authorized-desktop.png') });
  const ids = (await state()).browserPorts.map(port => port.id);
  const row = id => modal.locator(`tr[data-port-id="${id}"]`);
  await row(ids[0]).getByRole('button', { name: '连接', exact: true }).click();
  await waitState(s => s.connection === 'open' && !s.serialOperation, 'authorized connect');
  await frame.waitForFunction(() => window.testVm.getPeripheralIsConnected('firebeetleEsp32E'));
  assert.equal(await frame.evaluate(() => window.serialRequests), 0);
  await modal.getByLabel('连接波特率').fill('57600'); await modal.getByRole('button', { name: '应用', exact: true }).click();
  await waitState(s => s.options.baudRate === 57600 && !s.serialOperation, 'baud commit');
  assert.equal(await frame.getByLabel('上传串口波特率').inputValue(), '57600');
  assert.equal(await frame.evaluate(() => window.testStore.getState().scratchGui.hardwareConsole.baudrate), '57600');
  assert.equal(await frame.evaluate(() => window.mockPort.opens), 2);
  await modal.getByRole('button', { name: '应用', exact: true }).click();
  assert.equal(await frame.evaluate(() => window.mockPort.opens), 2);
  await modal.getByLabel('连接弹窗本机烧录端口').selectOption('COM-MOCK');
  assert.equal((await state()).portId, 'COM-MOCK');
  checks.authorizedConnectAndSync = true;
  const beforeCancel = await state(); await frame.evaluate(() => { window.chooserCancel = true; });
  await modal.getByRole('button', { name: '添加新设备', exact: true }).click();
  await waitState(s => !s.serialOperation && s.message.includes('未选择'), 'cancel chooser');
  assert.equal((await state()).sessionId, beforeCancel.sessionId);
  assert.equal(await frame.evaluate(() => window.serialRequests), 1); checks.cancelKeepsSession = true;
  await row(ids[1]).getByRole('button', { name: '切换', exact: true }).click();
  await waitState(s => s.browserPortId === ids[1] && !s.serialOperation, 'port switch');
  assert.equal(await frame.evaluate(() => window.mockPort.opened), false);
  assert.equal(await frame.evaluate(() => window.mockPort2.options.baudRate), 57600);
  await frame.evaluate(() => { window.mockPort.failOpen = true; });
  await row(ids[0]).getByRole('button', { name: '切换', exact: true }).click();
  await waitState(s => s.connection === 'open' && s.browserPortId === ids[1] && !s.serialOperation && s.serialError.includes('已恢复'), 'restore old');
  await modal.getByText('已恢复原连接', { exact: true }).waitFor();
  assert.equal(await frame.evaluate(() => window.testVm.getPeripheralIsConnected('firebeetleEsp32E')), true);
  await page.screenshot({ path: resolve(output, 'recovered-desktop.png') }); checks.switchAndRecovery = true;
  await frame.evaluate(() => { window.scanFails = true; }); await modal.getByRole('button', { name: '刷新设备', exact: true }).click();
  await waitState(s => !!s.scanError && !s.scanning, 'scan failure'); assert.equal((await state()).connection, 'open');
  await frame.evaluate(() => { window.scanFails = false; });
  await row(ids[1]).getByRole('button', { name: '断开', exact: true }).click();
  await waitState(s => s.connection === 'disconnected' && !s.serialOperation, 'disconnect');
  await frame.waitForFunction(() => !window.testVm.getPeripheralIsConnected('firebeetleEsp32E'));
  await row(ids[0]).getByRole('button', { name: '连接', exact: true }).click();
  await waitState(s => s.connection === 'error' && !s.serialOperation, 'first connection failure');
  await page.screenshot({ path: resolve(output, 'failure-desktop.png') });
  await row(ids[1]).getByRole('button', { name: '连接', exact: true }).click();
  await waitState(s => s.connection === 'open' && !s.serialOperation, 'reconnect');
  await frame.waitForFunction(() => window.testVm.getPeripheralIsConnected('firebeetleEsp32E'));
  const connectedId = (await state()).sessionId;
  await modal.getByLabel('连接波特率').press('Escape');
  await modal.waitFor({ state: 'hidden' });
  assert.equal((await state()).sessionId, connectedId);
  const beforeReopen = await frame.evaluate(() => window.serialRequests);
  await frame.locator('[data-cfzn-menu-host]').getByText(/已授权串口/).first().click();
  await modal.waitFor();
  assert.equal(await frame.evaluate(() => window.serialRequests), beforeReopen);
  checks.nativeMenuAndCloseKeepSession = true;
  await page.unroute('http://127.0.0.1:3002/api/v1/hardware/**');
  await page.route('http://127.0.0.1:3002/api/v1/hardware/**', route => route.abort('failed'));
  await closeModal(); await bridge('OPEN_HARDWARE_CONNECT');
  await modal.getByText('本机烧录服务暂不可用，浏览器串口仍可连接。', { exact: true }).waitFor();
  assert.equal((await state()).connection, 'open');
  assert.equal((await state()).sessionId, connectedId); checks.localServiceIndependent = true;
  for (const width of [1440, 1000, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await frame.locator('.cfzn-connection-modal').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, JSON.stringify(bounds));
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 901, JSON.stringify(bounds));
    const action = await row(ids[1]).getByRole('button', { name: '断开', exact: true }).boundingBox();
    assert.ok(action.x >= bounds.x && action.x + action.width <= bounds.x + bounds.width, JSON.stringify({ bounds, action }));
    await page.screenshot({ path: resolve(output, `connected-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await frame.evaluate(() => window.mockPort2.dispatchEvent(new Event('disconnect')));
  await waitState(s => s.connection === 'disconnected' && !s.serialOperation && !s.browserPortId, 'unplug');
  await frame.waitForFunction(() => !window.testVm.getPeripheralIsConnected('firebeetleEsp32E') && window.testStore.getState().scratchGui.connectionModal.peripheralName === null);
  await page.screenshot({ path: resolve(output, 'unplug-desktop.png') }); checks.nativeDisconnectSync = true;
  const assets = await frame.locator('.cfzn-connection-result img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)); assert.equal(assets, true);
  await closeModal();
  assert.deepEqual(errors, []); assert.equal(calls.some(c => c.method === 'POST'), false);
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, physicalSerial: false, calls, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  console.log('STATE', JSON.stringify(frame ? await state().catch(() => null) : null));
  console.log('BODY', (await frame?.locator('body').innerText())?.slice(-4500));
  await page.screenshot({ path: resolve(output, 'failure.png') }); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
