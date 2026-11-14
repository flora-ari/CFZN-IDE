import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { modules, normalizeDeviceId, supportsModule, validateProjectExtensions } from '../src/extensions/catalog.ts';
import { aijiteDevice } from '../src/extensions/aijite.ts';
// Preparation code is intentionally plain Node ESM, shared with the actual build.
// @ts-expect-error The preparation helper is JavaScript.
import { moduleSource, patchOpenBlock } from '../scripts/openblock-hooks.mjs';

test('native extension metadata validates before replacement and only the documented alias normalizes', () => {
  const available = ['arduinoUno', 'arduinoEsp32S3', 'aijiteESP32S3'];
  const original = { device: { deviceId: 'aijiteEsp32S3', type: 'arduino' }, programMode: 'upload', deviceExtensions: ['atomizer', 'pirSensor'] };
  assert.equal(validateProjectExtensions(original, available).device.deviceId, 'aijiteESP32S3');
  assert.equal(original.device.deviceId, 'aijiteEsp32S3');
  assert.equal(normalizeDeviceId('arduinoEsp32S3'), 'arduinoEsp32S3');
  assert.throws(() => validateProjectExtensions({ ...original, deviceExtensions: ['missingModule'] }, available), /missingModule/);
  assert.throws(() => validateProjectExtensions({ ...original, device: 'unknownBoard' }, available), /unknownBoard/);
  assert.throws(() => validateProjectExtensions({ ...original, device: {} }, available), /不支持主控/);
  assert.throws(() => validateProjectExtensions({ ...original, programMode: 'realtime' }, available), /上传模式/);
  assert.deepEqual(validateProjectExtensions({ targets: [] }, available), { targets: [] });
  for (const module of modules) {
    assert.ok(supportsModule(module, 'arduinoUno'));
    assert.ok(supportsModule(module, 'aijiteEsp32S3'));
    assert.equal(supportsModule(module, 'microbit'), false);
  }
});

test('Aijite inherits the official implementation and excludes IO3 without changing its base', () => {
  class Base {
    get PINS_MENU() { return [{ text: 'IO2', value: '2' }, { text: 'IO3', value: '3' }, { text: 'IO4', value: '4' }]; }
    get ANALOG_PINS_MENU() { return this.PINS_MENU; }
    get TOUCH_PINS_MENU() { return this.PINS_MENU; }
    getInfo() { return [{ menus: { pins: { items: this.PINS_MENU } }, blocks: [{ opcode: 'read' }] }]; }
  }
  const Device = aijiteDevice(Base);
  const device = new Device();
  assert.equal(device.DEVICE_ID, 'aijiteESP32S3');
  for (const options of [device.PINS_MENU, device.ANALOG_PINS_MENU, device.TOUCH_PINS_MENU, device.getInfo()[0].menus.pins.items]) {
    assert.deepEqual(options.map((option: any) => option.value), ['2', '4']);
  }
  assert.equal(new Base().PINS_MENU.length, 3);
});

test('six vendored modules have independent exports, original opcodes and parameter-sensitive Arduino generators', async () => {
  const Blockly: any = {
    Blocks: {}, Msg: {}, Device: { getPinOptions: () => [['IO2', '2'], ['IO4', '4']] },
    ScratchMsgs: { locales: { en: {}, ru: {}, 'zh-cn': {}, 'zh-tw': {} } },
    Arduino: { definitions_: {}, setups_: {}, ORDER_ATOMIC: 0,
      valueToCode: () => '"test comment"', statementToCode: () => '  digitalWrite(4, HIGH);\n  delay(10);\n' },
  };
  for (const module of modules) {
    for (const kind of ['translations', 'generator', 'blocks', 'toolbox']) {
      const source = await readFile(new URL(`../vendor/extensions/${module.extensionId}/${kind}.js`, import.meta.url), 'utf8');
      const result = await import(`data:text/javascript;base64,${Buffer.from(moduleSource(source, kind)).toString('base64')}`);
      assert.equal(typeof result.default, 'function');
      if (kind === 'toolbox') assert.match(result.default(), new RegExp(module.opcodes[0]));
      else result.default(Blockly);
    }
    for (const opcode of module.opcodes) {
      assert.ok(Blockly.Blocks[opcode], `${opcode} definition`);
      assert.equal(typeof Blockly.Arduino[opcode], 'function', `${opcode} generator`);
    }
  }
  const block = { getFieldValue: (name: string) => name === 'STATE' ? 'LOW' : '4' };
  Blockly.Arduino.activeBuzzer_init(block);
  Blockly.Arduino.atomizer_init(block);
  Blockly.Arduino.pirSensor_init(block);
  assert.match(Blockly.Arduino.definitions_.activeBuzzer_pin, /= 4/);
  assert.match(Blockly.Arduino.definitions_.atomizer_pin, /= 4/);
  assert.match(Blockly.Arduino.setups_.pirSensor_input, /INPUT/);
  assert.match(Blockly.Arduino.atomizer_setState(block), /digitalWrite\(atomizerPin, LOW\)/);
  assert.match(Blockly.Arduino.atomizer_toggle(block), /!atomizerState/);
  assert.match(Blockly.Arduino.pirSensor_detected(block)[0], /digitalRead/);
  for (const name of ['flameSensor', 'raindropSensor']) {
    assert.match(Blockly.Arduino[`${name}_readDigital`](block)[0], /digitalRead\(4\)/);
    assert.match(Blockly.Arduino[`${name}_readAnalog`](block)[0], /analogRead\(4\)/);
  }
  assert.match(Blockly.Arduino.moreComments_branchBlock(block), /\/\/ test comment\ndigitalWrite\(4, HIGH\);\ndelay\(10\);\n\/\/ End of test comment/);
  assert.equal(Blockly.Blocks.activeBuzzer_init !== undefined, true);
  assert.equal(modules.some(module => module.extensionId === 'activeBuzzer'), false);
});

test('preparation rejects a different upstream bundle instead of silently missing hooks', () => {
  assert.throws(() => patchOpenBlock('different release'), /hash mismatch/);
  assert.throws(() => moduleSource('missing functions', 'blocks'), /Missing explicit module function/);
});
