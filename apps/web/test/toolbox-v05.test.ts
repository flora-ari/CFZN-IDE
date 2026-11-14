import test from 'node:test';
import assert from 'node:assert/strict';
import { BuiltinResources } from '../src/extensions/builtin-resources.ts';
import { ToolboxPresentation } from '../src/extensions/toolbox-presentation.ts';
import { unsafeStageOpcode } from '../src/extensions/stage-execution.ts';

const version = 'a'.repeat(64);
const functions = { toolbox: () => '<category/>', translations: () => {}, generator: () => {}, blocks: () => {} };
test('manifest failure is retryable; failed module retry changes attempt and a changed release cannot mix into the project', async () => {
  let manifestFails = true, moduleFails = true, token = version;
  const calls: any[] = [];
  const resources = new BuiltinResources(async function (this: unknown) { assert.equal(this, globalThis); return new Response(JSON.stringify({ integrationSha256: token }), { status: manifestFails ? 503 : 200 }); }, () => ({
    async loadBuiltin(id, release, attempt) { calls.push({ id, release, attempt }); if (moduleFails) throw new Error('module missing'); return functions; },
  }));
  await assert.rejects(resources.prepare('atomizer'), /清单/); assert.equal(calls.length, 0);
  manifestFails = false; await assert.rejects(resources.prepare('atomizer'), /module missing/);
  moduleFails = false; assert.equal(await resources.prepare('atomizer'), functions);
  assert.ok(calls[1].attempt > calls[0].attempt);
  token = 'b'.repeat(64); await assert.rejects(resources.prepare('pirSensor'), /更新.*刷新/);
  assert.equal(calls.length, 2);
});
test('controller presentation merges groups, keeps target/hide filters, disables upload-only blocks and projects only committed modules', () => {
  const view = new ToolboxPresentation();
  const category = (id: string, blocks: any[]) => ({ id, name: id, color1: '#123456', color2: '#234567', blocks });
  view.capture({ deviceId: 'arduinoEsp32', categoryInfoArray: [
    category('arduino_pin', [
      { xml: '<block type="arduino_pin_write"/>', json: { type: 'arduino_pin_write' }, info: { opcode: 'write', programMode: ['upload'] } },
      { xml: '<block type="hidden"/>', json: { type: 'hidden' }, info: { hideFromPalette: true } },
      { xml: '<block type="spriteOnly"/>', json: { type: 'spriteOnly' }, info: { filter: ['sprite'] } },
    ]), category('arduino_serial', [{ xml: '<block type="arduino_serial_print"/>', json: { type: 'arduino_serial_print' }, info: {} }]),
  ] }, 'zh-cn');
  view.setModule('atomizer', '<category id="ATOMIZER_CATEGORY"/>');
  view.setModule('pirSensor', '<category id="PIRSENSOR_CATEGORY"/>');
  const programming = view.plan('arduinoEsp32', 'zh-cn', true, true, ['atomizer']);
  assert.equal(programming.controller?.id, 'cfzn-controller-arduinoEsp32');
  assert.deepEqual(programming.controller?.groups.map(group => group.blocks.map(block => block.opcode)), [['arduino_pin_write'], ['arduino_serial_print']]);
  assert.ok(programming.controller?.groups.every(group => group.blocks.every(block => block.disabled)));
  assert.deepEqual(programming.modules.map(entry => [entry.id, entry.disabled]), [['atomizer', true]]);
  const upload = view.plan('arduinoEsp32', 'zh-cn', false, false, ['atomizer']);
  assert.equal(upload.controller?.groups[0].blocks.length, 2); assert.equal(upload.modules[0].disabled, false);
  assert.equal(view.plan('arduinoEsp32S3', 'zh-cn', true, true, []).controller, undefined);
  assert.equal(view.plan('arduinoEsp32', 'en', true, true, []).controller, undefined);
  view.reset(); assert.equal(view.plan('arduinoEsp32', 'zh-cn', true, true, ['atomizer']).modules.length, 0);
});
test('Uno actual realtime metadata stays enabled while its upload-only blocks and all modules are restricted', () => {
  const view = new ToolboxPresentation();
  view.capture({ deviceId: 'arduinoUno', categoryInfoArray: [{ id: 'arduino_pin', name: 'Pins', blocks: [
    { xml: '<block type="arduino_pin_read"/>', json: { type: 'arduino_pin_read' }, info: { programMode: ['realtime', 'upload'] } },
    { xml: '<block type="arduino_pin_setup"/>', json: { type: 'arduino_pin_setup' }, info: { programMode: ['upload'] } },
  ] }] }, 'en');
  assert.deepEqual(view.plan('arduinoUno', 'en', false, true, []).controller?.groups[0].blocks.map(b => b.disabled), [false, true]);
  assert.equal(view.unsupportedOpcodes('arduinoUno').has('arduino_pin_read'), false);
  assert.equal(view.unsupportedOpcodes('arduinoUno').has('arduino_pin_setup'), true);
  view.capture({ deviceId: 'microbit', categoryInfoArray: [{ id: 'microbit', name: 'micro:bit', blocks: [{ xml: '<block type="microbit_read"/>', json: { type: 'microbit_read' }, info: {} }] }] }, 'en');
  assert.equal(view.plan('microbit', 'en', false, true, []).controller?.groups[0].blocks[0].disabled, false);
});
test('locale refresh without deviceId replaces only the complete current controller description', () => {
  const view = new ToolboxPresentation();
  const category = (id: string, name: string) => ({ id, name, blocks: [{ xml: `<block type="${id}_read"/>`, json: { type: `${id}_read` }, info: {} }] });
  view.capture({ deviceId: 'aijiteEsp32S3', categoryInfoArray: [category('pin', '引脚'), category('serial', '串口')] }, 'zh-cn');
  const refresh = { categoryInfoArray: [category('pin', 'Pins'), category('serial', 'Serial'), category('pen', 'Pen')] };
  view.capture(refresh, 'en', 'arduinoUno');
  assert.equal(view.plan('aijiteESP32S3', 'en', false, true, []).controller, undefined);
  view.capture({ categoryInfoArray: [category('pen', 'Pen')] }, 'en', 'aijiteESP32S3');
  view.capture({ categoryInfoArray: [category('pin', 'Pins')] }, 'en', 'aijiteESP32S3');
  assert.equal(view.plan('aijiteESP32S3', 'en', false, true, []).controller, undefined);
  view.capture(refresh, 'en', 'aijiteESP32S3');
  assert.deepEqual(view.plan('aijiteESP32S3', 'en', false, true, []).controller?.groups.map(group => group.name), ['Pins', 'Serial']);
  assert.equal(view.plan('aijiteESP32S3', 'zh-cn', false, true, []).controller, undefined);
});
test('pure Scratch and independent Arduino stacks coexist; procedure calls and nested/broadcast stage graphs are checked', () => {
  const blocks: any = {
    stage: { opcode: 'event_whenflagclicked', next: 'move' }, move: { opcode: 'motion_movesteps' },
    upload: { opcode: 'event_whenarduinobegin', next: 'uploadCall' }, uploadCall: { opcode: 'procedures_call', mutation: { proccode: 'hardware' } },
    definition: { opcode: 'procedures_definition', inputs: { custom_block: { block: 'prototype' } }, next: 'hardware' },
    prototype: { opcode: 'procedures_prototype', mutation: { proccode: 'hardware' } }, hardware: { opcode: 'atomizer_toggle' },
  };
  const graph = { roots: ['stage', 'upload', 'definition'], blocks };
  assert.equal(unsafeStageOpcode([graph], new Set(['atomizer_toggle'])), null);
  blocks.move.next = 'stageCall'; blocks.stageCall = { opcode: 'procedures_call', mutation: { proccode: 'hardware' } };
  assert.equal(unsafeStageOpcode([graph], new Set(['atomizer_toggle'])), 'atomizer_toggle');
  delete blocks.move.next;
  blocks.receiver = { opcode: 'event_whenbroadcastreceived', inputs: { SUBSTACK: { block: 'hardware' } } };
  graph.roots.push('receiver'); assert.equal(unsafeStageOpcode([graph], new Set(['atomizer_toggle'])), 'atomizer_toggle');
});
