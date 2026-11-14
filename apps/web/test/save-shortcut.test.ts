import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSaveKey } from '../src/save-shortcut.ts';
const key = { key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false };
test('save recognises Ctrl+S and Mac Cmd+S without taking modified editing shortcuts', () => {
  assert.equal(matchesSaveKey(key, 'Win32'), true);
  assert.equal(matchesSaveKey({ ...key, key: 'S' }, 'Linux'), true);
  assert.equal(matchesSaveKey({ ...key, ctrlKey: false, metaKey: true }, 'MacIntel'), true);
  assert.equal(matchesSaveKey({ ...key, ctrlKey: false, metaKey: true }, 'Win32'), false);
  for (const patch of [{ altKey: true }, { shiftKey: true }, { isComposing: true }, { ctrlKey: false }, { key: 'f' }, { key: 'z' }, { key: 'y' }]) {
    assert.equal(matchesSaveKey({ ...key, ...patch }, 'Win32'), false);
  }
});
