import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { EditorBridge } from '../src/editor-bridge.ts';
import type { EditorBootState } from '../src/editor-bridge.ts';
import { envelope, isEnvelope } from '../src/editor-protocol.ts';

class Events {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, fn: (event: any) => void) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type)!.add(fn); }
  removeEventListener(type: string, fn: (event: any) => void) { this.listeners.get(type)?.delete(fn); }
  emit(type: string, event: any = {}) { for (const fn of [...this.listeners.get(type) ?? []]) fn(event); }
  count(type: string) { return this.listeners.get(type)?.size ?? 0; }
}
class Clock {
  now = 0; id = 0; timers = new Map<number, { at: number; callback: () => void }>();
  set = (callback: () => void, delay: number) => { const id = ++this.id; this.timers.set(id, { at: this.now + delay, callback }); return id; };
  clear = (id: number) => { this.timers.delete(id); };
  advance(milliseconds: number) {
    const end = this.now + milliseconds;
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.now = next[1].at; this.timers.delete(next[0]); next[1].callback();
    }
    this.now = end;
  }
}
function fixture() {
  const events = new Events(), clock = new Clock(), outgoing: any[] = [];
  const fakeWindow = Object.assign(events, { location: { origin: 'http://mock', href: 'http://mock/openblock.html' }, setTimeout: clock.set, clearTimeout: clock.clear });
  const frame = Object.assign(new Events(), { contentWindow: { postMessage: (...args: any[]) => outgoing.push(args) } });
  const boots: EditorBootState[] = [], states: any[] = [], imports: any[] = [];
  const callbacks = { onBootState: (state: EditorBootState) => boots.push(state), onState: (state: any) => states.push(state), onReplace: (state: any) => states.push(state),
    onImport: (file: any) => imports.push(file), onImportError: () => {}, onToolbarAction: () => {} };
  const previous = (globalThis as any).window; (globalThis as any).window = fakeWindow;
  const create = (target = frame) => new EditorBridge(target as any, callbacks);
  const message = (type: string, payload?: any, source: any = frame.contentWindow, origin = 'http://mock') => events.emit('message', { source, origin, data: envelope(type, payload) });
  return { events, clock, outgoing, frame, boots, states, imports, create, message, restore: () => { (globalThis as any).window = previous; } };
}
const snapshot = { title: 'Existing OpenBlock title', dirty: false, running: false, documentId: 1, editVersion: 0 };

test('45 seconds is a slow status; a real late READY clears only startup state and retains normal request timing', async () => {
  const f = fixture(), client = f.create();
  try {
    assert.equal(f.boots.at(-1)?.phase, 'loading'); assert.equal(client.canRetryStartup, false);
    f.clock.advance(44_999); assert.equal(f.boots.length, 1);
    f.clock.advance(1); assert.equal(f.boots.at(-1)?.phase, 'slow'); assert.equal(client.canRetryStartup, false);
    f.clock.advance(30_000); f.message('READY', snapshot);
    assert.deepEqual(f.boots.at(-1), { phase: 'ready', message: '' }); assert.equal(f.states.at(-1), snapshot);
    assert.equal(f.clock.timers.size, 0); assert.equal(client.canRetryStartup, false);
    const count = f.boots.length;
    f.message('BOOT_ERROR', { message: 'late startup error must not overwrite a save notice' });
    f.clock.advance(200_000); assert.equal(f.boots.length, count);
    const request = client.request('GET_STATE', undefined); const rejected = assert.rejects(request, /编辑器操作超时：GET_STATE/);
    f.clock.advance(44_999); assert.equal(f.clock.timers.size, 1);
    f.clock.advance(1); await rejected;
  } finally { client.dispose(); f.restore(); }
});

test('180 seconds exposes explicit retry; disposal removes all old timers/listeners and a fresh frame ignores stale events', () => {
  const f = fixture(), old = f.create();
  let replacement: EditorBridge | undefined;
  try {
    f.clock.advance(180_000); assert.equal(f.boots.at(-1)?.phase, 'error'); assert.match(f.boots.at(-1)!.message, /180 秒/);
    assert.equal(old.canRetryStartup, true); assert.equal(f.clock.timers.size, 0);
    assert.equal(f.outgoing.length, 1, 'timeouts cannot reload a frame automatically');
    old.dispose(); old.dispose(); assert.equal(f.events.count('message'), 0); assert.equal(f.frame.count('load'), 0);
    assert.equal(old.canRetryStartup, false);
    const freshFrame = Object.assign(new Events(), { contentWindow: { postMessage: () => {} } });
    replacement = f.create(freshFrame as any);
    f.message('READY', snapshot); assert.equal(f.states.length, 0);
    f.message('BOOT_ERROR', { message: 'stale frame' }); assert.equal(f.boots.at(-1)?.phase, 'loading');
    f.frame.emit('load'); assert.equal(f.outgoing.length, 1);
    f.message('READY', snapshot, freshFrame.contentWindow); assert.equal(f.boots.at(-1)?.phase, 'ready');
    assert.equal(f.states.length, 1); assert.equal(f.clock.timers.size, 0);
    replacement.dispose(); assert.equal(f.events.count('message'), 0); assert.equal(freshFrame.count('load'), 0);
  } finally { old.dispose(); replacement?.dispose(); f.restore(); }
});

test('actual BOOT_ERROR is immediate, cancels both thresholds, and remains recoverable by a later real READY', async () => {
  const f = fixture(), client = f.create();
  try {
    f.message('CHANGED', snapshot); f.message('REPLACED', snapshot); f.message('IMPORT_REQUEST', { name: 'early.ob' });
    assert.equal(f.states.length, 0); assert.equal(f.imports.length, 0);
    f.message('BOOT_ERROR', { message: 'resource path /openblock-vendor/openblock-gui.js' }, f.frame.contentWindow, 'http://foreign');
    assert.equal(f.boots.at(-1)?.phase, 'loading');
    f.message('BOOT_ERROR', { message: 'resource path /openblock-vendor/openblock-gui.js' });
    assert.equal(f.boots.at(-1)?.phase, 'error'); assert.equal(client.canRetryStartup, true); assert.equal(f.clock.timers.size, 0);
    await assert.rejects(client.request('GET_STATE', undefined), /尚未就绪/);
    f.message('READY', snapshot); assert.equal(f.boots.at(-1)?.phase, 'ready'); assert.equal(client.canRetryStartup, false);
    f.message('CHANGED', { ...snapshot, dirty: true }); assert.equal(f.states.at(-1).dirty, true);
    const pending = client.request('GET_STATE', undefined), rejected = assert.rejects(pending, /已关闭/);
    client.dispose(); await rejected; assert.equal(f.clock.timers.size, 0);
  } finally { client.dispose(); f.restore(); }
});

function observerFixture() {
  const windowEvents = new Events(), documentEvents = new Events(), posts: { data: any; origin: string }[] = [];
  const parent = { postMessage: (data: any, origin: string) => posts.push({ data, origin }) };
  let element: any = null;
  const fakeWindow: any = Object.assign(windowEvents, { parent, location: { origin: 'http://mock', href: 'http://mock/openblock.html' } });
  const fakeDocument = Object.assign(documentEvents, { getElementById: () => element });
  const html = readFileSync(new URL('../openblock.html', import.meta.url), 'utf8');
  const script = html.match(/<script id="editor-startup-observer">([\s\S]*?)<\/script>/)![1];
  assert.ok(html.indexOf(script) < html.indexOf('/openblock-vendor/react-16.min.js'));
  runInNewContext(script, { window: fakeWindow, document: fakeDocument, URL, Error });
  return { fakeWindow, windowEvents, documentEvents, parent, posts, insertMessage: () => { element = { hidden: true, textContent: '' }; documentEvents.emit('DOMContentLoaded'); return element; } };
}

test('the real early observer catches critical script failure before the module exists and replays it only to the same-origin parent', () => {
  const f = observerFixture();
  f.windowEvents.emit('error', { target: { tagName: 'IMG', src: 'http://mock/irrelevant.png' } });
  f.windowEvents.emit('error', { target: { tagName: 'SCRIPT', src: 'http://foreign/extension.js' } });
  assert.equal(f.posts.length, 0);
  f.windowEvents.emit('error', { target: { tagName: 'SCRIPT', src: 'http://mock/openblock-vendor/openblock-gui.js?secret=not-in-message' } });
  assert.equal(f.posts.length, 1); assert.ok(isEnvelope(f.posts[0].data)); assert.equal(f.posts[0].data.type, 'BOOT_ERROR');
  const failureMessage = (f.posts[0].data.payload as { message: string }).message;
  assert.equal(f.posts[0].origin, 'http://mock'); assert.match(failureMessage, /资源加载失败.*\/openblock-vendor\/openblock-gui.js/);
  assert.doesNotMatch(failureMessage, /secret|not-in-message/);
  assert.equal(f.windowEvents.count('error'), 0); assert.equal(f.windowEvents.count('unhandledrejection'), 0);
  const element = f.insertMessage(); assert.equal(element.hidden, false); assert.equal(element.textContent, failureMessage);
  f.windowEvents.emit('message', { source: f.parent, origin: 'http://foreign', data: envelope('HELLO') }); assert.equal(f.posts.length, 1);
  f.windowEvents.emit('message', { source: f.parent, origin: 'http://mock', data: envelope('HELLO') }); assert.equal(f.posts.length, 2);
  f.fakeWindow.CFZNEditorStartup.ready();
  for (const type of ['error', 'unhandledrejection', 'message', 'pagehide']) assert.equal(f.windowEvents.count(type), 0);
  assert.equal(f.documentEvents.count('DOMContentLoaded'), 0);
});

test('the early observer reports script evaluation and initialization failures but stops before runtime editing', () => {
  for (const fail of [
    (f: ReturnType<typeof observerFixture>) => f.windowEvents.emit('error', { target: f.fakeWindow, filename: 'http://mock/assets/editor.js', message: 'mock evaluation failure' }),
    (f: ReturnType<typeof observerFixture>) => f.windowEvents.emit('unhandledrejection', { reason: new Error('mock initialization failure') }),
    (f: ReturnType<typeof observerFixture>) => f.fakeWindow.CFZNEditorStartup.fail('默认项目准备失败：mock'),
  ]) {
    const f = observerFixture(); fail(f);
    assert.equal(f.posts.length, 1); assert.match(f.posts[0].data.payload.message, /失败|failure/);
    f.fakeWindow.CFZNEditorStartup.fail('secondary failure'); assert.equal(f.posts.length, 1);
    f.fakeWindow.CFZNEditorStartup.ready();
    f.windowEvents.emit('unhandledrejection', { reason: new Error('runtime save failure') });
    f.fakeWindow.CFZNEditorStartup.fail('runtime error'); assert.equal(f.posts.length, 1);
  }
});
