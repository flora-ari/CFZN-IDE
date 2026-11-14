import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';

const web = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(web, 'evidence/serial-text'); await mkdir(output, { recursive: true });
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
try {
  await page.goto(origin); await page.locator('iframe').waitFor();
  frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
  const bytes = [...await (await import('node:fs/promises')).readFile(resolve(web, 'evidence/mode-ui-v03/draft-project.ob'))];
  const response = await page.evaluate(bytes => new Promise(resolve => {
    const target = document.querySelector('iframe').contentWindow, requestId = crypto.randomUUID();
    addEventListener('message', function listen(e) { if (e.source !== target || e.data.requestId !== requestId) return; removeEventListener('message', listen); resolve(e.data.payload); });
    target.postMessage({ protocol: 'cfzn.openblock', version: 1, type: 'LOAD_PROJECT', requestId, payload: { bytes: new Uint8Array(bytes).buffer, title: 'Serial text fixture' } }, location.origin);
  }), bytes);
  assert.equal(response.ok, true, JSON.stringify(response));
  await frame.getByTestId('upload-terminal').getByRole('button', { name: '连接串口', exact: true }).click();
  await frame.getByTestId('hardware-connect').getByRole('button', { name: '添加新设备', exact: true }).click();
  await frame.getByText(/串口已打开/).waitFor();
  await frame.evaluate(() => window.testStore.dispatch({ type: 'scratch-gui/modals/CLOSE_MODAL', modal: 'connectionModal' }));
  const uploadRows = () => frame.locator('.cfzn-terminal-log > div').evaluateAll(rows => rows.map(row => ({ direction: row.firstElementChild.textContent.trim(), text: row.textContent.slice(row.firstElementChild.textContent.length) })));
  assert.equal(await page.getByTestId('serial-panel').count(), 0);
  assert.equal(await frame.getByTestId('serial-button').count(), 0);
  const push = bytes => frame.evaluate(bytes => window.mockPort.input.enqueue(new Uint8Array(bytes)), [...bytes]);
  const encode = text => new TextEncoder().encode(text);
  await push(encode('h'));
  await frame.getByRole('log', { name: '共享串口记录' }).filter({ hasText: 'h' }).waitFor();
  assert.deepEqual(await uploadRows(), [{ direction: 'RX', text: 'h' }]);
  await push(encode('ello\r')); await push(encode('\n'));
  for (const byte of encode('中文🙂\r\n')) await push(Uint8Array.of(byte));
  await push(encode('pro')); await push(encode('mpt> '));
  await frame.getByRole('log', { name: '共享串口记录' }).filter({ hasText: 'prompt> ' }).waitFor();
  const expected = [{ direction: 'RX', text: 'hello' }, { direction: 'RX', text: '中文🙂' }, { direction: 'RX', text: 'prompt> ' }];
  assert.deepEqual(await uploadRows(), expected);
  checks.fragmentedText = { upload: await uploadRows() };
  await page.screenshot({ path: resolve(output, 'upload-text.png') });
  await frame.getByLabel('上传串口接收格式', { exact: true }).selectOption('hex');
  const uploadHex = (await uploadRows()).map(row => row.text).join(' ').replace(/\s+/g, ' ').trim();
  const expectedHex = [...encode('hello\r\n中文🙂\r\nprompt> ')].map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  assert.equal(uploadHex, expectedHex);
  checks.rawHex = true;
  await frame.getByTestId('upload-terminal').getByRole('button', { name: '清空', exact: true }).click();
  await frame.getByLabel('上传串口接收格式', { exact: true }).selectOption('text');
  await push(encode('new')); await push(encode(' line\n'));
  await frame.getByRole('log', { name: '共享串口记录' }).filter({ hasText: 'new line' }).waitFor();
  assert.deepEqual(await uploadRows(), [{ direction: 'RX', text: 'new line' }]);
  checks.clear = true;
  assert.equal(await frame.evaluate(() => window.mockPort.opens), 1);
  assert.equal(calls.some(call => call.method === 'POST'), false); assert.deepEqual(errors, []);
  await bridge('DISCONNECT_HARDWARE');
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, errors, physicalSerial: false }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }); throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
