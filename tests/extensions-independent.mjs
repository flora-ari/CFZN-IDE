// Independent browser/VM/API acceptance for the controller/module addendum.
// Run: node tests/extensions-independent.mjs
// Requires an existing production preview (default 5174); never stops user services.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const { createApp } = require('../apps/api/dist/app.js');
const yazl = require('../apps/api/node_modules/yazl');
const url = process.env.CFZN_TEST_URL || 'http://127.0.0.1:5174';
const out = resolve(process.env.CFZN_TEST_EVIDENCE || 'tests/evidence/extensions-independent');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
await mkdir(out, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'cfzn-independent-extensions-'));
const app = await createApp(temp);
await app.listen(0, '127.0.0.1');
const apiOrigin = await app.getUrl();
const browser = await chromium.launch({ executablePath: process.env.CFZN_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const results = [], requests = [], errors = [], contexts = [];
let screenshotPage;
const filter = process.env.CFZN_TEST_FILTER && new RegExp(process.env.CFZN_TEST_FILTER, 'i');
const names = ['有源蜂鸣器', '雾化模块', '人体红外', '火焰传感器', '水滴传感器', '积木注释'];
const ids = ['activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments'];
const opcodes = ['activeBuzzer_init', 'activeBuzzer_on', 'activeBuzzer_off', 'atomizer_init', 'atomizer_setState', 'atomizer_toggle', 'pirSensor_init', 'pirSensor_detected', 'flameSensor_readDigital', 'flameSensor_readAnalog', 'raindropSensor_readDigital', 'raindropSensor_readAnalog', 'moreComments_commandBlock', 'moreComments_branchBlock'];
const sha = b => createHash('sha256').update(b).digest('hex');
const json = (name, data) => writeFile(join(out, name), JSON.stringify(data, null, 2));
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([80, 75, 5, 6]));
  assert.ok(end >= 0);
  let c = buffer.readUInt32LE(end + 16);
  const files = {};
  while (buffer.readUInt32LE(c) === 0x02014b50) {
    const n = buffer.readUInt16LE(c + 28), size = buffer.readUInt32LE(c + 20), offset = buffer.readUInt32LE(c + 42);
    const name = buffer.subarray(c + 46, c + 46 + n).toString();
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = buffer.subarray(start, start + size);
    files[name] = buffer.readUInt16LE(c + 10) === 8 ? inflateRawSync(data) : data;
    c += 46 + n + buffer.readUInt16LE(c + 30) + buffer.readUInt16LE(c + 32);
  }
  return files;
}
async function mutateArchive(buffer, change) {
  const files = unzip(buffer), project = JSON.parse(files['project.json']);
  change(project);
  files['project.json'] = Buffer.from(JSON.stringify(project));
  const zip = new yazl.ZipFile();
  for (const [name, bytes] of Object.entries(files)) zip.addBuffer(bytes, name);
  const chunks = [];
  zip.outputStream.on('data', chunk => chunks.push(chunk));
  const done = new Promise((ok, fail) => { zip.outputStream.on('end', ok); zip.outputStream.on('error', fail); });
  zip.end(); await done; return Buffer.concat(chunks);
}
function semantic(buffer) {
  const files = unzip(buffer), p = JSON.parse(files['project.json']);
  const assets = {};
  for (const [ti, target] of p.targets.entries()) {
    for (const kind of ['costumes', 'sounds']) for (const [i, asset] of (target[kind] || []).entries()) {
      const file = asset.md5ext || `${asset.assetId}.${asset.dataFormat}`;
      const identity = `${target.isStage ? 'stage' : 'sprite'}:${target.name}#${ti}/${kind}:${asset.name}#${i}`;
      assert.ok(files[file], `missing reference ${identity} -> ${file}`);
      const { assetId, md5ext, ...metadata } = asset;
      assets[identity] = { bytes: files[file].length, sha256: sha(files[file]), metadata };
    }
  }
  return { deviceId: p.device?.deviceId, programMode: p.programMode, deviceExtensions: [...(p.deviceExtensions || [])].sort(),
    extensions: [...(p.extensions || [])].sort(), targets: p.targets.map(t => ({ name: t.name, isStage: t.isStage, blocks: t.blocks, currentCostume: t.currentCostume })), assets };
}
function sameArchiveState(a, b) { assert.deepEqual(semantic(a), semantic(b)); }
async function test(name, fn, p) {
  if (filter && !filter.test(name)) return;
  screenshotPage = p;
  const start = Date.now();
  try { const detail = await fn(); results.push({ name, status: 'PASS', ms: Date.now() - start, detail }); console.log('PASS', name); return true; }
  catch (e) { results.push({ name, status: 'FAIL', ms: Date.now() - start, error: String(e), stack: e.stack }); console.log('FAIL', name, String(e));
    if (screenshotPage) await screenshotPage.screenshot({ path: join(out, `FAIL-${results.length}.png`) }).catch(() => {}); await json('results.json', results); return false; }
}
async function create(label) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); contexts.push(c);
  await c.route('**/api/**', async route => {
    const req = route.request(); const u = new URL(req.url());
    const response = await route.fetch({ url: `${apiOrigin}${u.pathname}${u.search}` });
    const body = req.postDataBuffer();
    requests.push({ label, method: req.method(), path: u.pathname, status: response.status(), headers: req.headers(), body });
    await route.fulfill({ response });
  });
  const p = await c.newPage();
  screenshotPage = p;
  p.on('pageerror', e => errors.push({ label, message: String(e) }));
  p.on('request', r => { if (!r.url().includes('/api/')) requests.push({ label, method: r.method(), url: r.url(), resourceType: r.resourceType() }); });
  p.on('dialog', d => d.accept(d.type() === 'prompt' ? `QA extensions ${label}` : undefined));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  const f = await (await p.getByTestId('openblock-frame').elementHandle()).contentFrame();
  await f.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
  await f.getByTestId('save-project').waitFor({ state: 'visible' });
  await f.evaluate(() => {
    window.__toolbarViews = [];
    addEventListener('message', event => { if (event.source === parent && event.data?.type === 'PROJECT_TOOLBAR_STATE') __toolbarViews.push(event.data.payload); });
    const render = window.CFZNOpenBlock.renderLibrary;
    window.CFZNOpenBlock.renderLibrary = (...args) => { window.__vm = args[2].vm; return render(...args); };
  });
  await openLibrary(f); await closeLibrary(f); await capture(f);
  return { c, p, f };
}
async function capture(f) { await f.evaluate(() => { __vm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.__B = B; return B; } }); }); }
async function openLibrary(f) { if (!await f.locator('.cfzn-extension-controls').count()) await f.locator('[class*="extension-button"]').first().click(); }
async function closeLibrary(f) { if (await f.locator('.cfzn-extension-controls').count()) await f.getByText('返回', { exact: true }).click(); }
const card = (f, name) => f.getByRole('button', { name, exact: true });
async function idle(f) { await f.waitForFunction(() => !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'), null, { timeout: 25000 }); }
async function choose(f, name) { await openLibrary(f); await card(f, '主控扩展').click(); await card(f, name).click(); await idle(f); await capture(f); }
async function load(f, name, id) {
  await openLibrary(f); await card(f, '模块扩展').click(); await card(f, name).click();
  await f.waitForFunction(id => __vm.runtime.getLoadedDeviceExtension().includes(id) && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'), id, { timeout: 25000 });
}
const state = f => f.evaluate(() => JSON.parse(__vm.toJSON()));
async function archive(f) { return Buffer.from(await f.evaluate(async () => Array.from(new Uint8Array(await (await __vm.saveProjectSb3()).arrayBuffer())))); }
async function bridge(p, type, payload = {}) {
  return p.evaluate(({ type, payload }) => new Promise((ok, fail) => {
    const f = document.querySelector('iframe'), requestId = `independent-${Math.random()}`;
    const timer = setTimeout(() => { removeEventListener('message', listener); fail(new Error('bridge timeout')); }, 45000);
    function listener(e) {
      if (e.source !== f.contentWindow || e.data.requestId !== requestId) return;
      clearTimeout(timer); removeEventListener('message', listener);
      e.data.payload.ok ? ok(e.data.payload.result) : fail(new Error(e.data.payload.error.message));
    }
    addEventListener('message', listener);
    f.contentWindow.postMessage({ protocol: 'cfzn.openblock', version: 1, requestId, type, payload }, location.origin);
  }), { type, payload });
}
async function importUi(p, bytes, name) {
  const f = await (await p.getByTestId('openblock-frame').elementHandle()).contentFrame();
  await closeLibrary(f);
  await f.waitForFunction(() => !document.querySelector('[data-testid="save-project"]').disabled);
  const start = await f.evaluate(() => __toolbarViews.length);
  const chooser = p.waitForEvent('filechooser'); await f.getByTestId('import-project').click();
  await (await chooser).setFiles({ name: `${name}.ob`, mimeType: 'application/x.openblock.ob', buffer: bytes });
  await f.waitForFunction(start => __toolbarViews.slice(start).some(view => view.statusText === '正在导入…') && !document.querySelector('[data-testid="save-project"]').disabled, start);
  await p.getByTestId('project-notice').waitFor();
}
async function installXml(f, xml) {
  await f.evaluate(xml => __B.Xml.clearWorkspaceAndLoadFromXml(__B.Xml.textToDom(xml), __B.getMainWorkspace()), xml);
  await f.waitForFunction(() => Object.values(__vm.editingTarget.blocks._blocks).some(b => b.id === 'qa-hat'));
}
const moduleXml = `<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenarduinobegin" id="qa-hat" x="35" y="40"><next>
  <block type="activeBuzzer_init" id="qa-init"><field name="PIN">4</field><next>
  <block type="atomizer_init" id="qa-atom"><field name="PIN">5</field><next>
  <block type="pirSensor_init" id="qa-pir"><field name="PIN">6</field><next>
  <block type="moreComments_commandBlock" id="qa-comment"><value name="COMMENTS"><shadow type="text"><field name="TEXT">QA statement</field></shadow></value><next>
  <block type="moreComments_branchBlock" id="qa-outer"><value name="COMMENTS"><shadow type="text"><field name="TEXT">QA outer</field></shadow></value><statement name="SUBSTACK">
    <block type="control_if" id="qa-condition"><value name="CONDITION"><block type="pirSensor_detected" id="qa-detect"/></value><statement name="SUBSTACK">
      <block type="moreComments_branchBlock" id="qa-inner"><value name="COMMENTS"><shadow type="text"><field name="TEXT">QA nested</field></shadow></value><statement name="SUBSTACK">
        <block type="activeBuzzer_on" id="qa-on"><next><block type="atomizer_setState" id="qa-state"><field name="STATE">LOW</field></block></next></block>
      </statement><next><block type="activeBuzzer_off" id="qa-off"/></next></block>
    </statement><next><block type="control_if" id="qa-flame-if"><value name="CONDITION"><block type="flameSensor_readDigital" id="qa-flame-digital"><field name="PIN">2</field></block></value><statement name="SUBSTACK"><block type="arduino_serial_multiSerialPrint" id="qa-flame-print"><value name="VALUE"><block type="flameSensor_readAnalog" id="qa-flame-analog"><field name="PIN">4</field></block></value></block></statement>
    <next><block type="control_if" id="qa-rain-if"><value name="CONDITION"><block type="raindropSensor_readDigital" id="qa-rain-digital"><field name="PIN">7</field></block></value><statement name="SUBSTACK"><block type="arduino_serial_multiSerialPrint" id="qa-rain-print"><value name="VALUE"><block type="raindropSensor_readAnalog" id="qa-rain-analog"><field name="PIN">8</field></block></value></block></statement></block></next></block></next></block>
  </statement><next><block type="atomizer_toggle" id="qa-toggle"/></next></block></next></block></next></block></next></block></next></block></next></block></xml>`;
let primary, savedId, savedArchive, baseArchive;
async function ensureSampleArchive() {
  if (savedArchive) return savedArchive;
  const sample = await create('sample-source'); await choose(sample.f, 'Aijite ESP32-S3');
  for (let i = 0; i < ids.length; i++) await load(sample.f, names[i], ids[i]);
  await closeLibrary(sample.f); await installXml(sample.f, moduleXml);
  savedArchive = await archive(sample.f); return savedArchive;
}
try {
  primary = await create('main'); const { p, f } = primary;
  baseArchive = await archive(f);
  await test('native library, search, missing-controller and responsive keyboard/scroll', async () => {
    await openLibrary(f); await card(f, '模块扩展').click();
    assert.equal(await f.locator('.cfzn-extension-controls').evaluate(el => el.parentElement.className.includes('library_filter-bar')), true);
    assert.equal(await f.locator('[role="button"][aria-disabled="true"][aria-label]').count(), 6);
    assert.match(await f.locator('.cfzn-extension-status').innerText(), /先选择主控/);
    const before = await state(f);
    await f.getByPlaceholder('搜索').fill('水滴'); assert.equal(await card(f, '水滴传感器').count(), 1);
    await card(f, '主控扩展').click(); assert.equal(await f.getByPlaceholder('搜索').inputValue(), '水滴');
    await card(f, '模块扩展').click(); assert.equal(await card(f, '水滴传感器').count(), 1);
    await f.getByPlaceholder('搜索').fill('');
    const layouts = [];
    for (const width of [1440, 768, 390]) {
      await p.setViewportSize({ width, height: width === 1440 ? 900 : 1000 });
      await card(f, '积木注释').scrollIntoViewIfNeeded();
      layouts.push(await f.locator('.cfzn-extension-controls').evaluate(el => ({ width: innerWidth, library: el.closest('[class*="modal_modal-content"]')?.getBoundingClientRect().toJSON(), barWidth: el.parentElement.clientWidth, barScrollWidth: el.parentElement.scrollWidth, lastCard: document.querySelector('[aria-label="积木注释"]').getBoundingClientRect().toJSON() })));
      await p.screenshot({ path: join(out, `library-modules-${width}.png`) });
      await f.getByPlaceholder('搜索').focus(); await f.getByPlaceholder('搜索').pressSequentially('水滴');
      assert.equal(await f.getByPlaceholder('搜索').inputValue(), '水滴');
      await card(f, '主控扩展').focus(); await f.getByRole('button', { name: '主控扩展', exact: true }).press('Enter');
      assert.equal(await card(f, '主控扩展').getAttribute('aria-pressed'), 'true');
      await card(f, '模块扩展').click(); await f.getByPlaceholder('搜索').fill('');
    }
    assert.deepEqual(await state(f), before); await json('responsive-layouts.json', layouts);
    await p.setViewportSize({ width: 1440, height: 900 });
    return layouts;
  }, p);
  await test('three actual controllers; generic IO3 and Aijite digital/analog/touch exclusion', async () => {
    await choose(f, 'Arduino Uno'); assert.equal((await state(f)).device.deviceId, 'arduinoUno');
    await choose(f, 'ESP32-S3'); assert.equal((await state(f)).device.deviceId, 'arduinoEsp32S3');
    const generic = await f.evaluate(() => ['arduino_pin_setDigitalOutput', 'arduino_pin_readDigitalPin', 'arduino_pin_readAnalogPin', 'arduino_pin_esp32ReadTouchPin'].map(k => [k, __B.Device.getPinOptions(k)]));
    generic.forEach(([k, pins]) => assert.ok(pins.some(p => p[1] === '3'), k));
    await choose(f, 'Aijite ESP32-S3'); assert.equal((await state(f)).device.deviceId, 'aijiteESP32S3');
    const aijite = await f.evaluate(() => ['arduino_pin_setDigitalOutput', 'arduino_pin_readDigitalPin', 'arduino_pin_readAnalogPin', 'arduino_pin_esp32ReadTouchPin'].map(k => [k, __B.Device.getPinOptions(k)]));
    aijite.forEach(([k, pins]) => assert.ok(pins.length && pins.every(p => p[1] !== '3' && p[0] !== 'IO3'), k));
    assert.equal((await state(f)).programMode, 'upload'); assert.equal((await bridge(p, 'GET_STATE')).dirty, true);
    await json('controller-pins.json', { generic, aijite }); return { generic, aijite };
  }, p);
  await test('all six real module blocks, flyout, menus and idempotent selection', async () => {
    for (let i = 0; i < ids.length; i++) await load(f, names[i], ids[i]);
    await capture(f);
    const detail = await f.evaluate(opcodes => {
      const w = __B.getMainWorkspace(), fly = w.getFlyout().getFlyoutItems();
      return opcodes.map(type => { const b = fly.find(b => b.type === type); return { type, defined: !!__B.Blocks[type], generator: typeof __B.Arduino[type], flyout: !!b, pins: b?.getField('PIN')?.getOptions() }; });
    }, opcodes);
    for (const row of detail) { assert.ok(row.defined && row.flyout && row.generator === 'function', row.type); row.pins?.forEach(pin => assert.notEqual(pin[1], '3')); }
    const version = (await bridge(p, 'GET_STATE')).editVersion, n = requests.length;
    await card(f, names[0]).click(); await card(f, names[0]).press('Enter');
    assert.equal((await bridge(p, 'GET_STATE')).editVersion, version);
    assert.equal(requests.slice(n).filter(r => r.url?.includes('/cfzn-extensions/extensions/activateBuzzer/')).length, 0);
    assert.deepEqual([...(await state(f)).deviceExtensions].sort(), [...ids].sort());
    await json('module-registration.json', detail); return detail;
  }, p);
  await test('real mouse drag and edited parameter', async () => {
    if ((await state(f)).device.deviceId !== 'aijiteESP32S3') await choose(f, 'Aijite ESP32-S3');
    for (let i = 0; i < ids.length; i++) if (!(await state(f)).deviceExtensions.includes(ids[i])) await load(f, names[i], ids[i]);
    await closeLibrary(f);
    await f.locator('.scratchCategoryMenuItemLabel').getByText('有源蜂鸣器', { exact: true }).click();
    await f.waitForFunction(() => { const r = __B.getMainWorkspace().getFlyout().getFlyoutItems().find(b => b.type === 'activeBuzzer_init').getSvgRoot().getBoundingClientRect(); return r.y > 80 && r.y < 650; });
    await f.evaluate(() => new Promise(resolve => { let y, stable = 0; const deadline = performance.now() + 2500; function tick() { const next = __B.getMainWorkspace().getFlyout().getFlyoutItems().find(b => b.type === 'activeBuzzer_init').getSvgRoot().getBoundingClientRect().y; stable = Math.abs(next - y) < 0.1 ? stable + 1 : 0; y = next; stable >= 8 || performance.now() > deadline ? resolve() : requestAnimationFrame(tick); } tick(); }));
    const r = await f.evaluate(() => __B.getMainWorkspace().getFlyout().getFlyoutItems().find(b => b.type === 'activeBuzzer_init').getSvgRoot().getBoundingClientRect().toJSON());
    const box = await p.getByTestId('openblock-frame').boundingBox();
    await p.mouse.move(box.x + r.x + 30, box.y + r.y + 18); await p.mouse.down(); await p.mouse.move(box.x + 520, box.y + 320, { steps: 30 }); await p.mouse.up();
    await f.waitForFunction(() => __B.getMainWorkspace().getAllBlocks(false).some(b => b.type === 'activeBuzzer_init'));
    const field = await f.evaluate(() => { const b = __B.getMainWorkspace().getAllBlocks(false).find(b => b.type === 'activeBuzzer_init'); window.__dragId = b.id; return b.getField('PIN').getSvgRoot().getBoundingClientRect().toJSON(); });
    await p.mouse.click(box.x + field.x + field.width / 2, box.y + field.y + field.height / 2);
    await f.locator('.goog-menuitem-content').getByText('IO4', { exact: true }).click();
    await f.waitForFunction(() => __vm.editingTarget.blocks._blocks[__dragId]?.fields.PIN.value === '4');
    await p.screenshot({ path: join(out, 'mouse-drag-edited.png') }); return await f.evaluate(() => __vm.editingTarget.blocks._blocks[__dragId]);
  }, p);
  await test('all-module combinations and nested comments generate actual Arduino', async () => {
    if ((await state(f)).device.deviceId !== 'aijiteESP32S3') await choose(f, 'Aijite ESP32-S3');
    for (let i = 0; i < ids.length; i++) if (!(await state(f)).deviceExtensions.includes(ids[i])) await load(f, names[i], ids[i]);
    await closeLibrary(f); await installXml(f, moduleXml);
    const code = await f.evaluate(() => __B.Arduino.workspaceToCode(__B.getMainWorkspace()));
    for (const regex of [/activeBuzzerPin = 4/, /atomizerPin = 5/, /pirSensorPin = 6/, /pinMode\(activeBuzzerPin, OUTPUT\)/, /digitalWrite\(activeBuzzerPin, HIGH\)/, /digitalWrite\(activeBuzzerPin, LOW\)/, /digitalRead\(pirSensorPin\)/, /digitalRead\(2\) == LOW/, /analogRead\(4\)/, /digitalRead\(7\) == LOW/, /analogRead\(8\)/, /atomizerState = !atomizerState/, /\/\/ QA statement/, /\/\/ QA outer[\s\S]*\/\/ QA nested[\s\S]*digitalWrite\(activeBuzzerPin, HIGH\)[\s\S]*\/\/ End of QA nested[\s\S]*\/\/ End of QA outer/]) assert.match(code, regex);
    assert.doesNotMatch(code, /TODO|newblock_/); await writeFile(join(out, 'all-modules.ino'), code);
    await p.screenshot({ path: join(out, 'module-combinations.png') }); return code;
  }, p);
  await test('compatible controller switches preserve modules; native unsupported-controller guard', async () => {
    const s = await create('switch'); const f = s.f;
    await choose(f, 'Aijite ESP32-S3'); for (let i = 0; i < ids.length; i++) await load(f, names[i], ids[i]);
    await closeLibrary(f);
    // A digital PIN 4 is valid on all three boards; Uno analog pins use A0-style values.
    await installXml(f, '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenarduinobegin" id="qa-hat" x="35" y="40"><next><block type="activeBuzzer_init" id="qa-init"><field name="PIN">4</field></block></next></block></xml>');
    const old = await archive(f);
    for (const [name, id] of [['Arduino Uno', 'arduinoUno'], ['ESP32-S3', 'arduinoEsp32S3'], ['Aijite ESP32-S3', 'aijiteESP32S3']]) {
      await choose(f, name); assert.equal((await state(f)).device.deviceId, id);
      assert.deepEqual([...(await state(f)).deviceExtensions].sort(), [...ids].sort());
      assert.deepEqual((await state(f)).targets.map(t => t.blocks), JSON.parse(unzip(old)['project.json']).targets.map(t => t.blocks));
      assert.match(await f.evaluate(() => __B.Arduino.workspaceToCode(__B.getMainWorkspace())), /activeBuzzerPin = 4/);
    }
    // Original official picker refuses an incompatible device and keeps the complete project.
    await closeLibrary(f); await f.getByText('Aijite ESP32-S3', { exact: true }).click();
    await f.getByText('工作区不是空的，请先清理你的工作空间', { exact: true }).waitFor();
    await s.p.screenshot({ path: join(out, 'native-device-workspace-guard.png') });
    sameArchiveState(await archive(f), old);
    // Native OpenBlock blocks the library before selection when blocks exist. Test the
    // actual VM entry as well, using an existing official metadata record, without clearing blocks.
    const rejection = await f.evaluate(async () => {
      const device = CFZNDeviceMetadata.find(d => d.name === 'Micro:bit');
      if (!device) throw new Error('official Micro:bit metadata missing');
      try { await __vm.extensionManager.loadDeviceURL(device); return ''; } catch (e) { return String(e); }
    });
    assert.match(rejection, /不支持此主控/); sameArchiveState(await archive(f), old);
    return { compatible: 3, rejectedDevice: 'Micro:bit', nativeWorkspaceGuard: true, rejection };
  }, p);
  await test('top toolbar POST and PUT, fresh iframe reopen, identity-mapped asset bytes, export/import', async () => {
    if ((await state(f)).device.deviceId !== 'aijiteESP32S3') await choose(f, 'Aijite ESP32-S3');
    for (let i = 0; i < ids.length; i++) if (!(await state(f)).deviceExtensions.includes(ids[i])) await load(f, names[i], ids[i]);
    if (!await f.evaluate(() => __B.getMainWorkspace().getBlockById('qa-hat'))) await installXml(f, moduleXml);
    await closeLibrary(f);
    await f.evaluate(() => __B.getMainWorkspace().getBlockById('qa-rain-if').dispose(true));
    await f.waitForFunction(() => !__vm.editingTarget.blocks._blocks['qa-rain-if']);
    assert.ok((await state(f)).deviceExtensions.includes('raindropSensor'));
    await f.locator('input[class*="title-field"]').fill('QA extensions main');
    await f.locator('input[class*="title-field"]').press('Tab');
    const response = p.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/v1/projects'));
    await f.getByTestId('save-project').click(); const created = await response; assert.equal(created.status(), 201); savedId = (await created.json()).project.id;
    await f.getByTestId('project-status').getByText('已保存 · v1', { exact: true }).waitFor();
    const get = await fetch(`${apiOrigin}/api/v1/projects/${savedId}/content`); savedArchive = Buffer.from(await get.arrayBuffer());
    const posted = requests.filter(r => r.method === 'POST').at(-1).body;
    const begin = posted.indexOf(Buffer.from([80, 75, 3, 4])), end = posted.lastIndexOf(Buffer.from([80, 75, 5, 6]));
    assert.deepEqual(posted.subarray(begin, end + 22 + posted.readUInt16LE(end + 20)), savedArchive);
    const expected = semantic(savedArchive); assert.ok(Object.keys(expected.assets).some(k => k.includes('/sounds:'))); assert.ok(Object.keys(expected.assets).some(k => k.includes('/costumes:')));
    const fresh = await create('reopen');
    await fresh.f.getByTestId('project-list-button').click();
    await fresh.p.locator(`[data-project-id="${savedId}"]`).getByRole('button', { name: '打开', exact: true }).click();
    await fresh.p.getByTestId('project-notice').getByText(/已打开/).waitFor({ timeout: 45000 });
    sameArchiveState(await archive(fresh.f), savedArchive); assert.equal((await bridge(fresh.p, 'GET_STATE')).dirty, false);
    await fresh.p.screenshot({ path: join(out, 'fresh-ui-api-reopen.png') });
    await capture(fresh.f); await fresh.f.evaluate(() => __B.getMainWorkspace().getBlockById('qa-init').setFieldValue('9', 'PIN'));
    await fresh.f.waitForFunction(() => __vm.editingTarget.blocks._blocks['qa-init'].fields.PIN.value === '9');
    const putResponse = fresh.p.waitForResponse(r => r.request().method() === 'PUT'); await fresh.f.getByTestId('save-project').click(); assert.equal((await putResponse).status(), 200);
    await fresh.f.getByTestId('project-status').getByText('已保存 · v2', { exact: true }).waitFor();
    const get2 = await fetch(`${apiOrigin}/api/v1/projects/${savedId}/content`); const updated = Buffer.from(await get2.arrayBuffer());
    assert.deepEqual(requests.filter(r => r.method === 'PUT').at(-1).body, updated); sameArchiveState(await archive(fresh.f), updated);
    const download = fresh.p.waitForEvent('download'); await fresh.f.getByTestId('export-project').click(); const d = await download;
    const downloaded = join(out, 'ui-export.ob'); await d.saveAs(downloaded);
    const exportBytes = await readFile(downloaded); sameArchiveState(exportBytes, updated);
    await fresh.f.getByTestId('new-project').click(); await fresh.f.waitForFunction(() => !__vm.runtime.getDevice().deviceId);
    assert.deepEqual((await state(fresh.f)).deviceExtensions, []);
    await importUi(fresh.p, exportBytes, 'UI reimport'); sameArchiveState(await archive(fresh.f), updated);
    await writeFile(join(out, 'ui-api-created.ob'), savedArchive); await writeFile(join(out, 'ui-api-updated.ob'), updated);
    await json('asset-identity-map.json', expected.assets);
    return { id: savedId, revision: 2, bytes: updated.length, assets: expected.assets, loadedUnusedModule: 'raindropSensor', freshDirty: false };
  }, p);
  await test('unknown controller/module/stage IDs preserve project; legacy alias; ordinary/new clear selections', async () => {
    await ensureSampleArchive();
    const s = await create('imports'); await importUi(s.p, savedArchive, 'known'); const before = await archive(s.f);
    for (const [kind, modify, expected] of [
      ['controller', p => { p.device.deviceId = 'unknownController'; }, /unknownController/],
      ['module', p => { p.deviceExtensions.push('unknownModule'); }, /unknownModule/],
      ['stage', p => { p.extensions.push('unknownStage'); }, /unknownStage/],
    ]) {
      await importUi(s.p, await mutateArchive(savedArchive, modify), `unknown-${kind}`);
      assert.match(await s.p.getByTestId('project-notice').innerText(), expected); sameArchiveState(await archive(s.f), before);
    }
    await importUi(s.p, await mutateArchive(savedArchive, p => { p.device.deviceId = 'aijiteEsp32S3'; }), 'alias');
    assert.equal((await state(s.f)).device.deviceId, 'aijiteESP32S3'); sameArchiveState(await archive(s.f), savedArchive);
    await importUi(s.p, baseArchive, 'ordinary'); assert.equal((await state(s.f)).device.deviceId, null); assert.deepEqual((await state(s.f)).deviceExtensions, []);
    await importUi(s.p, savedArchive, 'known-again'); await s.f.getByTestId('new-project').click();
    await s.f.waitForFunction(() => !__vm.runtime.getDevice().deviceId); assert.deepEqual((await state(s.f)).deviceExtensions, []);
    return { unknownIds: 3, alias: 'aijiteESP32S3', cleared: ['ordinary', 'new'] };
  }, p);
  await test('actual module resource failure rollback, retry, busy-save and rapid duplicate selection', async () => {
    await ensureSampleArchive();
    const s = await create('faults'); await choose(s.f, 'Aijite ESP32-S3'); await load(s.f, names[0], ids[0]); await closeLibrary(s.f);
    await installXml(s.f, '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenarduinobegin" id="qa-hat" x="35" y="40"><next><block type="activeBuzzer_init" id="qa-init"><field name="PIN">4</field></block></next></block></xml>');
    const before = await archive(s.f);
    const pattern = '**/cfzn-extensions/extensions/atomizer/generator.mjs*';
    await s.c.route(pattern, route => route.abort('failed'));
    await openLibrary(s.f); await card(s.f, '模块扩展').click(); await card(s.f, names[1]).click(); await idle(s.f);
    assert.match(await s.f.locator('.cfzn-extension-error').innerText(), /雾化模块/); sameArchiveState(await archive(s.f), before);
    await s.p.screenshot({ path: join(out, 'actual-resource-failure-rollback.png') }); await s.c.unroute(pattern);
    let release, reached; const gate = new Promise(ok => { release = ok; }); const started = new Promise(ok => { reached = ok; });
    await s.c.route(pattern, async route => { reached(); await gate; await route.continue(); });
    await card(s.f, names[1]).click(); await started;
    const writes = requests.filter(r => r.label === 'faults' && ['POST', 'PUT'].includes(r.method)).length;
    // Native toolbar is hidden by the extension modal, so no save can be clicked.
    assert.equal(await s.f.getByTestId('save-project').isVisible(), false);
    await assert.rejects(bridge(s.p, 'EXPORT_PROJECT'), /正在加载模块|完成后再保存/);
    assert.equal(requests.filter(r => r.label === 'faults' && ['POST', 'PUT'].includes(r.method)).length, writes);
    assert.equal(await card(s.f, names[1]).getAttribute('aria-disabled'), 'true');
    await card(s.f, names[1]).dispatchEvent('click');
    release(); await s.f.waitForFunction(() => __vm.runtime.getLoadedDeviceExtension().includes('atomizer') && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'), null, { timeout: 25000 });
    assert.equal((await state(s.f)).deviceExtensions.filter(id => id === 'atomizer').length, 1);
    await s.c.unroute(pattern);
    const beforeImport = await archive(s.f);
    await closeLibrary(s.f);
    const importPattern = '**/cfzn-extensions/extensions/raindropSensor/generator.mjs*';
    await s.c.route(importPattern, route => route.abort('failed'));
    await importUi(s.p, savedArchive, 'faulted-module-import');
    await s.p.getByTestId('project-notice').getByText(/raindropSensor|水滴/).waitFor();
    sameArchiveState(await archive(s.f), beforeImport);
    await s.p.screenshot({ path: join(out, 'actual-import-resource-failure-rollback.png') });
    await s.c.unroute(importPattern);
    return { failedResource: 'atomizer/generator.mjs', failedImportResource: 'raindropSensor/generator.mjs', preserved: true, retry: true, noBusyWrite: true };
  }, p);
  await test('unsupported controller filter and realtime mode explanation/switch', async () => {
    const s = await create('mode');
    await s.f.getByText('未选择设备', { exact: true }).click();
    const labels = await s.f.locator('[role="button"][aria-label]').getAttribute('aria-label').catch(() => null);
    await card(s.f, 'Micro:bit').click(); await idle(s.f); await closeLibrary(s.f); await openLibrary(s.f); await card(s.f, '模块扩展').click();
    assert.equal(await card(s.f, names[0]).count(), 0); await s.f.getByRole('checkbox', { name: '支持当前主控' }).uncheck();
    assert.equal(await s.f.locator('[role="button"][aria-disabled="true"][aria-label]').count(), 6);
    assert.match(await s.f.locator('.cfzn-extension-status').innerText(), /不支持当前主控/);
    await choose(s.f, 'Arduino Uno'); await closeLibrary(s.f); await s.f.evaluate(() => __vm.runtime.setRealtimeMode(true));
    await openLibrary(s.f); await card(s.f, '模块扩展').click(); assert.match(await s.f.locator('.cfzn-extension-status').innerText(), /上传模式/);
    assert.equal(await card(s.f, names[0]).getAttribute('aria-disabled'), 'true');
    await card(s.f, '舞台扩展').click(); assert.equal((await state(s.f)).programMode, 'realtime');
    await card(s.f, '模块扩展').click(); await card(s.f, '切换 Arduino 上传模式').click(); await idle(s.f);
    assert.equal((await state(s.f)).programMode, 'upload'); await load(s.f, names[0], ids[0]);
    await s.f.evaluate(() => __vm.runtime.setRealtimeMode(true)); assert.equal((await state(s.f)).programMode, 'upload');
    assert.match(await s.f.locator('.cfzn-extension-error').innerText(), /已加载模块需要 Arduino 上传模式/);
    return { unsupported: 'Micro:bit', switch: true, modeRefusedWithLoadedModule: true, labels };
  }, p);
  await test('original stage pen/music load and execute in real VM', async () => {
    const s = await create('stage'); await openLibrary(s.f); await card(s.f, '舞台扩展').click();
    for (const [name, id] of [['画笔', 'pen'], ['音乐', 'music']]) {
      await s.f.getByText(name, { exact: true }).locator('xpath=ancestor::*[@role="button"]').click(); await s.f.waitForFunction(id => __vm.extensionManager.isExtensionLoaded(id) && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'), id);
    }
    await closeLibrary(s.f); await capture(s.f);
    await installXml(s.f, `<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenflagclicked" id="qa-hat" x="30" y="30"><next><block type="pen_clear" id="qa-pen-clear"><next><block type="pen_penDown" id="qa-pen-down"><next><block type="motion_movesteps" id="qa-move"><value name="STEPS"><shadow type="math_number"><field name="NUM">23</field></shadow></value><next><block type="pen_penUp" id="qa-pen-up"><next><block type="music_setTempo" id="qa-tempo"><value name="TEMPO"><shadow type="math_number"><field name="NUM">137</field></shadow></value><next><block type="music_playDrumForBeats" id="qa-drum"><value name="DRUM"><shadow type="music_menu_DRUM"><field name="DRUM">1</field></shadow></value><value name="BEATS"><shadow type="math_number"><field name="NUM">0.01</field></shadow></value></block></next></block></next></block></next></block></next></block></next></block></xml>`);
    await s.f.evaluate(() => { window.__trace = []; for (const id of ['pen_clear', 'pen_penDown', 'pen_penUp', 'music_setTempo', 'music_playDrumForBeats']) { const fn = __vm.runtime._primitives[id]; __vm.runtime._primitives[id] = (...args) => { __trace.push(id); return fn(...args); }; } __vm.editingTarget.setXY(0, 0); __vm.greenFlag(); });
    await s.f.waitForFunction(() => __trace.includes('music_playDrumForBeats') && __vm.editingTarget.x === 23);
    const actual = await s.f.evaluate(() => ({ trace: [...new Set(__trace)], x: __vm.editingTarget.x, project: JSON.parse(__vm.toJSON()).extensions, tempo: __vm.runtime.ext_music?.getTempo?.() }));
    assert.ok(actual.trace.length === 5); await s.p.screenshot({ path: join(out, 'stage-pen-music-executed.png') }); await json('stage-execution.json', actual); return actual;
  }, p);
  await test('no old source paths / 20112 module resource dependency', async () => {
    const resources = requests.filter(r => r.url?.includes('/cfzn-extensions/'));
    assert.ok(resources.some(r => r.url.includes('generator.mjs')));
    const bad = requests.filter(r => r.url && (/20112/.test(r.url) && !/wss?:/.test(r.url) || /file:|F:[/\\]|old[-_]ide/i.test(r.url)));
    assert.deepEqual(bad, []);
    return { localModuleRequests: resources.length, oldResourceRequests: bad, optionalLinkProbes: requests.filter(r => r.url?.includes('20112')) };
  }, p);
} catch (e) { results.push({ name: 'harness prerequisite', status: 'FAIL', error: String(e), stack: e.stack }); console.error(e); }
finally {
  await json('results.json', results);
  await json('network.json', requests.map(({ body, headers, ...r }) => ({ ...r, bodyBytes: body?.length, ifMatch: headers?.['if-match'] })));
  await json('page-errors.json', errors);
  await mkdir(join(out, 'runs'), { recursive: true });
  await json(`runs/${runId}.json`, { url, filter: process.env.CFZN_TEST_FILTER || null, results, errors,
    requests: requests.map(({ body, headers, ...r }) => ({ ...r, bodyBytes: body?.length, ifMatch: headers?.['if-match'] })) });
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close(); await app.close();
  // Only the mkdtemp directory created by this run is removed.
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + '\\') || resolve(temp).startsWith(resolve(tmpdir()) + '/'));
  await rm(temp, { recursive: true, force: true });
}
console.log(JSON.stringify(results.map(({ name, status, error }) => ({ name, status, error })), null, 2));
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
