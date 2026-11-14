import assert from 'node:assert/strict';
import test from 'node:test';
import { TerminalModel } from '../src/terminal-model.ts';
import type { TerminalSession } from '../src/terminal-model.ts';
import type { SerialOptions } from '../src/serial.ts';

const encode = (value: string) => new TextEncoder().encode(value);
const rows = (model: TerminalModel) => model.snapshot().logs.textRows.map(row => `${row.direction} ${row.text}`);

class Session implements TerminalSession {
  sessionId: string | null = 'first';
  options: SerialOptions = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' };
  stateSubscriptions = 0;
  byteSubscriptions = 0;
  stateStops = 0;
  byteStops = 0;
  readonly listeners = new Set<() => void>();
  readonly receivers = new Set<(bytes: Uint8Array) => void>();
  subscribe(fn: () => void) {
    this.stateSubscriptions++;
    this.listeners.add(fn);
    return () => { this.stateStops++; this.listeners.delete(fn); };
  }
  onBytes(fn: (bytes: Uint8Array) => void) {
    this.byteSubscriptions++;
    this.receivers.add(fn);
    return () => { this.byteStops++; this.receivers.delete(fn); };
  }
  publish() { for (const fn of this.listeners) fn(); }
  receive(bytes: Uint8Array) { for (const fn of this.receivers) fn(bytes); }
}

test('view subscriptions come and go while hidden RX, drafts and settings survive', () => {
  const session = new Session(), model = new TerminalModel(session);
  let rendered = 0;
  const stopView = model.subscribe(() => { rendered++; });
  model.setInput('draft'); model.setSendMode('hex'); model.setReceiveMode('hex');
  model.setNewline('CRLF'); model.setBaud('9600'); model.setMessage('keep this');
  session.receive(encode('h')); stopView();
  const beforeHidden = rendered;
  session.receive(encode('ello\r')); session.receive(encode('\n'));
  assert.equal(rendered, beforeHidden);
  const stopNextView = model.subscribe(() => { rendered++; });
  assert.deepEqual(rows(model), ['RX hello']);
  const state = model.snapshot();
  assert.equal(state.input, 'draft'); assert.equal(state.sendMode, 'hex'); assert.equal(state.receiveMode, 'hex');
  assert.equal(state.newline, 'CRLF'); assert.equal(state.baud, '9600'); assert.equal(state.message, 'keep this');
  assert.equal(session.stateSubscriptions, 1); assert.equal(session.byteSubscriptions, 1);
  stopNextView(); model.dispose();
});

test('unrelated notifications and equal option objects preserve baud draft and decoder boundaries', () => {
  const session = new Session(), model = new TerminalModel(session), bytes = encode('你');
  model.setBaud('unfinished'); session.receive(bytes.subarray(0, 1));
  session.options = { ...session.options }; session.publish();
  assert.equal(model.snapshot().baud, 'unfinished');
  session.receive(bytes.subarray(1)); session.receive(encode('\r')); session.publish(); session.receive(encode('\nnext'));
  assert.deepEqual(rows(model), ['RX 你', 'RX next']);
  session.options.baudRate = 9600; session.publish();
  assert.equal(model.snapshot().baud, '9600');
  assert.deepEqual(rows(model), ['RX 你', 'RX next']);
  model.dispose();
});

test('actual session changes preserve history but reject delayed TX and reset UTF-8 tails', () => {
  const session = new Session(), model = new TerminalModel(session);
  session.receive(encode('old prompt')); session.receive(Uint8Array.of(0xe4));
  session.sessionId = null; session.publish(); session.sessionId = 'second'; session.publish();
  assert.equal(model.appendSent(encode('late write'), 'first'), false);
  assert.equal(model.appendSent(encode('disconnected write'), null), false);
  session.receive(encode('new prompt'));
  assert.deepEqual(rows(model), ['RX old prompt', 'RX new prompt']);
  assert.deepEqual(model.snapshot().logs.textRows.map(row => row.sessionId), ['first', 'second']);
  assert.equal(model.snapshot().logs.textRows[0].ended, true);
  assert.equal(model.appendSent(encode('sent\n'), 'second'), true);
  assert.deepEqual(rows(model), ['RX old prompt', 'RX new prompt', 'TX sent']);
  model.dispose();
});

test('explicit pause drops RX and clear only clears display without changing pause, draft or session', () => {
  const session = new Session(), model = new TerminalModel(session);
  session.receive(encode('before')); session.receive(Uint8Array.of(0xe4));
  model.setPaused(true); session.receive(encode('discarded'));
  assert.equal(model.appendSent(encode('command\n'), 'first'), true);
  model.setPaused(false); session.receive(Uint8Array.of(0xbd, 0xa0));
  assert.equal(rows(model).join('').includes('你'), false);
  assert.equal(rows(model).join('').includes('discarded'), false);
  model.setInput('keep'); model.setMessage('keep error'); model.setPaused(true); model.clear();
  assert.deepEqual(rows(model), []); assert.equal(session.sessionId, 'first');
  assert.equal(model.snapshot().paused, true); assert.equal(model.snapshot().input, 'keep');
  assert.equal(model.snapshot().message, 'keep error');
  session.receive(encode('still dropped')); assert.deepEqual(rows(model), []);
  model.setPaused(false); session.receive(encode('visible')); assert.deepEqual(rows(model), ['RX visible']);
  model.dispose();
});

test('current protocol ownership blocks capture without changing explicit pause or joining skipped bytes', () => {
  const session = new Session(); let allowed = true;
  const model = new TerminalModel(session, () => allowed);
  session.receive(encode('before')); session.receive(Uint8Array.of(0xe4));
  allowed = false; session.receive(Uint8Array.of(0xbd));
  assert.equal(model.appendSent(encode('protocol write'), 'first'), false);
  assert.equal(model.snapshot().paused, false);
  allowed = true; session.receive(encode('after'));
  assert.deepEqual(rows(model), ['RX before', 'RX after']);
  model.setPaused(true); allowed = false; session.receive(encode('protocol')); allowed = true;
  assert.equal(model.snapshot().paused, true); session.receive(encode('still paused'));
  assert.deepEqual(rows(model), ['RX before', 'RX after']);
  model.dispose();
});

test('capture failures remain visible, reject TX, and do not escape into the serial reader', () => {
  const session = new Session(), model = new TerminalModel(session, () => { throw new Error('guard failed'); });
  assert.doesNotThrow(() => session.receive(encode('private protocol')));
  assert.equal(model.appendSent(encode('not recorded'), 'first'), false);
  assert.deepEqual(rows(model), []); assert.match(model.snapshot().message, /guard failed/);
  model.dispose();
});

test('retained logs keep the existing 200-row and 64KiB bounds and snapshots cannot mutate them', () => {
  const session = new Session(), model = new TerminalModel(session);
  session.receive(encode('x'.repeat(70000)));
  assert.equal(model.snapshot().logs.textRows[0].text.length, 65536);
  assert.equal(model.snapshot().logs.byteChunks[0].bytes.length, 65536);
  const first = model.snapshot(); first.logs.textRows[0].text = 'changed'; first.logs.byteChunks[0].bytes[0] = 0;
  assert.equal(model.snapshot().logs.textRows[0].text.length, 65536);
  assert.equal(model.snapshot().logs.byteChunks[0].bytes[0], 120);
  model.clear();
  for (let i = 0; i < 250; i++) session.receive(encode(`${i}\n`));
  assert.equal(model.snapshot().logs.textRows.length, 200); assert.equal(model.snapshot().logs.byteChunks.length, 200);
  assert.equal(model.snapshot().logs.textRows[0].text, '50');
  model.dispose();
});

test('dispose is idempotent, stops both subscriptions once, and cannot reconnect or log afterwards', () => {
  const session = new Session(), model = new TerminalModel(session);
  let rendered = 0; model.subscribe(() => { rendered++; });
  session.receive(encode('retained')); model.dispose(); model.dispose();
  const before = rendered;
  session.receive(encode('later')); session.sessionId = 'new'; session.publish(); model.setInput('ignored'); model.clear();
  assert.equal(model.appendSent(encode('late TX'), 'first'), false);
  assert.equal(rendered, before); assert.deepEqual(rows(model), ['RX retained']);
  assert.equal(model.snapshot().input, ''); assert.equal(session.stateStops, 1); assert.equal(session.byteStops, 1);
  assert.equal(session.listeners.size, 0); assert.equal(session.receivers.size, 0);
});

test('failed subscription setup cleans up and reports a real construction failure', () => {
  const session = new Session();
  session.onBytes = () => { throw new Error('cannot subscribe'); };
  assert.throws(() => new TerminalModel(session), /cannot subscribe/);
  assert.equal(session.stateStops, 1); assert.equal(session.listeners.size, 0);
});

test('a failing view listener cannot terminate serial reception and exposes the display error', () => {
  const session = new Session(), model = new TerminalModel(session); let otherView = 0;
  model.subscribe(() => { throw new Error('view failed'); });
  model.subscribe(() => { otherView++; });
  assert.doesNotThrow(() => { session.receive(encode('h')); session.receive(encode('ello')); });
  assert.deepEqual(rows(model), ['RX hello']); assert.equal(otherView, 2);
  assert.match(model.snapshot().message, /view failed/);
  model.dispose();
});
