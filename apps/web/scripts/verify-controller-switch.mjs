import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../evidence/controller-switch-fix/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
async function state(page, type = 'GET_STATE', payload = {}) {
  return page.evaluate(({ type, payload }) => new Promise((resolve, reject) => {
    const iframe = document.querySelector('iframe');
    const requestId = `switch-check-${Math.random()}`;
    const listener = event => {
      if (event.source !== iframe.contentWindow || event.data.requestId !== requestId) return;
      removeEventListener('message', listener);
      if (event.data.payload.ok) resolve(event.data.payload.result);
      else reject(new Error(event.data.payload.error.message));
    };
    addEventListener('message', listener);
    iframe.contentWindow.postMessage({ protocol: 'cfzn.openblock', version: 1, type, requestId, payload }, location.origin);
  }), { type, payload });
}
try {
  for (const scenario of ['pin3', 'serial', 'common-digital']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(process.env.CFZN_VERIFY_URL || 'http://127.0.0.1:5174', { waitUntil: 'domcontentloaded' });
    await page.locator('iframe').waitFor();
    const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    await frame.waitForURL(/openblock\.html/, { waitUntil: 'domcontentloaded' });
    await frame.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
    await frame.evaluate(() => {
      const render = window.CFZNOpenBlock.renderLibrary;
      window.CFZNOpenBlock.renderLibrary = (...args) => { window.testVm = args[2].vm; return render(...args); };
    });
    await frame.locator('[class*="extension-button"]').first().click();
    await frame.getByRole('button', { name: '主控扩展', exact: true }).click();
    await frame.getByRole('button', { name: 'ESP32-S3', exact: true }).click();
    await frame.waitForFunction(() => document.querySelector('.cfzn-extension-status')?.textContent.startsWith('当前主控'));
    await frame.getByRole('button', { name: '模块扩展', exact: true }).click();
    await frame.getByRole('button', { name: '有源蜂鸣器', exact: true }).click();
    await frame.waitForFunction(() => testVm.runtime.getLoadedDeviceExtension().includes('activateBuzzer') &&
      !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'));
    await frame.getByText('返回', { exact: true }).click();
    const statement = scenario === 'serial'
      ? '<block type="arduino_serial_multiSerialPrint" id="serial"><value name="VALUE"><shadow type="math_number" id="number"><field name="NUM">42</field></shadow></value></block>'
      : `<block type="activeBuzzer_init" id="init"><field name="PIN">${scenario === 'pin3' ? '3' : '4'}</field>${scenario === 'common-digital' ? '<next><block type="arduino_pin_setDigitalOutput" id="digital"><field name="PIN">4</field><value name="LEVEL"><shadow type="arduino_pin_menu_level" id="level"><field name="level">HIGH</field></shadow></value></block></next>' : ''}</block>`;
    await frame.evaluate(xml => {
      testVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.testBlocks = B; return B; } });
      testBlocks.Xml.clearWorkspaceAndLoadFromXml(testBlocks.Xml.textToDom(xml), testBlocks.getMainWorkspace());
    }, `<xml><block type="event_whenarduinobegin" id="hat" x="40" y="40"><next>${statement}</next></block></xml>`);
    await frame.waitForFunction(() => testVm.editingTarget.blocks._blocks.hat?.next);
    await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
    if (scenario === 'pin3') {
      const edited = await state(page);
      await state(page, 'MARK_SAVED', { documentId: edited.documentId, editVersion: edited.editVersion });
    }
    const before = await frame.evaluate(() => JSON.parse(testVm.toJSON()));
    const beforeState = await state(page);
    const targets = scenario === 'pin3' ? [['Aijite ESP32-S3', 'aijiteESP32S3']] :
      scenario === 'serial' ? [['Arduino Uno', 'arduinoUno']] :
        [['Arduino Uno', 'arduinoUno'], ['Aijite ESP32-S3', 'aijiteESP32S3']];
    const switches = [];
    for (const [name, id] of targets) {
      await frame.locator('[class*="extension-button"]').first().click();
      await frame.getByRole('button', { name: '主控扩展', exact: true }).click();
      await frame.getByRole('button', { name, exact: true }).click();
      await frame.waitForFunction(id => document.querySelector('.cfzn-extension-error')?.textContent ||
        (testVm.runtime.getDevice().deviceId === id && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在')), id);
      const message = (await frame.locator('.cfzn-extension-error').allTextContents()).join('\n');
      if (scenario !== 'common-digital') {
        assert.match(message, scenario === 'pin3' ? /activeBuzzer_init.*引脚 3/ : /arduino_serial_multiSerialPrint/);
      } else assert.equal(message, '');
      await page.screenshot({ path: fileURLToPath(new URL(`${scenario}-${id}.png`, output)) });
      await frame.getByText('返回', { exact: true }).click();
      await frame.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
      const after = await frame.evaluate(() => ({ project: JSON.parse(testVm.toJSON()), code: testBlocks.Arduino.workspaceToCode(testBlocks.getMainWorkspace()),
        pins: testBlocks.Device.getPinOptions('arduino_pin_setDigitalOutput').map(option => option[1]),
        modulePins: testBlocks.getMainWorkspace().getBlockById('init')?.getField('PIN')?.getOptions().map(option => option[1]) }));
      const afterState = await state(page);
      if (scenario !== 'common-digital') {
        assert.deepEqual(after.project, before);
        assert.deepEqual(afterState, beforeState);
      } else {
        assert.equal(after.project.device.deviceId, id);
        assert.deepEqual(after.project.targets.map(target => target.blocks), before.targets.map(target => target.blocks));
        assert.deepEqual(after.project.deviceExtensions, before.deviceExtensions);
        assert.ok(afterState.dirty && afterState.editVersion > beforeState.editVersion);
        assert.match(after.code, /activeBuzzerPin = 4/);
        assert.match(after.code, /digitalWrite\(4, HIGH\)/);
        if (id === 'aijiteESP32S3') { assert.ok(!after.pins.includes('3')); assert.ok(!after.modulePins.includes('3')); }
      }
      switches.push({ name, message, afterState, ...after });
    }
    assert.deepEqual(errors, []);
    results.push({ scenario, beforeState, before, switches, errors });
    console.log(`${scenario}: passed`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(new URL('results.json', output), JSON.stringify(results, null, 2));
}
