import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionReferences } from '../src/extensions/removal.ts';
import { archiveWithoutController } from '../src/editor-archive.ts';
import { modules, controllerTypes } from '../src/extensions/catalog.ts';
import { strFromU8, strToU8, zipSync, unzipSync } from 'fflate';

const blocks = (rows: Record<string, any>) => ({ getAllIds: () => Object.keys(rows), getBlock: (id: string) => rows[id] });
test('removal references include other original targets, detached/disabled/shadow blocks and active or hidden monitors, excluding clones and inactive caches', () => {
  const runtime = { targets: [
    { isOriginal: true, getName: () => 'Stage', blocks: blocks({ detached: { opcode: 'owned', disabled: true }, menu: { opcode: 'owned_menu', shadow: true } }) },
    { isOriginal: true, getName: () => 'Other sprite', blocks: blocks({ procedure: { opcode: 'owned' } }) },
    { isOriginal: false, getName: () => 'clone', blocks: blocks({ cloned: { opcode: 'owned' } }) },
  ], getMonitorState: () => new Map([['hidden', new Map<string, any>([['id', 'hidden'], ['opcode', 'owned'], ['visible', false]])]]),
  monitorBlocks: blocks({ active: { opcode: 'core', isMonitored: true, inputs: { VALUE: { shadow: 'menu' } } }, menu: { opcode: 'owned_menu' }, inactive: { opcode: 'owned', isMonitored: false } }) };
  assert.deepEqual(extensionReferences(runtime, new Set(['owned', 'owned_menu'])), [
    { targetName: 'Stage', count: 2 }, { targetName: 'Other sprite', count: 1 }, { targetName: '监视器', count: 2 },
  ]);
});
test('controller removal candidate changes only device and preserves complete entries and document metadata', () => {
  const project = { device: { deviceId: 'arduinoUno', type: 'arduino' }, deviceExtensions: [], programMode: 'upload', extensions: ['pen'],
    targets: [{ blocks: { hat: { opcode: 'event_whenflagclicked' } }, variables: { x: ['x', 4] }, lists: { list: ['list', [1, 2]] } }], monitors: [{ id: 'x', visible: false }] };
  const source = { 'project.json': strToU8(JSON.stringify(project)), 'cfzn/editor.json': strToU8(JSON.stringify({ version: 1, codeMode: 'manual', manualSource: '// retain\n' })), 'asset.wav': new Uint8Array([0, 1, 2, 255]) };
  const output = unzipSync(new Uint8Array(archiveWithoutController(zipSync(source).buffer as ArrayBuffer)));
  assert.deepEqual(JSON.parse(strFromU8(output['project.json']!)), { ...project, device: { deviceId: null, type: null, pnpIdList: [] } });
  for (const name of ['cfzn/editor.json', 'asset.wav']) assert.deepEqual(output[name], source[name as keyof typeof source]);
  assert.throws(() => archiveWithoutController(zipSync({ 'project.json': strToU8(JSON.stringify({ ...project, deviceExtensions: ['atomizer'] })) }).buffer as ArrayBuffer), /先移除/);
});
test('library types are explicit actual catalog entries', () => {
  assert.deepEqual(modules.map(module => module.type), ['actuator', 'actuator', 'sensor', 'sensor', 'sensor', 'function']);
  assert.equal(Object.keys(controllerTypes).length, 5); assert.ok(Object.values(controllerTypes).every(type => type === 'board'));
});
