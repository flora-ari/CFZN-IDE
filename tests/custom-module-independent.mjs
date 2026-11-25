import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'apps/web/dist');
const out = join(root, '.runtime/custom-module-independent');
const require = createRequire(import.meta.url);
const { createApp } = require('../apps/api/dist/app.js');
const { unzipSync, zipSync } = require('../apps/web/node_modules/fflate');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const modulePath = '/api/v1/custom-modules';
const projectPath = '/api/v1/projects';
const name = 'Private Uno QA';
const key = 'write_7';
const baseCode = 'qaWrite({{TXT}}, {{LEVEL}}, {{BOOL}}, {{MODE}}, {{DOUT}}, {{AIN}}, {{DIN}});';
const generatedCommand = 'qaWrite("hello", 7, true, HIGH, ';
const moduleIds = ['activateBuzzer', 'atomizer', 'pirSensor', 'flameSensor', 'raindropSensor', 'moreComments'];
const report = { steps: [], failures: [], pageErrors: [] };
const libraryIndex = { libraries: ['1.2.1', '1.2.2'].map(version => ({
  name: 'Servo', version, author: 'Arduino', sentence: 'Controls servo motors.',
  architectures: ['avr'], url: 'https://downloads.arduino.cc/libraries/github.com/arduino-libraries/Servo-' + version + '.zip',
  checksum: 'SHA-256:' + 'a'.repeat(64), size: 12345,
})) };
const searchPath = '/api/v1/arduino/libraries/search';
const tempRoot = await realpath(tmpdir());
const temp = await mkdtemp(join(tempRoot, 'cfzn-private-qa-'));
let api, apiOrigin, browser, activePage;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    const upstream = request(new URL(req.url, apiOrigin), { method: req.method, headers: req.headers }, reply => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    upstream.on('error', () => res.writeHead(502).end());
    req.pipe(upstream);
    return;
  }
  const file = resolve(dist, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
  if (!file.startsWith(dist + sep)) return res.writeHead(403).end();
  const stream = createReadStream(file);
  stream.on('open', () => {
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    stream.pipe(res);
  });
  stream.on('error', () => res.writeHead(404).end());
});
const pass = (name, detail = null) => {
  report.steps.push({ name, detail });
  console.log('PASS', name);
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const b = (s, name) => s.frame.getByRole('button', { name, exact: true });
const card = (s, kind, id) => s.frame.locator('[data-cfzn-library-card="' + kind + '-' + id + '"]');
const back = async s => s.frame.getByText('返回', { exact: true }).click();
const library = async s => s.frame.locator('[class*="extension-button"]').first().click();
const modules = async s => b(s, '模块扩展').click();
const factory = async s => b(s, '自定义模块扩展').click();
const has = (page, path, method) => page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
const rows = s => s.frame.locator('[data-cfzn-factory-block]');
const preview = s => rows(s).locator('[data-cfzn-custom-block-preview] > svg');
const code = (s, label) => s.frame.locator('[data-factory-code="' + label + '"]');
const content = editor => editor.locator('.view-lines');
const settingsPanel = '.cfzn-factory-settings';
const blocksPanel = '.cfzn-factory-blocks';
const dialog = (s, title) => s.frame.getByRole('dialog', { name: title, exact: true });
const modify = s => dialog(s, 'Modify Block');
const addShape = (s, type) => s.frame.locator('[data-factory-add-shape="' + type + '"]');
const dialogButton = (modal, name) => modal.getByRole('button', { name, exact: true });
const defaultRow = (s, name) => modify(s).locator('.cfzn-declare-default-row').filter({ hasText: new RegExp('^' + name + '（') });
const widget = s => s.frame.locator('.blocklyWidgetDiv .blocklyHtmlInput:visible');

async function masked(s, modal, maxWidth) {
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  const bounds = await modal.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const mask = el.parentElement;
    const m = mask.getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width,
      viewport: [innerWidth, innerHeight], mask: [m.x, m.y, m.width, m.height],
      maskPosition: getComputedStyle(mask).position, background: getComputedStyle(mask).backgroundColor,
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      rootOverflowX: getComputedStyle(document.documentElement).overflowX,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      maskOverflow: mask.scrollWidth - mask.clientWidth,
      panelOverflow: el.scrollWidth - el.clientWidth, inertPanes: document.querySelectorAll('.cfzn-factory-editor [inert]').length,
    };
  });
  assert.deepEqual(bounds.mask, [0, 0, ...bounds.viewport]);
  assert.equal(bounds.maskPosition, 'fixed');
  assert.match(bounds.background, /rgba\(0, 0, 0, 0\.45\)/);
  assert.ok(bounds.inertPanes > 0, JSON.stringify(bounds));
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.right <= bounds.viewport[0] && bounds.bottom <= bounds.viewport[1]);
  assert.ok(bounds.maskOverflow <= 1 && bounds.panelOverflow <= 1, JSON.stringify(bounds));
  if (maxWidth) assert.equal(bounds.width, maxWidth);
  await expect(s.frame.locator('.cfzn-factory-dialog-mask')).toHaveCount(1);
  return bounds;
}

async function finish(s, modal, trigger, way = 'OK') {
  if (way === 'Escape') await s.page.keyboard.press('Escape');
  else await dialogButton(modal, way).click();
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function insertFragment(s, buttonName, text) {
  await dialogButton(modify(s), buttonName).click();
  await expect(widget(s)).toBeFocused();
  await widget(s).fill(text);
  await widget(s).press('Enter');
  await expect(widget(s)).toBeHidden();
}

async function declarationField(s, text) {
  const field = modify(s).locator('.cfzn-declare-workspace .blocklyEditableText').filter({ hasText: new RegExp('^' + text + '$') });
  await field.click();
  await expect(widget(s)).toHaveValue(text);
}

async function declarationColors(s, modal, shape) {
  const workspace = modal.locator('.cfzn-declare-workspace');
  await expect(workspace.locator('.blocklyFlyout, .blocklyFlyoutBackground, .blocklyToolboxDiv, .scratchCategoryMenu')).toHaveCount(0);
  const outline = workspace.locator('.blocklyBlockCanvas .blocklyPath').first();
  await expect(outline).toHaveCSS('fill', 'rgb(39, 24, 255)');
  await expect(outline).toHaveCSS('stroke', 'rgb(241, 0, 135)');
  const strokeWidth = await outline.evaluate(path => parseFloat(getComputedStyle(path).strokeWidth));
  assert.ok(strokeWidth > 0, shape + ' declaration must draw the secondary stroke');

  // The SVG can have the right fill even when the browser paints another layer over it.
  // Sample both halves of the rendered block, away from its antialiased outer edge.
  const png = await outline.screenshot({ scale: 'css' });
  const samples = await s.inner.evaluate(async encoded => {
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { width, height } = canvas;
    return [0.18, 0.58].map(start => {
      const { data } = ctx.getImageData(Math.floor(width * start), Math.floor(height * 0.33),
        Math.max(1, Math.floor(width * 0.24)), Math.max(1, Math.floor(height * 0.34)));
      let mainColorPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 39 && data[i + 1] === 24 && data[i + 2] === 255 && data[i + 3] === 255) mainColorPixels++;
      }
      return { mainColorPixels, pixels: data.length / 4 };
    });
  }, png.toString('base64'));
  for (const sample of samples) {
    assert.ok(sample.mainColorPixels > sample.pixels / 2, shape + ' declaration color sample ' + JSON.stringify(samples));
  }
  return { shape, strokeWidth, left: samples[0], right: samples[1] };
}

async function verifyPinDefaults(s) {
  const names = { DOUT: 'digitalOutputPin', AIN: 'analogInputPin', DIN: 'digitalInputPin' };
  for (const [parameter, source] of Object.entries(names)) {
    const row = defaultRow(s, parameter);
    await insertFragment(s, '添加下拉框变量', parameter);
    await row.getByRole('button', { name: '设备引脚' }).click();
    const menu = row.getByLabel('选择设备引脚类型');
    assert.deepEqual(await menu.locator('option').evaluateAll(options => options.map(option => option.value)), Object.values(names));
    await menu.selectOption(source);
    await expect(row.getByRole('status')).toHaveCount(0);
  }
  return names;
}
async function setCode(editor, value) {
  const field = editor.locator('.monaco-editor textarea');
  await expect(field).toBeVisible();
  await field.focus();
  await field.press('Control+a');
  await field.press('Backspace');
  const page = editor.page();
  await page.keyboard.insertText(value);
  await expect(content(editor)).toContainText(value);
}
async function layout(s) {
  return s.inner.evaluate(() => {
    const left = document.querySelector('.cfzn-factory-settings').getBoundingClientRect();
    const right = document.querySelector('.cfzn-factory-blocks').getBoundingClientRect();
    const width = document.querySelector('.cfzn-factory-editor').getBoundingClientRect().width;
    const screen = document.querySelector('.cfzn-custom-factory').getBoundingClientRect();
    return { left: left.toJSON(), right: right.toJSON(), width, viewport: innerWidth, screen: screen.toJSON() };
  });
}
async function scrollPanes(s) {
  const left = s.frame.locator(settingsPanel);
  const right = s.frame.locator(blocksPanel);
  const scrollTop = panel => panel.evaluate(node => node.scrollTop);
  const blockTable = s.frame.getByRole('table', { name: 'Block Definitions' });
  const wheel = async panel => {
    const box = await panel.boundingBox();
    await s.page.mouse.move(box.x + 15, box.y + box.height / 2);
    await s.page.mouse.wheel(0, 325);
  };
  await left.evaluate(node => { node.scrollTop = 0; });
  await right.evaluate(node => { node.scrollTop = 0; });
  const initialLeft = await scrollTop(left);
  const initialRight = await scrollTop(right);
  const initialTable = await blockTable.boundingBox();
  for (const pane of [left, right]) {
    const size = await pane.evaluate(node => ({ height: node.clientHeight, content: node.scrollHeight }));
    assert.ok(size.content > size.height, JSON.stringify(size));
  }
  await wheel(left);
  await expect.poll(() => scrollTop(left)).toBeGreaterThan(initialLeft);
  assert.equal(await scrollTop(right), initialRight);
  assert.equal((await blockTable.boundingBox()).y, initialTable.y);
  const scrolledLeft = await scrollTop(left);
  await wheel(right);
  await expect.poll(() => scrollTop(right)).toBeGreaterThan(initialRight);
  assert.equal(await scrollTop(left), scrolledLeft);
}

async function start(context, origin, label) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      getPorts: async () => [],
      requestPort: async () => { throw Error('Physical serial used in isolated test'); },
    } });
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin && !url.pathname.startsWith('/api/v1/hardware') ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.pageErrors.push({ label, message: String(error) }));
  await page.goto(origin);
  const frame = page.frameLocator('iframe');
  await expect(frame.getByTestId('save-project')).toBeEnabled({ timeout: 60000 });
  const inner = await (await page.locator('iframe').elementHandle()).contentFrame();
  await inner.evaluate(() => {
    const original = CFZNOpenBlock.renderLibrary;
    CFZNOpenBlock.renderLibrary = (...args) => {
      window.__qaVm = args[2].vm;
      return original(...args);
    };
  });
  return { page, frame, inner, context };
}

async function bridge(s, type) {
  return s.page.evaluate(type => new Promise((done, fail) => {
    const source = document.querySelector('iframe').contentWindow;
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener('message', receive);
      fail(Error('Bridge timeout: ' + type));
    }, 12000);
    function receive(event) {
      if (event.origin !== location.origin || event.source !== source || event.data?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      const { ok, result, error } = event.data.payload;
      if (!ok) return fail(Error(error.message));
      done(type === 'EXPORT_PROJECT' ? Array.from(new Uint8Array(result.bytes)) : result);
    }
    window.addEventListener('message', receive);
    source.postMessage({ protocol: 'cfzn.openblock', version: 1, type, requestId }, location.origin);
  }), type);
}

async function blockly(s) {
  await s.inner.evaluate(() =>
    window.__qaVm.runtime.emit('DEVICE_EXTENSION_ADDED', { defineMessages: Blockly => (window.__qaBlockly = Blockly) }));
}
async function dragBlock(s, opcode) {
  await s.frame.locator('.scratchCategoryMenuItemLabel').getByText(name, { exact: true }).click();
  await expect(s.frame.locator('.blocklyFlyout').first()).toBeVisible();
  const from = await s.inner.evaluate(async opcode => {
    const item = window.__qaBlockly.getMainWorkspace().getFlyout().getFlyoutItems().find(b => b.type === opcode);
    if (!item || item.disabled) throw Error('Custom block missing or disabled in real flyout: ' + opcode);
    const view = item.getSvgRoot();
    let last, stable = 0;
    const deadline = performance.now() + 2500;
    while (stable < 8 && performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
      const y = view.getBoundingClientRect().y;
      stable = Math.abs(y - last) < 0.1 ? stable + 1 : 0;
      last = y;
    }
    return view.getBoundingClientRect().toJSON();
  }, opcode);
  const box = await s.page.locator('iframe').boundingBox();
  const workspace = await s.frame.locator('.blocklyMainBackground').first().boundingBox();
  await s.page.mouse.move(box.x + from.x + 30, box.y + from.y + from.height / 2);
  await s.page.mouse.down();
  await s.page.mouse.move(workspace.x + workspace.width * 0.65, workspace.y + workspace.height * 0.42, { steps: 24 });
  await s.page.mouse.up();
  await s.inner.waitForFunction(opcode => Object.values(window.__qaVm.editingTarget.blocks._blocks)
    .some(item => item.opcode === opcode && !item.shadow), opcode);
  const block = await s.inner.evaluate(opcode => {
    const workspace = window.__qaBlockly.getMainWorkspace();
    const item = workspace.getAllBlocks(false).find(item => item.type === opcode);
    const hat = workspace.newBlock('event_whenarduinobegin');
    hat.initSvg();
    hat.render();
    hat.moveBy(320, 120);
    hat.nextConnection.connect(item.previousConnection);
    return { id: item.id, hatId: hat.id };
  }, opcode);
  await s.inner.waitForFunction(({ id, hatId }) =>
    window.__qaVm.editingTarget.blocks.getBlock(hatId)?.next === id, block);
  return block;
}
const generate = s => s.inner.evaluate(() => window.__qaBlockly.Arduino.workspaceToCode(window.__qaBlockly.getMainWorkspace()));

function archive(bytes) {
  const zip = unzipSync(bytes);
  const project = JSON.parse(Buffer.from(zip['project.json']).toString('utf8'));
  const assets = Object.entries(zip).filter(([key]) => key !== 'project.json').map(([, bytes]) => sha(bytes)).sort();
  return { project, assets };
}

async function openProject(s, id) {
  const response = has(s.page, projectPath + '/' + id + '/content', 'GET');
  await s.frame.getByTestId('project-list-button').click();
  await s.page.locator('[data-project-id="' + id + '"]').getByRole('button', { name: '打开', exact: true }).click();
  const downloaded = await response;
  assert.equal(downloaded.status(), 200);
  assert.equal(downloaded.request().headers()['if-match'], '"1"');
  return downloaded;
}

async function tryPreview(s) {
  const trigger = b(s, '生成预览');
  const state = await bridge(s, 'GET_STATE');
  const project = await bridge(s, 'GET_PROJECT_JSON');
  const modal = dialog(s, '生成预览');
  await trigger.click();
  await masked(s, modal);
  const playground = modal.locator('.cfzn-factory-playground');
  await playground.locator('.scratchCategoryMenuItemLabel').getByText(name, { exact: true }).click();
  const flyoutBlock = playground.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: 'QA write' }).first();
  await expect(flyoutBlock).toBeVisible();
  const from = await flyoutBlock.locator('.blocklyPath').first().boundingBox();
  const target = await playground.locator('.blocklyMainBackground').first().boundingBox();
  await s.page.mouse.move(from.x + 24, from.y + 17);
  await s.page.mouse.down();
  await s.page.mouse.move(target.x + target.width * 0.73, target.y + target.height * 0.55, { steps: 28 });
  await s.page.mouse.up();
  const placed = playground.locator('.blocklyBlockCanvas .blocklyDraggable:not(.blocklyFlyout *)').filter({ hasText: 'QA write' });
  await expect(placed).toBeVisible();
  await s.page.screenshot({ path: join(out, 'factory-preview-drag.png') });
  await finish(s, modal, trigger, '关闭');
  assert.deepEqual(await bridge(s, 'GET_STATE'), state);
  assert.deepEqual(await bridge(s, 'GET_PROJECT_JSON'), project);
  assert.deepEqual(await s.inner.evaluate(() => Object.keys(window.__qaBlockly.Blocks)
    .filter(opcode => opcode.startsWith('cfzn_custom_factory_preview_'))), []);
}

async function populateCommand(s) {
  const trigger = addShape(s, 'command');
  await trigger.click();
  const box = await masked(s, modify(s), 540);
  await modify(s).getByLabel('Block ID').fill(key);
  await insertFragment(s, '添加文本', 'QA write');
  await insertFragment(s, '添加文本变量', 'TXT');
  await defaultRow(s, 'TXT').locator('input').fill('hello');
  await insertFragment(s, '添加数字变量', 'DROP_THIS');
  await defaultRow(s, 'DROP_THIS').locator('input').fill('99');
  await insertFragment(s, '添加数字变量', 'AMOUNT');
  await defaultRow(s, 'AMOUNT').locator('input').fill('7');
  await insertFragment(s, '添加布尔变量', 'BOOL');
  await defaultRow(s, 'BOOL').locator('select').selectOption('true');
  await declarationField(s, 'DROP_THIS');
  await s.frame.locator('.blocklyWidgetDiv .blocklyTextRemoveIcon').click();
  await expect(defaultRow(s, 'DROP_THIS')).toHaveCount(0);
  await expect(defaultRow(s, 'TXT').locator('input')).toHaveValue('hello');
  await expect(defaultRow(s, 'AMOUNT').locator('input')).toHaveValue('7');
  await expect(defaultRow(s, 'BOOL').locator('select')).toHaveValue('true');
  await declarationField(s, 'AMOUNT');
  await widget(s).fill('LEVEL');
  await widget(s).press('Enter');
  await expect(defaultRow(s, 'LEVEL').locator('input')).toHaveValue('7');
  await insertFragment(s, '添加下拉框变量', 'MODE');
  const choice = defaultRow(s, 'MODE');
  await choice.getByLabel('选项（英文逗号分隔）').fill('LOW,HIGH');
  await choice.getByLabel('默认选项').selectOption('HIGH');
  await choice.getByRole('button', { name: '设备引脚' }).click();
  await choice.getByRole('button', { name: /^自定义/ }).click();
  await expect(choice.getByLabel('默认选项')).toHaveValue('HIGH');
  const pinModes = await verifyPinDefaults(s);
  const viewport = s.page.viewportSize();
  await s.page.setViewportSize({ width: 1440, height: 1350 });
  await modify(s).locator('.cfzn-factory-dialog-body').evaluate(el => { el.scrollTop = 0; });
  await s.page.screenshot({ path: join(out, 'modify-block-pin-settings.png') });
  await s.page.setViewportSize(viewport);
  await expect(rows(s)).toHaveCount(0);
  await finish(s, modify(s), trigger);
  await expect(rows(s)).toHaveCount(1);
  return { box, pinModes };
}

async function verifyRuntimeSockets(s, block) {
  const details = await s.inner.evaluate(id => {
    const B = window.__qaBlockly;
    const ws = B.getMainWorkspace();
    const item = ws.getBlockById(id);
    const pins = {};
    for (const [field, menu] of Object.entries({
      DOUT: 'arduino_pin_setDigitalOutput', AIN: 'arduino_pin_readAnalogPin', DIN: 'arduino_pin_readDigitalPin',
    })) {
      const actual = item.getField(field).getOptions();
      const expected = B.Device.getPinOptions(menu).map(([label, value]) => [label, String(value)]);
      pins[field] = { actual, expected, initial: item.getFieldValue(field) };
      item.setFieldValue(actual.at(-1)[1], field);
      pins[field].selected = item.getFieldValue(field);
    }
    const shadow = name => {
      const child = item.getInputTargetBlock(name);
      return [child.type, child.isShadow(), child.getFieldValue(name === 'TXT' ? 'TEXT' : 'NUM')];
    };
    return { pins, text: shadow('TXT'), number: shadow('LEVEL'), bool: item.getInput('BOOL').connection.check_,
      boolEmpty: !item.getInputTargetBlock('BOOL'), custom: item.getField('MODE').getOptions() };
  }, block.id);
  assert.deepEqual(details.text, ['text', true, 'hello']);
  assert.equal(details.number[0], 'math_number');
  assert.equal(details.number[1], true);
  assert.equal(Number(details.number[2]), 7);
  assert.deepEqual(details.bool, ['Boolean']);
  assert.equal(details.boolEmpty, true);
  assert.deepEqual(details.custom, [['HIGH', 'HIGH'], ['LOW', 'LOW']]);
  for (const [field, pin] of Object.entries(details.pins)) {
    assert.deepEqual(pin.actual, pin.expected);
    assert.ok(pin.actual.length >= (field === 'AIN' ? 6 : 10));
    assert.notEqual(pin.initial, pin.selected);
  }
  const pinValues = ['DOUT', 'AIN', 'DIN'].map(field => details.pins[field].selected).join(', ');
  const generated = await generate(s);
  assert.ok(generated.includes(generatedCommand + pinValues + ');'), generated);
  const shadowXml = await s.inner.evaluate(id => {
    const item = window.__qaBlockly.getMainWorkspace().getBlockById(id);
    return ['TXT', 'LEVEL'].map(name => {
      const connection = item.getInput(name).connection;
      const xml = new XMLSerializer().serializeToString(connection.getShadowDom());
      connection.setShadowDom(null);
      connection.targetBlock().dispose(false, false);
      return [name, xml];
    });
  }, block.id);
  assert.ok((await generate(s)).includes(generatedCommand + pinValues + ');'), 'Text and number must fall back after shadow removal');
  const connections = await s.inner.evaluate(({ id, shadowXml }) => {
    const B = window.__qaBlockly;
    const ws = B.getMainWorkspace();
    const item = ws.getBlockById(id);
    const create = (type, field, value) => {
      const child = ws.newBlock(type);
      child.initSvg();
      child.render();
      if (field) child.setFieldValue(value, field);
      return child;
    };
    const text = create('text', 'TEXT', 'connected');
    const number = create('math_number', 'NUM', '11');
    const boolean = create('operator_equals');
    boolean.getInput('OPERAND1').connection.connect(create('math_number', 'NUM', '1').outputConnection);
    boolean.getInput('OPERAND2').connection.connect(create('math_number', 'NUM', '2').outputConnection);
    const allowedNumber = item.getInput('BOOL').connection.checkType_(number.outputConnection);
    const allowedBoolean = item.getInput('BOOL').connection.checkType_(boolean.outputConnection);
    for (const [name, xml] of shadowXml) {
      const input = item.getInput(name).connection;
      input.setShadowDom(new DOMParser().parseFromString(xml, 'application/xml').documentElement);
      input.respawnShadow_();
    }
    item.getInput('TXT').connection.connect(text.outputConnection);
    item.getInput('LEVEL').connection.connect(number.outputConnection);
    item.getInput('BOOL').connection.connect(boolean.outputConnection);
    return { allowedNumber, allowedBoolean, children: [text.id, number.id, boolean.id], booleanCode: B.Arduino.blockToCode(boolean)[0] };
  }, { id: block.id, shadowXml });
  assert.equal(connections.allowedNumber, false);
  assert.equal(connections.allowedBoolean, true);
  const connected = await generate(s);
  assert.ok(connected.includes('qaWrite("connected", 11, ' + connections.booleanCode.replace(/^\((.*)\)$/, '$1') + ', HIGH, ' + pinValues + ');') ||
    connected.includes('qaWrite("connected", 11, (' + connections.booleanCode + '), HIGH, ' + pinValues + ');'), connected);
  await s.inner.waitForFunction(({ id, children }) => {
    const item = window.__qaVm.editingTarget.blocks.getBlock(id);
    return ['TXT', 'LEVEL', 'BOOL'].every((key, i) => item.inputs[key]?.block === children[i]);
  }, { id: block.id, children: connections.children });
  return { details, generated, connected, connections };
}

await mkdir(out, { recursive: true });
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  api = await createApp(temp, { customModuleOrigins: [origin],
    arduinoLibraryFetch: async url => {
      assert.equal(String(url), 'https://downloads.arduino.cc/libraries/library_index.json');
      return Response.json(libraryIndex);
    },
  });
  await api.listen(0, '127.0.0.1');
  apiOrigin = await api.getUrl();
  browser = await chromium.launch({ executablePath: process.env.CFZN_TEST_EDGE ||
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const editorHtml = await readFile(join(dist, 'openblock.html'), 'utf8');
  const editor = editorHtml.match(/editor-[\w-]+\.js/)?.[0];
  const editorSha256 = sha(await readFile(join(dist, 'assets', editor)));
  report.environment = { browser: browser.version(), editor, editorSha256, origin, apiOrigin };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fresh = await start(context, origin, 'programming-no-board');
  await expect(b(fresh, '编程模式')).toHaveAttribute('aria-pressed', 'true');
  const freshProject = JSON.parse((await bridge(fresh, 'GET_PROJECT_JSON')).json);
  assert.equal(freshProject.device?.deviceId ?? null, null);
  await library(fresh);
  await modules(fresh);
  await factory(fresh);
  await b(fresh, '新建模块').click();
  await expect(fresh.frame.locator('.cfzn-factory-board-picker :checked')).toHaveCount(0);
  await expect(fresh.frame.getByRole('table', { name: 'Block Definitions' })).toBeVisible();
  assert.deepEqual(await fresh.frame.getByRole('columnheader').allTextContents(), ['Op Code', 'Preview', 'Block Logic', 'Action']);
  await expect(rows(fresh)).toHaveCount(0);
  const wide = await layout(fresh);
  assert.ok(wide.left.right < wide.right.left && wide.right.width > wide.left.width, JSON.stringify(wide));
  await fresh.frame.getByLabel(/^积木主色/).fill('#2718ff');
  await fresh.frame.getByLabel(/^积木辅色/).fill('#f10087');
  const sizes = [];
  const colors = [];
  for (const [i, type] of ['command', 'reporter', 'boolean', 'hat'].entries()) {
    const trigger = addShape(fresh, type);
    const modal = modify(fresh);
    await trigger.click();
    sizes.push(await masked(fresh, modal, 540));
    colors.push(await declarationColors(fresh, modal, type));
    await expect(modal.locator('details')).toHaveAttribute('open', '');
    const toolbar = modal.getByRole('group', { name: '添加积木片段' });
    await expect(toolbar.getByRole('button')).toHaveText(['添加文本', '添加文本变量', '添加数字变量', '添加布尔变量', '添加下拉框变量']);
    await expect(rows(fresh)).toHaveCount(i);
    await modal.getByLabel('Block ID').fill('discard_' + i);
    await finish(fresh, modal, trigger, ['Cancel', '关闭弹窗', 'Escape', 'Cancel'][i]);
    await expect(rows(fresh)).toHaveCount(i);
    await trigger.click();
    await expect(modal.getByLabel('Block ID')).not.toHaveValue('discard_' + i);
    await finish(fresh, modal, trigger);
    await expect(rows(fresh).nth(i)).toHaveAttribute('data-shape', type);
    await expect(rows(fresh).nth(i).locator('[data-cfzn-custom-block-preview] > svg .blocklyPath').first()).toBeVisible();
  }
  pass('Four declaration shapes render the configured color on both halves and the secondary outline without an empty flyout', colors);
  await expect(preview(fresh)).toHaveCount(4);
  await fresh.page.screenshot({ path: join(out, 'factory-no-board-desktop.png') });
  await fresh.page.setViewportSize({ width: 1200, height: 480 });
  await scrollPanes(fresh);
  pass('Desktop wheel scrolling moves each pane independently and leaves the other pane in place');
  await fresh.page.setViewportSize({ width: 640, height: 900 });
  const narrow = await layout(fresh);
  assert.ok(narrow.right.top >= narrow.left.bottom && narrow.right.right <= narrow.screen.right + 1, JSON.stringify(narrow));
  await fresh.frame.getByRole('table', { name: 'Block Definitions' }).scrollIntoViewIfNeeded();
  await expect(preview(fresh)).toHaveCount(4);
  await fresh.page.screenshot({ path: join(out, 'factory-no-board-narrow.png') });
  await fresh.page.setViewportSize({ width: 390, height: 844 });
  const baselineRootOverflow = await fresh.inner.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const edit = b(fresh, 'Edit newblock_1');
  await edit.click();
  const phone = await masked(fresh, modify(fresh));
  await fresh.page.screenshot({ path: join(out, 'modify-block-390.png') });
  assert.ok(phone.documentOverflow <= baselineRootOverflow);
  await modify(fresh).getByLabel('Block ID').fill('newblock_2');
  await dialogButton(modify(fresh), 'OK').click();
  await expect(modify(fresh).getByRole('alert')).toContainText('必须唯一');
  await finish(fresh, modify(fresh), edit, 'Escape');
  await expect(rows(fresh)).toHaveCount(4);
  await expect(rows(fresh).first()).toContainText('newblock_1');
  await fresh.page.close();
  pass('Four shapes use 540px Modify Block, dismissals restore focus, and Edit fits 390px', { sizes, wide, narrow, phone, baselineRootOverflow });

  let owner = await start(context, origin, 'owner');
  await b(owner, '上传模式').click();
  await library(owner);
  await card(owner, 'controller', 'arduinoUno').locator('.cfzn-card-select').click();
  await expect(card(owner, 'controller', 'arduinoUno')).toHaveAttribute('data-cfzn-selected', 'true');
  await modules(owner);
  await expect(owner.frame.locator('.cfzn-extension-status')).toContainText('当前主控');
  const position = await b(owner, '自定义模块扩展').evaluate(node => {
    const status = node.parentElement.querySelector('.cfzn-extension-status');
    const a = status?.getBoundingClientRect(), b = node.getBoundingClientRect();
    return a && { gap: b.left - a.right, statusMid: (a.top + a.bottom) / 2, buttonMid: (b.top + b.bottom) / 2 };
  });
  assert.ok(position && position.gap >= 0 && position.gap < 30 && Math.abs(position.statusMid - position.buttonMid) < 4, JSON.stringify(position));
  const search = owner.frame.locator('input[class*="library_filter-input"]');
  await expect(search).toBeVisible();
  for (const id of moduleIds) await expect(card(owner, 'module', id)).toBeVisible();
  await search.fill('buzzer');
  await expect(card(owner, 'module', 'activateBuzzer')).toBeVisible();
  await expect(card(owner, 'module', 'atomizer')).toBeHidden();
  await search.fill('');
  await owner.page.screenshot({ path: join(out, 'library-entry.png') });
  pass('Factory position, native header search and all six built-in modules', position);

  await factory(owner);
  await expect(owner.frame.getByText('还没有自定义模块。')).toBeVisible();
  await b(owner, '新建模块').click();
  await owner.frame.getByLabel('模块名称', { exact: true }).fill(name);
  await owner.frame.getByLabel('模块说明', { exact: true }).fill('Personal upload test');
  const headers = dialog(owner, '生成器头文件 / 全局片段');
  const headersTrigger = b(owner, '编辑头文件');
  await headersTrigger.click();
  await masked(owner, headers);
  await setCode(code(owner, '全局声明和头文件'), 'discard header');
  await finish(owner, headers, headersTrigger, 'Cancel');
  await headersTrigger.click();
  await expect(content(code(owner, '全局声明和头文件'))).not.toContainText('discard header');
  await setCode(code(owner, '全局声明和头文件'), 'const int qaPin = 13;');
  await dialogButton(headers, 'setup() 初始化').click();
  await setCode(code(owner, 'setup() 初始化'), 'pinMode(qaPin, OUTPUT);');
  await finish(owner, headers, headersTrigger);
  pass('Arduino header/setup modal has its own mask and Cancel/OK transaction');
  pass('Native declaration fields rename, delete with trash, keep neighboring defaults and configure three pin sources',
    await populateCommand(owner));
  const logic = dialog(owner, 'Arduino 生成器：' + key);
  const logicTrigger = b(owner, '积木逻辑 ' + key);
  await logicTrigger.click();
  await masked(owner, logic);
  await setCode(code(owner, '积木代码'), 'discard logic');
  await finish(owner, logic, logicTrigger, 'Cancel');
  await logicTrigger.click();
  await expect(content(code(owner, '积木代码'))).not.toContainText('discard logic');
  await setCode(code(owner, '积木代码'), baseCode);
  await dialogButton(logic, '生成示例').click();
  const sample = code(owner, '默认参数生成的 Arduino 示例');
  await expect(content(sample)).toContainText(generatedCommand);
  const sampleField = sample.locator('.monaco-editor textarea');
  await expect(sampleField).toHaveJSProperty('readOnly', true);
  await sampleField.focus();
  await sampleField.press('End');
  await sampleField.press('x');
  await expect(content(sample)).not.toContainText(generatedCommand + 'x');
  await finish(owner, logic, logicTrigger);
  const editCommand = b(owner, 'Edit ' + key);
  await editCommand.click();
  await expect(defaultRow(owner, 'LEVEL').locator('input')).toHaveValue('7');
  await finish(owner, modify(owner), editCommand);
  await expect(rows(owner)).toHaveCount(1);
  await logicTrigger.click();
  await expect(content(code(owner, '积木代码'))).toContainText(baseCode);
  await finish(owner, logic, logicTrigger, 'Cancel');
  pass('Edit updates the same row and preserves committed generator code');
  await blockly(owner);
  await tryPreview(owner);
  pass('Workspace preview accepts a real drag and leaves project, edit state and registered preview opcodes unchanged');
  const libraryTrigger = b(owner, '从 Arduino 官方库中添加');
  const picker = dialog(owner, 'Arduino 库管理器索引');
  await libraryTrigger.click();
  await masked(owner, picker);
  await owner.frame.getByLabel('搜索 Arduino 库').fill('Servo');
  const searched = has(owner.page, searchPath, 'GET');
  await b(owner, '搜索').click();
  assert.equal((await searched).status(), 200);
  await owner.frame.getByLabel('Servo 版本').selectOption('1.2.1');
  await expect(owner.frame.getByText('尚未选择 Arduino 库。', { exact: true })).toBeVisible();
  await b(owner, '添加 Arduino 库 Servo').click();
  await owner.page.screenshot({ path: join(out, 'factory-library.png') });
  await owner.frame.getByLabel('Servo 版本').selectOption('1.2.2');
  await b(owner, '更换版本 Servo').click();
  await finish(owner, picker, libraryTrigger, '关闭弹窗');
  await expect(owner.frame.getByRole('list', {name: '已选 Arduino 库'})).toContainText('Servo 1.2.2');
  pass('Arduino 库管理器索引 uses its own mask and commits explicitly added or changed versions');
  const savedModule = has(owner.page, modulePath, 'POST');
  await b(owner, '保存模块').click();
  const savedResponse = await savedModule;
  assert.equal(savedResponse.status(), 201);
  const original = (await savedResponse.json()).item;
  assert.match(original.id, /^custom[0-9a-f]{32}$/);
  assert.deepEqual(original.definition.supportDevice, ['arduinoUno']);
  assert.deepEqual(original.definition.blocks[0].inputs, [
    { name: 'TXT', type: 'textValue', defaultValue: 'hello' }, { name: 'LEVEL', type: 'numberValue', defaultValue: 7 },
    { name: 'BOOL', type: 'boolean', defaultValue: true }, { name: 'MODE', type: 'dropdown', options: [['HIGH', 'HIGH'], ['LOW', 'LOW']] },
    { name: 'DOUT', type: 'digitalOutputPin' }, { name: 'AIN', type: 'analogInputPin' }, { name: 'DIN', type: 'digitalInputPin' },
  ]);
  assert.deepEqual(original.definition.libraries, [{ name: 'Servo', version: '1.2.2' }]);
  assert.equal(original.definition.definitions, 'const int qaPin = 13;');
  assert.equal(original.definition.setup, 'pinMode(qaPin, OUTPUT);');
  assert.equal(original.definition.blocks[0].code, baseCode);
  const opcode = original.id + '_' + original.definition.blocks[0].key;
  const listing = owner.frame.locator('[data-cfzn-custom-module-id="' + original.id + '"]');
  await expect(listing).toContainText(name);
  pass('Factory saves immutable schema v1 with three sockets, three pin selectors and exact Servo version', original);

  await b(owner, '返回扩展库').click();
  await search.fill('Private Uno QA');
  const custom = card(owner, 'module', original.id);
  await expect(custom).toBeVisible();
  await custom.locator('.cfzn-card-select').click();
  await expect(custom).toHaveAttribute('data-cfzn-selected', 'true');
  await back(owner);
  await blockly(owner);
  const block = await dragBlock(owner, opcode);
  const sockets = await verifyRuntimeSockets(owner, block);
  for (const line of ['const int qaPin = 13;', 'pinMode(qaPin, OUTPUT);']) assert.ok(sockets.generated.includes(line), sockets.generated);
  pass('Real flyout drag uses native shadows, Boolean check, fallback and child generators with actual Uno pins', { block, ...sockets });

  const save = has(owner.page, projectPath, 'POST');
  await owner.frame.getByTestId('save-project').click();
  const saveResponse = await save;
  assert.equal(saveResponse.status(), 201);
  await expect(owner.frame.getByTestId('project-status')).toContainText('已保存 · v1');
  const savedProject = (await saveResponse.json()).project;
  const body = new Response(saveResponse.request().postDataBuffer(), {
    headers: { 'content-type': saveResponse.request().headers()['content-type'] },
  });
  const uploaded = Buffer.from(await (await body.formData()).get('file').arrayBuffer());
  const downloaded = await context.request.get(origin + projectPath + '/' + savedProject.id + '/content', { headers: { 'If-Match': '"1"' } });
  assert.equal(downloaded.status(), 200);
  assert.equal(downloaded.headers().etag, '"1"');
  assert.deepEqual(await downloaded.body(), uploaded);
  const persisted = archive(uploaded);
  assert.deepEqual(persisted.project.deviceExtensions, [original.id]);
  assert.ok(!JSON.stringify(persisted.project).includes(baseCode));
  assert.ok(persisted.assets.length > 0);
  const graph = persisted.project.targets.find(t => t.blocks[block.id]).blocks;
  assert.equal(graph[block.id].opcode, opcode);
  assert.equal(graph[block.hatId].next, block.id);
  pass('Project API byte-for-byte round trip retains assets and ID-only private reference', { sha256: sha(uploaded), assets: persisted.assets.length });

  await library(owner);
  await modules(owner);
  await factory(owner);
  await listing.getByRole('button', { name: '创建新版本 ' + name }).click();
  await owner.frame.getByLabel('版本', { exact: true }).fill('2.0.0');
  await logicTrigger.click();
  await setCode(code(owner, '积木代码'), 'digitalWrite(qaPin, 42);');
  await finish(owner, logic, logicTrigger);
  const nextModule = has(owner.page, modulePath, 'POST');
  await b(owner, '保存新版本').click();
  const nextResponse = await nextModule;
  assert.equal(nextResponse.status(), 201);
  const next = (await nextResponse.json()).item;
  assert.notEqual(next.id, original.id);
  await listing.getByRole('button', { name: '隐藏 ' + name }).click();
  const hide = has(owner.page, modulePath + '/' + original.id, 'DELETE');
  await b(owner, '确认隐藏').click();
  assert.equal((await hide).status(), 204);
  await expect(listing).toHaveCount(0);
  const oldRecord = await context.request.get(origin + modulePath + '/' + original.id);
  assert.equal(oldRecord.status(), 200);
  assert.deepEqual((await oldRecord.json()).item, original);
  pass('New version receives a separate ID and hiding preserves the original owner snapshot');

  await owner.page.close();
  owner = await start(context, origin, 'owner-fresh-page');
  await library(owner);
  await back(owner);
  await blockly(owner);
  const blank = await bridge(owner, 'GET_STATE');
  const blankProject = await bridge(owner, 'GET_PROJECT_JSON');
  await owner.inner.evaluate(opcode => {
    const vm = window.__qaVm;
    const B = window.__qaBlockly;
    window.__qaRestoreTrace = [];
    vm.on('workspaceUpdate', ({ xml }) => {
      if (!xml.includes(opcode)) return;
      const nodes = [...new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('block, shadow')];
      const target = vm.editingTarget;
      setTimeout(() => {
        const workspace = B.getMainWorkspace();
        window.__qaRestoreTrace.push(nodes.map(node => {
          const id = node.getAttribute('id');
          return { id, type: node.getAttribute('type'), tag: node.localName,
            obscured: node.localName === 'shadow' && [...node.parentElement.children].some(child => child.localName === 'block'),
            vm: target.blocks.getBlock(id)?.opcode ?? null, workspace: workspace.getBlockById(id)?.type ?? null };
        }));
      }, 300);
    });
  }, opcode);
  const reopened = await openProject(owner, savedProject.id);
  assert.equal(sha(await reopened.body()), sha(uploaded));
  try {
    const notice = owner.page.getByTestId('project-notice');
    await expect(notice).toContainText(/已打开|无法读取/, { timeout: 30000 });
    assert.match(await notice.innerText(), /已打开/);
    await library(owner);
    await modules(owner);
    await expect(card(owner, 'module', original.id)).toHaveAttribute('data-cfzn-selected', 'true');
    await back(owner);
    await blockly(owner);
    const reopenedCode = await generate(owner);
    assert.ok(reopenedCode.includes('qaWrite("connected", 11,'), reopenedCode);
    assert.ok(!reopenedCode.includes('digitalWrite(qaPin, 42);'));
    const roundtrip = archive(Buffer.from(await bridge(owner, 'EXPORT_PROJECT')));
    assert.deepEqual(roundtrip.assets, persisted.assets);
    assert.deepEqual(roundtrip.project.deviceExtensions, [original.id]);
    assert.deepEqual(roundtrip.project.targets.find(t => t.blocks[block.id]).blocks[block.id], graph[block.id]);
    const restoredShadows = await owner.inner.evaluate(id => {
      const item = window.__qaBlockly.getMainWorkspace().getBlockById(id);
      return ['TXT', 'LEVEL'].map(name => {
        const connection = item.getInput(name).connection;
        const hiddenId = connection.getShadowDom().getAttribute('id');
        connection.disconnect();
        const child = connection.targetBlock();
        return { hiddenId, id: child.id, shadow: child.isShadow(), value: String(child.getFieldValue(name === 'TXT' ? 'TEXT' : 'NUM')) };
      });
    }, block.id);
    for (const [index, expected] of ['hello', '7'].entries()) {
      const shadow = restoredShadows[index];
      assert.ok(shadow.shadow && shadow.hiddenId && shadow.id === shadow.hiddenId);
      assert.equal(shadow.value, expected);
    }
    assert.match(await generate(owner), /qaWrite\("hello", 7,/);
    pass('Fresh same-owner page reopens hidden version and reconnects the original default shadows on disconnect', restoredShadows);
  } catch (error) {
    const trace = await owner.inner.evaluate(() => window.__qaRestoreTrace);
    const rolledBack = JSON.stringify(await bridge(owner, 'GET_STATE')) === JSON.stringify(blank) &&
      JSON.stringify(await bridge(owner, 'GET_PROJECT_JSON')) === JSON.stringify(blankProject);
    report.failures.push({ case: 'same-owner reopen', message: String(error), block: graph[block.id], trace, rolledBack });
    await writeFile(join(out, 'same-owner-reopen.ob'), uploaded);
    await writeFile(join(out, 'same-owner-definition.json'), JSON.stringify(original, null, 2));
    await owner.page.screenshot({ path: join(out, 'same-owner-reopen.png') });
    console.error('FAIL same-owner reopen', error);
    process.exitCode = 1;
  }

  const { appearance, libraries, ...legacyDefinition } = original.definition;
  legacyDefinition.name = 'Legacy Snapshot QA';
  legacyDefinition.blocks = [{
    key, shape: 'command', message: 'Legacy {{LEVEL}} {{LABEL}} {{MODE}}',
    inputs: [
      { name: 'LEVEL', type: 'number', defaultValue: 7 }, { name: 'LABEL', type: 'text', defaultValue: 'legacy' },
      { name: 'MODE', type: 'dropdown', options: [['关闭', '0'], ['开启', '1']] },
    ],
    code: 'qaLegacy({{LEVEL}}, {{LABEL}}, {{MODE}});',
  }];
  const legacyResponse = await context.request.post(origin + modulePath, {
    headers: { Origin: origin }, data: { definition: legacyDefinition },
  });
  assert.equal(legacyResponse.status(), 201);
  const legacy = (await legacyResponse.json()).item;
  assert.ok(!Object.hasOwn(legacy.definition, 'appearance') && !Object.hasOwn(legacy.definition, 'libraries'));
  const legacyZip = unzipSync(uploaded);
  // Represent the old layout with serialized fields and no value-input children.
  const oldProject = JSON.parse(Buffer.from(legacyZip['project.json']).toString('utf8').replaceAll(original.id, legacy.id));
  const oldBlocks = oldProject.targets.find(t => t.blocks[block.id]).blocks;
  const derived = new Set([block.id]);
  for (let pending = true; pending;) {
    pending = false;
    for (const [id, entry] of Object.entries(oldBlocks)) {
      if (!derived.has(id) && derived.has(entry.parent)) {
        derived.add(id);
        pending = true;
      }
    }
  }
  for (const id of derived) if (id !== block.id) delete oldBlocks[id];
  oldBlocks[block.id].inputs = {};
  oldBlocks[block.id].fields = { LEVEL: [7, null], LABEL: ['legacy', null], MODE: ['0', null] };
  legacyZip['project.json'] = Buffer.from(JSON.stringify(oldProject));
  const legacyArchive = Buffer.from(zipSync(legacyZip));
  const legacySave = await context.request.post(origin + projectPath, {
    multipart: { name: legacyDefinition.name, file: {
      name: 'legacy.ob', mimeType: 'application/octet-stream', buffer: legacyArchive,
    } },
  });
  assert.equal(legacySave.status(), 201);
  const legacyPage = await start(context, origin, 'owner-legacy');
  await openProject(legacyPage, (await legacySave.json()).project.id);
  await expect(legacyPage.page.getByTestId('project-notice')).toContainText('已打开', { timeout: 30000 });
  await library(legacyPage);
  await modules(legacyPage);
  await expect(card(legacyPage, 'module', legacy.id)).toHaveAttribute('data-cfzn-selected', 'true');
  await factory(legacyPage);
  await b(legacyPage, '查看详情 ' + legacyDefinition.name).click();
  await expect(preview(legacyPage).first()).toBeVisible();
  await expect(legacyPage.frame.getByText('尚未选择 Arduino 库。')).toBeVisible();
  await b(legacyPage, '返回私有模块').click();
  await b(legacyPage, '返回扩展库').click();
  await back(legacyPage);
  await blockly(legacyPage);
  assert.match(await generate(legacyPage), /qaLegacy\(7, "legacy", 0\);/);
  const legacyRoundtrip = archive(Buffer.from(await bridge(legacyPage, 'EXPORT_PROJECT')));
  assert.deepEqual(legacyRoundtrip.assets, persisted.assets);
  assert.deepEqual(legacyRoundtrip.project.deviceExtensions, [legacy.id]);
  assert.equal(legacyRoundtrip.project.targets.find(t => t.blocks[block.id]).blocks[block.id].opcode,
    legacy.id + '_' + legacyDefinition.blocks[0].key);
  pass('Original-format archive opens and renders legacy number/text fields, then generates and exports intact');
  await library(legacyPage);
  await modules(legacyPage);
  await factory(legacyPage);
  await b(legacyPage, '创建新版本 ' + legacyDefinition.name).click();
  const legacyEdit = b(legacyPage, 'Edit ' + key);
  await legacyEdit.click();
  await expect(defaultRow(legacyPage, 'LEVEL').locator('input')).toHaveValue('7');
  await expect(defaultRow(legacyPage, 'LABEL').locator('input')).toHaveValue('legacy');
  const legacyChoices = defaultRow(legacyPage, 'MODE');
  await legacyChoices.getByLabel('选项（英文逗号分隔）').fill('关闭,开启,自动');
  await legacyChoices.getByLabel('默认选项').selectOption({ label: '开启' });
  await finish(legacyPage, modify(legacyPage), legacyEdit);
  const reordered = has(legacyPage.page, modulePath, 'POST');
  await b(legacyPage, '保存新版本').click();
  const reorderedResponse = await reordered;
  assert.equal(reorderedResponse.status(), 201);
  const reorderedItem = (await reorderedResponse.json()).item;
  assert.deepEqual(reorderedItem.definition.blocks[0].inputs[2].options, [['开启', '1'], ['关闭', '0'], ['自动', '自动']]);
  assert.equal(reorderedItem.definition.blocks[0].code, legacyDefinition.blocks[0].code);
  pass('CSV reorder preserves legacy display/code pairs, and saved default moves the entire pair');
  await legacyPage.page.close();

  const separate = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const outsider = await start(separate, origin, 'outsider');
  await library(outsider);
  await modules(outsider);
  await factory(outsider);
  await expect(outsider.frame.getByText('还没有自定义模块。')).toBeVisible();
  const otherRecords = await separate.request.get(origin + modulePath);
  assert.deepEqual(await otherRecords.json(), { items: [] });
  for (const id of [original.id, next.id, legacy.id, reorderedItem.id]) {
    assert.equal((await separate.request.get(origin + modulePath + '/' + id)).status(), 404);
  }
  await b(outsider, '返回扩展库').click();
  await back(outsider);
  const before = await bridge(outsider, 'GET_STATE');
  const beforeArchive = archive(Buffer.from(await bridge(outsider, 'EXPORT_PROJECT')));
  await openProject(outsider, savedProject.id);
  await expect(outsider.page.getByTestId('project-notice')).toHaveAttribute('role', 'alert', { timeout: 30000 });
  assert.deepEqual(await bridge(outsider, 'GET_STATE'), before);
  assert.deepEqual(archive(Buffer.from(await bridge(outsider, 'EXPORT_PROJECT'))), beforeArchive);
  pass('Fresh second context cannot list/read private versions or replace its editor with a referenced project');
  assert.deepEqual(report.pageErrors, []);
  assert.equal(await readFile(join(dist, 'openblock.html'), 'utf8'), editorHtml, 'Dist entry changed during the run');
  assert.equal(sha(await readFile(join(dist, 'assets', editor))), editorSha256);
  pass('No unhandled page errors');
} catch (error) {
  report.failure = error.stack;
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  api?.getHttpServer().closeAllConnections();
  await api?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.equal(dirname(await realpath(temp)), tempRoot);
  await rm(temp, { recursive: true, force: true });
  await writeFile(join(out, 'result.json'), JSON.stringify(report, null, 2));
}
