import assert from 'node:assert/strict';
import test from 'node:test';
import { SerialLog } from '../src/serial-log.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const text = (log: SerialLog) => log.snapshot().textRows.map(row => `${row.direction} ${row.text}`);
function connected(maxRows = 300, maxBytes = 65536) {
  const log = new SerialLog(maxRows, maxBytes); log.setSession('first'); return log;
}

test('h + ello + split CRLF is one hello row, and unfinished prompts appear immediately', () => {
  const log = connected();
  log.append('RX', encode('h')); assert.deepEqual(text(log), ['RX h']);
  log.append('RX', encode('ello\r')); assert.deepEqual(text(log), ['RX hello']);
  log.append('RX', encode('\n')); assert.deepEqual(text(log), ['RX hello']);
  assert.equal(log.snapshot().textRows[0].ended, true);
  log.append('RX', encode('pro')); log.append('RX', encode('mpt> '));
  assert.deepEqual(text(log), ['RX hello', 'RX prompt> ']);
  assert.equal(log.snapshot().textRows[1].ended, false);
});

test('LF, CRLF and CR define real rows, including blank lines and multiple lines per chunk', () => {
  const log = connected();
  log.append('RX', encode('a\nb\r\nc\rd\r')); log.append('RX', encode('\n\ne\nlast'));
  assert.deepEqual(text(log), ['RX a', 'RX b', 'RX c', 'RX d', 'RX ', 'RX e', 'RX last']);
  const bytes = log.snapshot().byteChunks.flatMap(chunk => chunk.bytes);
  assert.deepEqual(bytes, [...encode('a\nb\r\nc\rd\r\n\ne\nlast')]);
});

test('Chinese and emoji split at every UTF-8 byte decode without replacement or chunk rows', () => {
  const log = connected(), bytes = encode('中文🙂：ready');
  for (const byte of bytes) log.append('RX', Uint8Array.of(byte));
  assert.deepEqual(text(log), ['RX 中文🙂：ready']);
  assert.deepEqual(log.snapshot().byteChunks.flatMap(chunk => chunk.bytes), [...bytes]);
});

test('RX and TX stay chronological and use independent UTF-8 and line state', () => {
  const log = connected(), chinese = encode('你');
  log.append('RX', Uint8Array.of(chinese[0]));
  log.append('TX', encode('command> '));
  log.append('RX', chinese.subarray(1));
  log.append('TX', encode('next\n'));
  log.append('RX', encode('hello'));
  assert.deepEqual(text(log), ['TX command> ', 'RX 你', 'TX next', 'RX hello']);
  log.append('RX', encode('\r')); log.append('TX', encode('other')); log.append('RX', encode('\n'));
  assert.deepEqual(text(log), ['TX command> ', 'RX 你', 'TX next', 'RX hello', 'TX other']);
});

test('clear discards decoder tails and CRLF carry while retaining the active connection', () => {
  const log = connected(); log.append('RX', encode('old\r')); log.clear();
  log.append('RX', encode('\nnew')); assert.deepEqual(text(log), ['RX ', 'RX new']);
  log.append('RX', Uint8Array.of(0xe4)); log.clear();
  log.append('RX', Uint8Array.of(0xbd, 0xa0));
  assert.notEqual(log.snapshot().textRows[0].text, '你');
  assert.deepEqual(log.snapshot().byteChunks.flatMap(chunk => chunk.bytes), [0xbd, 0xa0]);
});

test('new sessions do not append to old prompts, decode old tails, or accept delayed TX/RX', () => {
  const log = connected(); log.append('RX', encode('old prompt'));
  log.append('RX', Uint8Array.of(0xe4));
  log.setSession(null); log.setSession('second');
  log.append('RX', encode('late old'), 'first'); log.append('TX', encode('late write'), 'first');
  log.append('RX', encode('new prompt'));
  assert.deepEqual(text(log), ['RX old prompt', 'RX new prompt']);
  assert.deepEqual(log.snapshot().textRows.map(row => row.sessionId), ['first', 'second']);
  assert.equal(log.snapshot().byteChunks.some(chunk => new TextDecoder().decode(new Uint8Array(chunk.bytes)).includes('late')), false);
});

test('pause continues dropping RX; resuming cannot join lines or UTF-8 across dropped bytes', () => {
  const log = connected(); log.append('RX', encode('before')); log.append('RX', Uint8Array.of(0xe4));
  log.setPaused(true); log.append('RX', encode('not recorded')); log.append('TX', encode('command\n'));
  log.setPaused(false); log.append('RX', Uint8Array.of(0xbd, 0xa0)); log.append('RX', encode('after'));
  assert.equal(log.snapshot().textRows[0].text, 'before');
  assert.equal(log.snapshot().textRows[1].direction, 'TX');
  assert.ok(log.snapshot().textRows[2].text.endsWith('after'));
  assert.equal(log.snapshot().textRows[2].text.includes('你'), false);
  assert.equal(log.snapshot().byteChunks.some(chunk => new TextDecoder().decode(new Uint8Array(chunk.bytes)).includes('not recorded')), false);
  log.clear(); log.setPaused(true); log.append('RX', encode('dropped')); assert.deepEqual(text(log), []);
});

test('HEX keeps raw bytes and bounded logs also bound an unterminated text stream', () => {
  const log = connected(3, 8);
  log.append('RX', Uint8Array.of(0, 0xff, 0x0d, 0x0a, 0x41));
  assert.deepEqual(log.snapshot().byteChunks[0].bytes, [0, 255, 13, 10, 65]);
  log.clear(); log.append('RX', encode('0123456789')); log.append('RX', encode('abc'));
  assert.deepEqual(text(log), ['RX 56789abc']);
  assert.deepEqual(log.snapshot().byteChunks.flatMap(chunk => chunk.bytes), [...encode('56789abc')]);
  log.clear(); log.append('RX', encode('1\n2\n3\n4\n5'));
  assert.deepEqual(text(log), ['RX 3', 'RX 4', 'RX 5']);
  for (let i = 0; i < 10; i++) log.append('TX', Uint8Array.of(i));
  assert.ok(log.snapshot().textRows.length <= 3); assert.ok(log.snapshot().byteChunks.length <= 3);
});
