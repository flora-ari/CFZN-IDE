import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionReferences } from '../src/extensions/removal.ts';
import { archiveWithoutController } from '../src/editor-archive.ts';
import { modules, controllerIds, selectableControllerIds } from '../src/extensions/catalog.ts';
import { validateCustomModuleDefinition } from '../src/extensions/custom-module-definition.ts';
import { matchesLibraryKeyword } from '../src/extensions/library-keyword.ts';
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
  assert.equal(controllerIds.length, 5);
  assert.equal(selectableControllerIds.length, 20);
});
test('private definitions accept the complete trusted controller catalog while built-in compatibility stays scoped', () => {
  const definition = { schemaVersion: 1, name: 'Controller scope', description: '', author: '', version: '1', type: 'function',
    supportDevice: selectableControllerIds, definitions: '', setup: '',
    blocks: [{ key: 'nop', message: '操作', shape: 'command', inputs: [], code: 'delay(1);' }] };
  assert.deepEqual(validateCustomModuleDefinition(definition).supportDevice, selectableControllerIds);
  assert.deepEqual(validateCustomModuleDefinition({ ...definition, supportDevice: controllerIds }).supportDevice, controllerIds);
  for (const id of ['', 'null', 'unknown', 'arduino', 'arduinoNanoHidden']) {
    assert.throws(() => validateCustomModuleDefinition({ ...definition, supportDevice: [id] }), /支持主控/);
  }
  assert.throws(() => validateCustomModuleDefinition({ ...definition, supportDevice: ['arduinoNano', 'arduinoNano'] }), /支持主控/);
  assert.ok(modules.every(module => !module.supportDevice.includes('arduinoNano')));
});
test('hardware library searches localized descriptions and registered identifiers within each field', () => {
  const entry = {
    name: 'Demo Board', description: { props: { id: 'demo.description', defaultMessage: 'Default description' } },
    deviceId: 'demoController', tags: ['Embedded Kit'], sku: 'SKU-Ab12',
  };
  const formatMessage = ({ id }: { id: string }) => id === 'demo.description' ? '支持数字输入' : '';
  for (const query of ['BOARD', '数字输入', 'CONTROLLER', 'EMBEDDED', 'sku-aB']) {
    assert.equal(matchesLibraryKeyword(entry, query, formatMessage), true, query);
  }
  for (const query of ['Default description', 'Board支持', 'unregistered']) {
    assert.equal(matchesLibraryKeyword(entry, query, formatMessage), false, query);
  }
  assert.equal(matchesLibraryKeyword({ extensionId: 'moreComments' }, 'MOREcomments', formatMessage), true);
});
