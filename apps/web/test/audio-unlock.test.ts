import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
// @ts-expect-error The preparation helper is shared plain Node ESM.
import { patchAudioUnlock } from '../scripts/audio-unlock-hook.mjs';

const archive = fileURLToPath(new URL('../../../.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz', import.meta.url));
const original = execFileSync('tar', ['-xOf', archive, 'package/dist/openblock-gui.js'], { maxBuffer: 100 * 1024 * 1024 }).toString();
const patched = patchAudioUnlock(original);
const header = '/* 520 */\n/***/ (function(module, exports, __webpack_require__) {';
const boundary = '\n/***/ }),\n/* 521 */';
const moduleBody = (text: string) => text.slice(text.indexOf(header) + header.length, text.indexOf(boundary, text.indexOf(header)));
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

class Events {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: any = {}) { for (const listener of [...this.listeners.get(type) ?? []]) listener({ type, ...event }); }
  get count() { return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0); }
}
class Element extends Events {}
class Context extends Events {
  state = 'suspended'; sampleRate = 48000; destination = {};
  resumes = 0; starts = 0; connected = 0;
  mode: 'pending' | 'reject' | 'throw' = 'pending';
  pending: Array<() => void> = [];
  createBuffer() { return {}; }
  createBufferSource() {
    const context = this;
    let connected = false;
    return { buffer: undefined, onended: undefined,
      connect() { if (!connected) { connected = true; context.connected++; } },
      disconnect() { if (connected) { connected = false; context.connected--; } },
      start() { context.starts++; } };
  }
  resume() {
    this.resumes++;
    if (this.mode === 'throw') throw new Error('synchronous resume failure');
    if (this.mode === 'reject') return Promise.reject(new Error('resume denied'));
    return new Promise<void>(resolve => this.pending.push(resolve));
  }
  change(state: string) { this.state = state; this.emit('statechange'); }
  settle() { for (const resolve of this.pending.splice(0)) resolve(); }
}
function fixture(text = patched, activationSupport = true) {
  const body = new Element(), selected = new Element(), window = new Events();
  const activation = { isActive: false }, frames: Array<() => void> = [];
  const document = { body, querySelectorAll: (selector: string) => selector === '#selected' ? [selected] : [] };
  const module: { exports: any } = { exports: {} };
  runInNewContext(moduleBody(text), { module, exports: {}, window, document, Element, NodeList: class {}, Promise,
    navigator: activationSupport ? { userActivation: activation } : {}, requestAnimationFrame: (fn: () => void) => frames.push(fn),
    setTimeout: () => { throw new Error('Audio unlock must not schedule retries.'); } });
  const gesture = (target: Events = body, type = 'click', extra: any = {}) => {
    activation.isActive = true;
    target.emit(type, { isTrusted: true, button: 0, key: 'Enter', ...extra });
    activation.isActive = false;
  };
  return { start: module.exports as (context: Context, elements?: any, callback?: () => void) => Promise<void>,
    body, selected, window, activation, frames, gesture };
}

test('the actual dependency reproduces 121 background resumes in 120 frames; patched initialization schedules none', async () => {
  const before = fixture(original), context = new Context();
  const oldPromise = before.start(context);
  for (let frame = 0; frame < 120; frame++) before.frames.shift()!();
  assert.equal(context.resumes, 121);
  context.state = 'running'; before.frames.shift()!(); await oldPromise; await flush();
  assert.equal(before.body.count, 0);
  const after = fixture(), waiting = new Context();
  after.start(waiting);
  assert.equal(waiting.resumes, 0); assert.equal(waiting.starts, 0); assert.equal(after.frames.length, 0);
  after.window.emit('pagehide'); assert.equal(waiting.count + after.body.count + after.window.count, 0);
});

test('only trusted active gestures resume synchronously; synthetic, inactive and ineffective input cannot unlock', async () => {
  const f = fixture(), context = new Context(); f.start(context);
  f.body.emit('click', { isTrusted: false, button: 0 });
  f.activation.isActive = true; f.body.emit('keydown', { isTrusted: false, key: 'Enter' }); f.activation.isActive = false;
  f.body.emit('click', { isTrusted: true, button: 0 });
  f.gesture(f.body, 'mousedown', { button: 2 });
  f.gesture(f.body, 'keydown', { key: 'Escape' });
  f.gesture(f.body, 'keydown', { key: 'Control' });
  f.gesture(f.body, 'keydown', { ctrlKey: true });
  f.gesture(f.body, 'keydown', { repeat: true });
  assert.equal(context.resumes, 0); assert.equal(context.starts, 0);
  f.gesture(f.body, 'keydown', { key: ' ' });
  assert.equal(context.resumes, 1); assert.equal(context.starts, 1);
  context.change('running'); context.settle(); await flush();
});

test('same-context registrations merge targets and pending resumes; each callback completes once on running', async () => {
  const f = fixture(), context = new Context(); let callbacks = 0, complete = false;
  const first = f.start(context, undefined, () => callbacks++);
  const count = f.body.count;
  const second = f.start(context, [f.body, '#selected', { jquery: true, toArray: () => [f.selected] }], () => callbacks++);
  first.then(() => { complete = true; });
  assert.equal(first, second); assert.equal(f.body.count, count); assert.equal(f.selected.count, count);
  assert.equal(context.count, 1); assert.equal(f.window.count, 1);
  f.gesture(f.body, 'mousedown'); f.gesture(f.selected, 'click'); f.gesture(f.body, 'keydown');
  assert.equal(context.resumes, 1);
  context.settle(); await flush(); assert.equal(complete, false); assert.equal(callbacks, 0);
  context.change('running'); await first; await flush();
  context.emit('statechange'); f.gesture();
  assert.equal(callbacks, 2); assert.equal(complete, true); assert.equal(context.resumes, 1);
  assert.equal(context.count + f.body.count + f.selected.count + f.window.count, 0); assert.equal(context.connected, 0);
});

test('resume rejection and synchronous failure allow a later gesture without background retries', async () => {
  const f = fixture(), context = new Context(); let callbacks = 0;
  const done = f.start(context, undefined, () => callbacks++);
  context.mode = 'reject'; f.gesture(); await flush();
  assert.equal(context.resumes, 1); assert.equal(context.connected, 0); assert.equal(callbacks, 0);
  context.emit('statechange'); await flush(); assert.equal(context.resumes, 1);
  context.mode = 'throw'; f.gesture(); await flush(); assert.equal(context.resumes, 2);
  context.mode = 'pending'; f.gesture(); assert.equal(context.resumes, 3);
  context.change('running'); context.settle(); await done; await flush();
  assert.equal(callbacks, 1); assert.equal(f.frames.length, 0);
});

test('touch drag is ignored and trusted mouse/touch activation still works without the optional activation API', async () => {
  const f = fixture(patched, false), touch = new Context(); const done = f.start(touch);
  f.gesture(f.body, 'touchstart'); f.gesture(f.body, 'touchmove'); f.gesture(f.body, 'touchend');
  assert.equal(touch.resumes, 0);
  f.gesture(f.body, 'touchstart'); f.gesture(f.body, 'touchend'); assert.equal(touch.resumes, 1);
  touch.change('running'); touch.settle(); await done;
  const mouse = new Context(); f.start(mouse); f.gesture(f.body, 'mousedown'); assert.equal(mouse.resumes, 1);
  mouse.change('closed'); mouse.settle(); await flush();
});

test('close, initially-closed contexts and unload clean pending listeners without false completion or rejection', async () => {
  const f = fixture(), context = new Context(); let completed = 0;
  f.start(context, undefined, () => completed++);
  f.gesture(); context.change('closed'); context.settle(); await flush(); f.gesture();
  assert.equal(context.resumes, 1); assert.equal(completed, 0);
  assert.equal(context.count + f.body.count + f.window.count, 0); assert.equal(context.connected, 0);
  const closed = new Context(); closed.state = 'closed'; f.start(closed, undefined, () => completed++);
  assert.equal(closed.resumes + closed.count + f.body.count + f.window.count, 0);
  const waiting = new Context(); f.start(waiting, undefined, () => completed++); f.gesture();
  f.window.emit('pagehide'); waiting.settle(); await flush(); f.gesture();
  assert.equal(waiting.resumes, 1); assert.equal(waiting.connected, 0);
  assert.equal(waiting.count + f.body.count + f.window.count, 0); assert.equal(completed, 0);
  const late = new Context(); f.start(late); f.gesture(); assert.equal(late.resumes + late.count + f.body.count, 0);
});

test('separate contexts retain independent completion, and a new registration can unlock a later suspension', async () => {
  const f = fixture(), first = new Context(), second = new Context();
  const firstDone = f.start(first), secondDone = f.start(second);
  f.gesture(); assert.equal(first.resumes, 1); assert.equal(second.resumes, 1);
  first.change('running'); first.settle(); await firstDone;
  assert.equal(first.count, 0); assert.equal(second.count, 1); assert.ok(f.body.count > 0);
  second.change('running'); second.settle(); await secondDone; assert.equal(f.body.count + f.window.count, 0);
  first.change('suspended'); const again = f.start(first); assert.equal(first.resumes, 1);
  f.gesture(); assert.equal(first.resumes, 2); assert.equal(second.resumes, 1);
  first.change('running'); first.settle(); await again;
  const running = new Context(); running.state = 'running'; let callback = 0;
  await f.start(running, undefined, () => callback++); await flush();
  assert.equal(callback, 1); assert.equal(running.resumes + running.count + f.body.count + f.window.count, 0);
});

test('the audited hook changes only module 520, preserves its license, and rejects moved/changed/duplicate input', () => {
  const start = original.indexOf(header), end = original.indexOf(boundary, start);
  assert.equal(hash(patched.slice(0, patched.indexOf(header))), hash(original.slice(0, start)));
  assert.equal(hash(patched.slice(patched.indexOf(boundary, start))), hash(original.slice(end)));
  const notice = moduleBody(original).match(/\/\*\*[\s\S]*?\*\//)![0];
  assert.ok(moduleBody(patched).includes(notice));
  assert.throws(() => patchAudioUnlock(original.replace('/* 520 */', '/* 9999 */')), /exactly once/);
  assert.throws(() => patchAudioUnlock(original + header), /exactly once/);
  assert.throws(() => patchAudioUnlock(original.replace('function checkLoop(){', 'function changedLoop(){')), /hash mismatch/);
});
