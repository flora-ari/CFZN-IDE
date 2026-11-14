import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPaletteEntries, normalizeSearchText, changesPaletteTemplates } from '../src/palette-index.ts';
test('search matches localized real labels, Unicode width and whitespace but never opcode/category metadata', () => {
  const entries = [{ text: '将 我的变量 设为 0', category: 'data', xml: null as any }, { text: 'move  10 steps', category: 'motion', xml: null as any }];
  assert.equal(normalizeSearchText('  ＭＯＶＥ\n 10 '), 'move 10');
  assert.deepEqual(matchPaletteEntries(entries, '我的变量'), [entries[0]]);
  assert.deepEqual(matchPaletteEntries(entries, 'MOVE 10'), [entries[1]]);
  assert.deepEqual(matchPaletteEntries(entries, 'motion'), []);
  assert.deepEqual(matchPaletteEntries(entries, '  '), []);
  assert.deepEqual(matchPaletteEntries(entries, '不存在的积木'), []);
});
test('native toolbox completion and other UI events do not recursively invalidate an index', () => {
  for (const type of ['toolBoxFinish', 'ui', 'viewport_change', 'toolbox_item_select']) assert.equal(changesPaletteTemplates(type), false);
  for (const type of ['create', 'delete', 'change', 'move', 'var_create', 'var_delete', 'var_rename']) assert.equal(changesPaletteTemplates(type), true);
});
