import test from 'node:test';
import assert from 'node:assert/strict';
import { isProjectToolbarAction, isProjectToolbarState, projectToolbarState } from '../src/editor-protocol.ts';
const clean = { title: 'project', editVersion: 3, documentId: 1, dirty: false, running: false };

test('toolbar status gives busy/readiness/dirty priority over a confirmed revision', () => {
  assert.equal(projectToolbarState(null, null, '', null).statusKind, 'pending');
  assert.equal(projectToolbarState(clean, null, '', null).statusText, '未保存项目');
  assert.equal(projectToolbarState(clean, 7, '', null).statusText, '已保存 · v7');
  const newerEdit = projectToolbarState({ ...clean, dirty: true }, 7, '', 'projects');
  assert.equal(newerEdit.statusText, '未保存的更改');
  assert.equal(newerEdit.drawer, 'projects');
  assert.equal(newerEdit.documentActionsDisabled, false);
  assert.deepEqual(projectToolbarState({ ...clean, dirty: true }, 7, '正在保存…', null), {
    statusText: '正在保存…', statusKind: 'pending', drawer: null, documentActionsDisabled: true,
  });
});

test('new bridge messages accept only the frozen view/action shapes', () => {
  assert.ok(isProjectToolbarState(projectToolbarState(clean, 2, '', 'projects')));
  assert.equal(isProjectToolbarState({ statusText: 'saved', statusKind: 'saved', drawer: null }), false);
  assert.equal(isProjectToolbarState({ statusText: 'saved', statusKind: 'error', documentActionsDisabled: false, drawer: null }), false);
  assert.equal(isProjectToolbarState({ statusText: 'saved', statusKind: 'saved', documentActionsDisabled: false, drawer: 'extension' }), false);
  assert.equal(isProjectToolbarState({ statusText: 'saved', statusKind: 'saved', documentActionsDisabled: false, drawer: 'serial' }), false);
  for (const action of ['projects', 'new', 'export', 'save']) assert.ok(isProjectToolbarAction({ action }));
  assert.equal(isProjectToolbarAction({ action: 'serial' }), false);
  assert.equal(isProjectToolbarAction({ action: 'import' }), false);
  assert.equal(isProjectToolbarAction({ action: 'save', revision: 9 }), false);
  assert.equal(isProjectToolbarAction(null), false);
});
