import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const root = new URL('../evidence/extensions/', import.meta.url);
await mkdir(root, { recursive: true });
const url = process.env.CFZN_VERIFY_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const resources = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('request', request => { if (request.url().includes('20112')) resources.push(request.url()); });
function entries(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cursor = buffer.readUInt32LE(end + 16);
  const result = {};
  while (buffer.readUInt32LE(cursor) === 0x02014b50) {
    const size = buffer.readUInt32LE(cursor + 20), length = buffer.readUInt16LE(cursor + 28);
    const name = buffer.subarray(cursor + 46, cursor + 46 + length).toString();
    const offset = buffer.readUInt32LE(cursor + 42);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const compressed = buffer.subarray(start, start + size);
    const contents = buffer.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(compressed) : compressed;
    result[name] = contents;
    cursor += 46 + length + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  return result;
}
const hashes = files => Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'project.json')
  .map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
async function bridge(page, type, payload = {}) {
  return page.evaluate(({ type, payload }) => new Promise((resolve, reject) => {
    const frame = document.querySelector('iframe');
    const requestId = `verify-${Math.random()}`;
    if (payload.base64) {
      payload.bytes = Uint8Array.from(atob(payload.base64), char => char.charCodeAt(0)).buffer;
      delete payload.base64;
    }
    const timer = setTimeout(() => { removeEventListener('message', listener); reject(new Error('bridge timeout')); }, 45000);
    function listener(event) {
      if (event.source !== frame.contentWindow || event.data.requestId !== requestId) return;
      clearTimeout(timer); removeEventListener('message', listener);
      if (event.data.payload.ok) resolve(event.data.payload.result);
      else reject(new Error(event.data.payload.error.message));
    }
    addEventListener('message', listener);
    frame.contentWindow.postMessage({ protocol: 'cfzn.openblock', version: 1, type, requestId, payload }, location.origin);
  }), { type, payload });
}
async function capture(frame) {
  await frame.evaluate(() => {
    const render = window.CFZNOpenBlock.renderLibrary;
    window.CFZNOpenBlock.renderLibrary = (...args) => { window.__cfznTestVm = args[2].vm; return render(...args); };
  });
  await frame.locator('[class*="extension-button"]').first().click();
}
async function archive(frame) {
  return Buffer.from(await frame.evaluate(async () => Array.from(new Uint8Array(await (await window.__cfznTestVm.saveProjectSb3()).arrayBuffer()))));
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const frame = await (async () => {
    await page.locator('iframe').waitFor();
    const element = await page.locator('iframe').elementHandle();
    const target = await element.contentFrame();
    await target.waitForURL(/openblock\.html/, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return target;
  })();
  await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
  console.log('editor ready');
  // Capture only the explicit, versioned GUI container hook. No Fiber/DOM state inspection.
  await frame.evaluate(() => {
    const render = window.CFZNOpenBlock.renderLibrary;
    window.CFZNOpenBlock.renderLibrary = (...args) => {
      window.__cfznTestVm = args[2].vm;
      return render(...args);
    };
  });
  await frame.locator('[class*="extension-button"]').first().click();
  await frame.getByRole('button', { name: '主控扩展', exact: true }).click();
  await frame.getByText('Aijite ESP32-S3', { exact: true }).locator('xpath=../..').locator('img').first().click();
  console.log('selected Aijite');
  await frame.waitForFunction(() => document.querySelector('.cfzn-extension-error')?.textContent ||
    document.querySelector('.cfzn-extension-status')?.textContent?.includes('当前主控'));
  assert.equal(await frame.locator('.cfzn-extension-error').count(), 0, await frame.locator('.cfzn-extension-error').allTextContents());
  await page.screenshot({ path: new URL('controllers-1440.png', root).pathname.replace(/^\/(.:)/, '$1') });
  await frame.getByRole('button', { name: '模块扩展', exact: true }).click();
  for (const [id, name] of [['activateBuzzer', '有源蜂鸣器'], ['atomizer', '雾化模块'], ['pirSensor', '人体红外'],
    ['flameSensor', '火焰传感器'], ['raindropSensor', '水滴传感器'], ['moreComments', '积木注释']]) {
    await frame.getByText(name, { exact: true }).locator('xpath=../..').locator('img').first().click();
    await frame.waitForFunction(id => window.__cfznTestVm.runtime.getLoadedDeviceExtension().includes(id) &&
      !document.querySelector('.cfzn-extension-status')?.textContent?.startsWith('正在'), id, { timeout: 20000 });
    console.log(`loaded ${id}`);
  }
  const detail = await frame.evaluate(() => {
    const vm = window.__cfznTestVm;
    let Blockly;
    vm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: value => { Blockly = value; return value; } });
    window.__cfznTestBlocks = Blockly;
    return { project: JSON.parse(vm.toJSON()),
      flyout: Blockly.getMainWorkspace().getFlyout().getFlyoutItems().map(block => ({ type: block.type,
        inputs: block.inputList.map(input => input.name), fields: block.inputList.flatMap(input => input.fieldRow.map(field => field.name)) })),
      pins: ['arduino_pin_setDigitalOutput', 'arduino_pin_readDigitalPin', 'arduino_pin_readAnalogPin'].map(opcode => Blockly.Device.getPinOptions(opcode)),
    };
  });
  assert.equal(detail.project.device.deviceId, 'aijiteESP32S3');
  assert.equal(detail.project.programMode, 'upload');
  assert.equal(detail.project.deviceExtensions.length, 6);
  assert.ok(detail.pins.every(options => options.every(([text, value]) => value !== '3' && text !== 'IO3')));
  await writeFile(new URL('native-state.json', root), JSON.stringify(detail, null, 2));
  const emptyArchive = await archive(frame);
  await writeFile(new URL('modules-without-blocks.ob', root), emptyArchive);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 1000 });
    const layout = await frame.evaluate(() => {
      const bar = document.querySelector('.cfzn-extension-controls').parentElement;
      let element = bar;
      const ancestors = [];
      for (let i = 0; i < 5 && element; i++, element = element.parentElement) {
        ancestors.push({ tag: element.tagName, className: element.className, rect: element.getBoundingClientRect().toJSON(),
          minWidth: getComputedStyle(element).minWidth, width: getComputedStyle(element).width });
      }
      return { innerWidth, ancestors };
    });
    assert.ok(layout.ancestors[1].rect.width <= width + 1, `library should fit ${width}px`);
    await writeFile(new URL(`layout-${width}.json`, root), JSON.stringify(layout, null, 2));
    await page.screenshot({ path: new URL(`modules-${width}.png`, root).pathname.replace(/^\/(.:)/, '$1') });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await frame.getByText('返回', { exact: true }).click();
  const xml = `<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenarduinobegin" id="test-hat" x="40" y="40"><next>
    <block type="activeBuzzer_init" id="test-buzzer-init"><field name="PIN">4</field><next>
    <block type="atomizer_init" id="test-atomizer-init"><field name="PIN">5</field><next>
    <block type="pirSensor_init" id="test-pir-init"><field name="PIN">6</field><next>
    <block type="moreComments_commandBlock" id="test-comment"><value name="COMMENTS"><shadow type="text"><field name="TEXT">edited modules</field></shadow></value><next>
    <block type="moreComments_branchBlock" id="test-branch"><value name="COMMENTS"><shadow type="text"><field name="TEXT">sensor branch</field></shadow></value>
    <statement name="SUBSTACK"><block type="activeBuzzer_on" id="test-buzzer-on"><next>
    <block type="atomizer_setState" id="test-state"><field name="STATE">LOW</field><next>
    <block type="control_if" id="test-pir-if"><value name="CONDITION"><block type="pirSensor_detected" id="test-pir-detected"/></value>
    <statement name="SUBSTACK"><block type="activeBuzzer_off" id="test-buzzer-off"/></statement><next>
    <block type="control_if" id="test-flame-if"><value name="CONDITION"><block type="flameSensor_readDigital" id="test-flame-digital"><field name="PIN">2</field></block></value>
    <statement name="SUBSTACK"><block type="arduino_serial_multiSerialPrint" id="test-flame-print"><value name="VALUE"><block type="flameSensor_readAnalog" id="test-flame-analog"><field name="PIN">4</field></block></value></block></statement><next>
    <block type="control_if" id="test-rain-if"><value name="CONDITION"><block type="raindropSensor_readDigital" id="test-rain-digital"><field name="PIN">2</field></block></value>
    <statement name="SUBSTACK"><block type="arduino_serial_multiSerialPrint" id="test-rain-print"><value name="VALUE"><block type="raindropSensor_readAnalog" id="test-rain-analog"><field name="PIN">4</field></block></value></block></statement>
    </block></next></block></next></block></next></block></next></block></statement>
    <next><block type="atomizer_toggle" id="test-toggle"/></next>
    </block></next></block></next></block></next></block></next></block></next></block></xml>`;
  const code = await frame.evaluate(xml => {
    const Blockly = window.__cfznTestBlocks;
    const workspace = Blockly.getMainWorkspace();
    Blockly.Xml.clearWorkspaceAndLoadFromXml(Blockly.Xml.textToDom(xml), workspace);
    return Blockly.Arduino.workspaceToCode(workspace);
  }, xml);
  for (const pattern of [/activeBuzzerPin = 4/, /atomizerPin = 5/, /pirSensorPin = 6/, /pinMode\(activeBuzzerPin, OUTPUT\)/,
    /digitalWrite\(activeBuzzerPin, HIGH\)/, /digitalWrite\(activeBuzzerPin, LOW\)/, /digitalRead\(pirSensorPin\)/,
    /digitalRead\(2\)/, /analogRead\(4\)/, /atomizerState = !atomizerState/, /\/\/ edited modules/, /\/\/ sensor branch/, /\/\/ End of sensor branch/]) assert.match(code, pattern);
  assert.doesNotMatch(code, /TODO|newblock_/);
  await writeFile(new URL('all-six-modules.ino', root), code);
  await frame.waitForFunction(() => JSON.stringify(JSON.parse(window.__cfznTestVm.toJSON()).targets).includes('test-rain-if'));
  // Leave one loaded module without placed blocks in the final saved project.
  await frame.evaluate(() => window.__cfznTestBlocks.getMainWorkspace().getBlockById('test-rain-if').dispose(true));
  await frame.waitForFunction(() => !JSON.stringify(JSON.parse(window.__cfznTestVm.toJSON()).targets).includes('test-rain-if'));
  const finalArchive = await archive(frame);
  const finalProject = JSON.parse(entries(finalArchive)['project.json']);
  assert.equal(finalProject.deviceExtensions.length, 6);
  await writeFile(new URL('aijite-six-modules.ob', root), finalArchive);
  await page.screenshot({ path: new URL('connected-blocks-1440.png', root).pathname.replace(/^\/(.:)/, '$1') });

  // First save and subsequent update use the unchanged real API, including quoted revisions.
  const api = 'http://127.0.0.1:3001/api/v1';
  const form = new FormData(); form.append('name', `Extension verification ${Date.now()}`);
  form.append('file', new Blob([finalArchive]), 'extensions.ob');
  const created = await fetch(`${api}/projects`, { method: 'POST', body: form });
  assert.equal(created.status, 201);
  let project = (await created.json()).project;
  const recordId = project.id;
  try {
    const get = await fetch(`${api}/projects/${recordId}/content`, { headers: { 'If-Match': `"${project.revision}"` } });
    const downloaded = Buffer.from(await get.arrayBuffer()); assert.deepEqual(downloaded, finalArchive);
    const put = await fetch(`${api}/projects/${recordId}/content`, { method: 'PUT',
      headers: { 'Content-Type': 'application/x.openblock.ob', 'If-Match': `"${project.revision}"` }, body: finalArchive });
    assert.equal(put.status, 200); project = (await put.json()).project;
    const get2 = await fetch(`${api}/projects/${recordId}/content`, { headers: { 'If-Match': `"${project.revision}"` } });
    const reopened = Buffer.from(await get2.arrayBuffer()); assert.deepEqual(reopened, finalArchive);
    const fresh = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    fresh.on('pageerror', error => errors.push(`fresh: ${String(error)}`));
    fresh.on('request', request => { if (request.url().includes('20112')) resources.push(request.url()); });
    await fresh.goto(url, { waitUntil: 'domcontentloaded' });
    await fresh.locator('iframe').waitFor();
    const freshFrame = await (await fresh.locator('iframe').elementHandle()).contentFrame();
    await freshFrame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
    await capture(freshFrame);
    await freshFrame.getByText('返回', { exact: true }).click();
    await bridge(fresh, 'LOAD_PROJECT', { base64: reopened.toString('base64'), title: 'Restored Aijite modules' });
    const restored = await archive(freshFrame);
    const restoredProject = JSON.parse(entries(restored)['project.json']);
    assert.equal(restoredProject.device.deviceId, 'aijiteESP32S3');
    assert.deepEqual(restoredProject.deviceExtensions, finalProject.deviceExtensions);
    assert.deepEqual(restoredProject.targets.map(target => target.blocks), finalProject.targets.map(target => target.blocks));
    // Native SVG loading may normalize asset IDs/filenames. Compare the actual bytes of every asset.
    assert.deepEqual(Object.values(hashes(entries(restored))).sort(), Object.values(hashes(entries(finalArchive))).sort());
    assert.equal((await bridge(fresh, 'GET_STATE')).dirty, false);
    await writeFile(new URL('restored-aijite.ob', root), restored);
    await fresh.screenshot({ path: new URL('restored-blocks-1440.png', root).pathname.replace(/^\/(.:)/, '$1') });
    // A second restoration exercises modules with zero blocks, then a normal new project clears all native selections.
    await bridge(fresh, 'LOAD_PROJECT', { base64: emptyArchive.toString('base64'), title: 'Modules without blocks' });
    assert.equal((await freshFrame.evaluate(() => JSON.parse(window.__cfznTestVm.toJSON()).deviceExtensions.length)), 6);
    await bridge(fresh, 'NEW_PROJECT');
    const cleared = await freshFrame.evaluate(() => JSON.parse(window.__cfznTestVm.toJSON()));
    assert.equal(cleared.device.deviceId, null); assert.deepEqual(cleared.deviceExtensions, []);
    await fresh.close();
    await writeFile(new URL('roundtrip.json', root), JSON.stringify({ revision: project.revision, bytes: reopened.length,
      device: restoredProject.device, modules: restoredProject.deviceExtensions, assets: hashes(entries(restored)),
      restoredDirty: false, blocksAndParametersPreserved: true, unusedModuleRestored: true, emptyModulesRestored: true }, null, 2));
  } finally {
    const removed = await fetch(`${api}/projects/${recordId}`, { method: 'DELETE', headers: { 'If-Match': `"${project.revision}"` } });
    assert.equal(removed.status, 204);
  }
  console.log(JSON.stringify({ errors, localResourceRequests: resources, modules: detail.project.deviceExtensions }));
} catch (failure) {
  console.log('FAILURE', String(failure), 'errors', errors);
  console.log((await page.locator('iframe').elementHandle().then(handle => handle.contentFrame()).then(frame => frame.locator('body').innerText())).slice(-3500));
  await page.screenshot({ path: new URL('failure.png', root).pathname.replace(/^\/(.:)/, '$1') });
  throw failure;
} finally { await browser.close(); }
