import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const out = resolve(process.env.CFZN_TEST_EVIDENCE || 'tests/evidence/extensions-switch-repro');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const results = [];
try {
  for (const scenario of ['pin3', 'serial']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(process.env.CFZN_TEST_URL || 'http://127.0.0.1:5174');
    const f = await (await page.locator('iframe').elementHandle()).contentFrame();
    await f.locator('#boot-message').waitFor({ state: 'hidden', timeout: 60000 });
    await f.evaluate(() => { const render = CFZNOpenBlock.renderLibrary; CFZNOpenBlock.renderLibrary = (...args) => { window.vm = args[2].vm; return render(...args); }; });
    await f.locator('[class*="extension-button"]').first().click();
    await f.getByRole('button', { name: '主控扩展', exact: true }).click();
    await f.getByRole('button', { name: 'ESP32-S3', exact: true }).click();
    await f.waitForFunction(() => document.querySelector('.cfzn-extension-status')?.textContent.startsWith('当前主控'));
    await f.getByRole('button', { name: '模块扩展', exact: true }).click();
    await f.getByRole('button', { name: '有源蜂鸣器', exact: true }).click();
    await f.waitForFunction(() => vm.runtime.getLoadedDeviceExtension().includes('activateBuzzer') && !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'));
    await f.getByText('返回', { exact: true }).click();
    await f.evaluate(() => { vm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: B => { window.B = B; return B; } }); });
    const xml = scenario === 'pin3'
      ? '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenarduinobegin" id="hat" x="40" y="40"><next><block type="activeBuzzer_init" id="init"><field name="PIN">3</field></block></next></block></xml>'
      : '<xml xmlns="http://www.w3.org/1999/xhtml"><block type="event_whenarduinobegin" id="hat" x="40" y="40"><next><block type="arduino_serial_multiSerialPrint" id="serial"><value name="VALUE"><block type="math_number" id="number"><field name="NUM">42</field></block></value></block></next></block></xml>';
    await f.evaluate(xml => B.Xml.clearWorkspaceAndLoadFromXml(B.Xml.textToDom(xml), B.getMainWorkspace()), xml);
    await f.waitForFunction(() => vm.editingTarget.blocks._blocks.hat);
    const before = await f.evaluate(() => JSON.parse(vm.toJSON()));
    const beforeStatus = await f.getByTestId('project-status').innerText();
    await f.locator('[class*="extension-button"]').first().click();
    await f.getByRole('button', { name: '主控扩展', exact: true }).click();
    await f.getByRole('button', { name: scenario === 'pin3' ? 'Aijite ESP32-S3' : 'Arduino Uno', exact: true }).click();
    await f.waitForFunction(() => !document.querySelector('.cfzn-extension-status')?.textContent.startsWith('正在'));
    const error = await f.locator('.cfzn-extension-error').allTextContents();
    const afterStatus = await f.getByTestId('project-status').innerText();
    await f.getByText('返回', { exact: true }).click();
    // Wait for actual Blockly -> VM workspace synchronization before reading preservation.
    await f.evaluate(() => new Promise(ok => setTimeout(ok, 500)));
    const after = await f.evaluate(() => ({ project: JSON.parse(vm.toJSON()), workspace: B.getMainWorkspace().getAllBlocks(false).map(b => ({ id: b.id, type: b.type })), code: B.Arduino.workspaceToCode(B.getMainWorkspace()) }));
    await page.screenshot({ path: join(out, `${scenario}-after-switch.png`) });
    let reopened;
    {
      const bytes = Buffer.from(await f.evaluate(async () => Array.from(new Uint8Array(await (await vm.saveProjectSb3()).arrayBuffer()))));
      await writeFile(join(out, `${scenario}-after-switch.ob`), bytes);
      const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p2 = await fresh.newPage(); await p2.goto(process.env.CFZN_TEST_URL || 'http://127.0.0.1:5174');
      const f2 = await (await p2.locator('iframe').elementHandle()).contentFrame(); await f2.locator('#boot-message').waitFor({ state: 'hidden' });
      await f2.evaluate(() => { const render = CFZNOpenBlock.renderLibrary; CFZNOpenBlock.renderLibrary = (...args) => { window.vm = args[2].vm; return render(...args); }; });
      await f2.locator('[class*="extension-button"]').first().click(); await f2.getByText('返回', { exact: true }).click();
      const chooser = p2.waitForEvent('filechooser'); await f2.getByTestId('import-project').click();
      await (await chooser).setFiles({ name: `${scenario}-after-attempt.ob`, mimeType: 'application/x.openblock.ob', buffer: bytes });
      await p2.getByTestId('project-notice').waitFor();
      await f2.evaluate(() => new Promise(ok => setTimeout(ok, 500)));
      await f2.evaluate(() => vm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: b => { window.B = b; return b; } }));
      reopened = await f2.evaluate(() => ({ project: JSON.parse(vm.toJSON()), workspace: B.getMainWorkspace().getAllBlocks(false).map(b => ({ id: b.id, type: b.type })), code: B.Arduino.workspaceToCode(B.getMainWorkspace()), body: document.body.innerText }));
      if (reopened.project.device.deviceId === 'arduinoEsp32S3' && /activeBuzzerPin = 3|Serial.println\(42\)/.test(reopened.code)) {
        reopened.editedCode = await f2.evaluate(scenario => {
          if (scenario === 'pin3') B.getMainWorkspace().getBlockById('init').setFieldValue('4', 'PIN');
          else B.getMainWorkspace().getBlockById('serial').getInput('VALUE').connection.targetBlock().setFieldValue('43', 'NUM');
          return B.Arduino.workspaceToCode(B.getMainWorkspace());
        }, scenario);
      }
      await p2.screenshot({ path: join(out, `${scenario}-fresh-reopen.png`) }); await fresh.close();
    }
    const failures = [];
    try {
      assert.ok(error.length === 1 && error[0], 'must show a specific rejection');
      assert.equal(afterStatus, beforeStatus, 'rejection must preserve dirty state');
      assert.match(error[0], scenario === 'pin3' ? /引脚.*3|3.*引脚/ : /arduino_serial_multiSerialPrint/);
      assert.equal(after.project.device.deviceId, 'arduinoEsp32S3', 'rejection must preserve selected controller');
      assert.deepEqual(after.project.deviceExtensions, before.deviceExtensions);
      assert.deepEqual(after.project.targets.map(t => t.blocks), before.targets.map(t => t.blocks));
      assert.equal(reopened.project.device.deviceId, 'arduinoEsp32S3');
      assert.deepEqual(reopened.project.deviceExtensions, before.deviceExtensions);
      assert.deepEqual(reopened.project.targets.map(t => t.blocks), before.targets.map(t => t.blocks));
      assert.match(reopened.code, scenario === 'pin3' ? /activeBuzzerPin = 3/ : /Serial.println\(42\)/);
      assert.match(reopened.editedCode, scenario === 'pin3' ? /activeBuzzerPin = 4/ : /Serial.println\(43\)/);
    } catch (failure) { failures.push(String(failure)); }
    results.push({ scenario, status: failures.length ? 'FAIL' : 'PASS', failures, error, beforeStatus, afterStatus, before, after, reopened });
    await context.close();
  }
} finally { await browser.close(); await writeFile(join(out, 'repro.json'), JSON.stringify(results, null, 2)); }
console.log(JSON.stringify(results.map(r => ({ scenario: r.scenario, beforeDevice: r.before.device, afterDevice: r.after.project.device, beforeBlocks: r.before.targets.map(t => Object.keys(t.blocks)), afterBlocks: r.after.project.targets.map(t => Object.keys(t.blocks)), reopenedBlocks: r.reopened?.project.targets.map(t => Object.keys(t.blocks)), reopenedWorkspace: r.reopened?.workspace, reopenedCode: r.reopened?.code, workspace: r.after.workspace, code: r.after.code })), null, 2));
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
