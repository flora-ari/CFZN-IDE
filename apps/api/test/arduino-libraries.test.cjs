const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { createApp } = require('../dist/app.js');

Logger.overrideLogger(false);

test('Arduino search groups exact versions from the fixed index and shares concurrent cache fills', async (t) => {
  const data = await mkdtemp(join(tmpdir(), 'cfzn-arduino-search-'));
  const row = {
    name: 'Fixture Servo', version: '1.2.2', author: 'Fixture Author', sentence: 'Moves a motor',
    architectures: ['avr'], url: 'https://downloads.arduino.cc/libraries/github.com/f/FixtureServo.zip',
    checksum: `SHA-256:${'a'.repeat(64)}`, size: 100,
  };
  let calls = 0;
  const app = await createApp(data, { arduinoLibraryFetch: async (url, options) => {
    assert.equal(url, 'https://downloads.arduino.cc/libraries/library_index.json');
    assert.equal(options.redirect, 'error');
    calls++;
    return Response.json({ libraries: [row,
      { ...row, version: '1.3.0-beta.1', architectures: ['samd'] }, { ...row, version: '1.3.0', architectures: ['avr', 'samd'] },
      { ...row, name: 'Unsafe origin', url: 'https://example.test/library.zip' },
      { ...row, name: 'Conflicting' }, { ...row, name: 'Conflicting', checksum: `SHA-256:${'b'.repeat(64)}` },
    ] });
  } });
  t.after(async () => { await app.close(); await rm(data, { recursive: true, force: true }); });
  await app.listen(0, '127.0.0.1');
  const route = `${await app.getUrl()}/api/v1/arduino/libraries/search`;
  const request = async (q) => {
    const response = await fetch(`${route}?q=${encodeURIComponent(q)}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  const expected = { items: [{ name: row.name, author: row.author, description: row.sentence, versions: [
    { version: '1.3.0', architectures: ['avr', 'samd'] },
    { version: '1.3.0-beta.1', architectures: ['samd'] },
    { version: '1.2.2', architectures: ['avr'] },
  ] }] };
  assert.deepEqual(await Promise.all([request('fixture servo'), request('AUTHOR'), request('moves')]), [expected, expected, expected]);
  for (const q of ['', 'Unsafe', 'Conflicting']) assert.deepEqual(await request(q), { items: [] });
  assert.equal((await fetch(`${route}?q=first&q=second`)).status, 400);
  assert.equal(calls, 1);
});
