const assert = require('node:assert/strict');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const fs = require('node:fs/promises');
const { createServer, request: proxyRequest } = require('node:http');
const { once } = require('node:events');
const { tmpdir } = require('node:os');
const { basename, join } = require('node:path');
const { test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { createApp } = require('../dist/app.js');
const controllerCatalog = require('../dist/common/controller-catalog.json');

const route = '/api/v1/custom-modules';
const definition = {
  schemaVersion: 1, name: '本地模块', description: '', version: '1.0', author: '',
  type: 'actuator', supportDevice: ['arduinoUno', 'firebeetleEsp32E'],
  blocks: [{
    key: 'write', message: '输出 {{PIN}} 值 {{VALUE}}，然后 {{BODY}}', shape: 'command',
    inputs: [
      { name: 'PIN', type: 'digitalOutputPin' },
      { name: 'VALUE', type: 'dropdown', options: [['打开', 'HIGH'], ['关闭', 'LOW']] },
      { name: 'BODY', type: 'statement' },
    ],
    code: 'digitalWrite({{PIN}}, {{VALUE}});\n{{BODY}}',
  }, {
    key: 'scale', message: '读取 {{X}} × {{MULTIPLIER}}', shape: 'reporter',
    inputs: [
      { name: 'X', type: 'value', defaultValue: '12' },
      { name: 'MULTIPLIER', type: 'number', defaultValue: 3 },
    ],
    code: '({{X}}) * {{MULTIPLIER}}',
  }],
  definitions: '// Declarations', setup: '',
};

Logger.overrideLogger(false);

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'cfzn-custom-modules-'));
  let apiOrigin;
  let app;
  const proxies = [];
  t.after(async () => {
    for (const proxy of proxies) {
      proxy.closeAllConnections();
      await new Promise((resolve) => proxy.close(resolve));
    }
    if (app) await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function editor() {
    const proxy = createServer((req, res) => {
      const upstream = proxyRequest(new URL(req.url, apiOrigin), { method: req.method, headers: req.headers }, (incoming) => {
        res.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(res);
      });
      upstream.on('error', () => res.writeHead(502).end());
      req.pipe(upstream);
    });
    proxies.push(proxy);
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    const origin = `http://127.0.0.1:${proxy.address().port}`;
    return {
      origin,
      send: (path = '', init) => fetch(origin + route + path, init),
    };
  }

  const first = await editor();
  const second = await editor();
  async function start(customModuleIdentity) {
    if (app) await app.close();
    app = await createApp(dataDir, {
      customModuleOrigins: [first.origin, second.origin],
      customModuleIdentity,
    });
    await app.listen(0, '127.0.0.1');
    apiOrigin = await app.getUrl();
  }

  return { dataDir, first, second, start };
}

function browser(editor) {
  return {
    cookie: '',
    async send(path = '', init = {}) {
      const headers = new Headers(init.headers);
      if (this.cookie) headers.set('Cookie', this.cookie);
      const response = await editor.send(path, { ...init, headers });
      const received = response.headers.get('set-cookie');
      if (received) this.cookie = received.split(';', 1)[0];
      return response;
    },
  };
}

function create(origin, definition, headers = {}) {
  return {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ definition }),
  };
}

async function result(response, status) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.status, status);
  if (status === 204) {
    assert.equal(await response.text(), '');
    return;
  }
  return response.json();
}

test('isolates browser libraries and retains immutable versions through hiding and API restart', async (t) => {
  const { dataDir, first, second, start } = await fixture(t);
  await start();
  const alice = browser(first);
  const bob = browser(first);
  const anonymous = await alice.send();
  const issued = anonymous.headers.get('set-cookie');
  assert.match(issued, /^cfzn-module-session-[a-f0-9]{24}=[a-f0-9]{64};/);
  assert.match(issued, /Max-Age=31536000/);
  assert.match(issued, /HttpOnly/);
  assert.match(issued, /SameSite=Strict/);
  assert.match(issued, /Path=\/api\/v1\/custom-modules/);
  assert.doesNotMatch(issued, /Domain=|Secure/);
  assert.deepEqual(await result(anonymous, 200), { items: [] });
  assert.deepEqual(await result(await bob.send(), 200), { items: [] });
  assert.notEqual(alice.cookie, bob.cookie);

  const { item: old } = await result(await alice.send('', create(first.origin, definition)), 201);
  const updated = {
    ...definition, version: '2.0', appearance: { color: '#22aaCC', secondaryColor: '#225588' },
    libraries: [{ name: 'Servo', version: '1.2.2' }],
    blocks: [{ ...definition.blocks[0], shape: 'hat' }, definition.blocks[1]],
  };
  const { item: current } = await result(await alice.send('', create(first.origin, updated)), 201);
  const { item: unrelated } = await result(await bob.send('', create(first.origin, definition)), 201);
  assert.deepEqual(Object.keys(old).sort(), ['createdAt', 'definition', 'id']);
  assert.match(old.id, /^custom[0-9a-f]{32}$/);
  assert.equal(new Date(old.createdAt).toISOString(), old.createdAt);
  assert.equal(new Set([old.id, current.id, unrelated.id]).size, 3);
  assert.deepEqual(old.definition, definition);
  assert.deepEqual(current.definition, updated);
  assert.deepEqual((await result(await alice.send(), 200)).items.map(({ id }) => id).sort(), [old.id, current.id].sort());
  assert.deepEqual(await result(await bob.send(`?ownerId=${old.id}`, { headers: { 'X-Owner-Id': old.id } }), 200),
    { items: [unrelated] });
  const deniedRead = await result(await bob.send(`/${old.id}?ownerId=${old.id}`), 404);
  const deniedHide = await result(await bob.send(`/${old.id}`, { method: 'DELETE', headers: { Origin: first.origin } }), 404);
  assert.deepEqual(deniedRead, deniedHide);

  const [cookieName, token] = alice.cookie.split('=');
  const privateDir = join(dataDir, 'private-modules');
  const scopeDirs = await readdir(privateDir);
  assert.equal(scopeDirs.length, 2);
  for (const directory of scopeDirs) {
    assert.match(directory, /^[a-f0-9]{64}$/);
    assert.notEqual(directory, token);
  }
  const owner = await Promise.all(scopeDirs.map((directory) => readdir(join(privateDir, directory))))
    .then((directories) => scopeDirs[directories.findIndex((entries) => entries.includes(old.id))]);
  const snapshot = join(privateDir, owner, old.id, 'version.json');
  const beforeHide = await readFile(snapshot);
  assert.deepEqual(JSON.parse(beforeHide), old);
  assert.doesNotMatch(beforeHide.toString(), new RegExp(token));

  const hide = () => alice.send(`/${old.id}`, { method: 'DELETE', headers: { Origin: first.origin } });
  await Promise.all([hide(), hide()].map(async (pending) => result(await pending, 204)));
  assert.deepEqual(await readFile(snapshot), beforeHide);
  assert.deepEqual(await result(await alice.send(), 200), { items: [current] });
  assert.deepEqual(await result(await alice.send(`/${old.id}`), 200), { item: old });

  const sameHostOtherPort = await second.send('', { headers: { Cookie: alice.cookie } });
  assert.doesNotMatch(sameHostOtherPort.headers.get('set-cookie'), new RegExp(`^${cookieName}=`));
  assert.deepEqual(await result(sameHostOtherPort, 200), { items: [] });
  await start();
  const afterRestart = await alice.send();
  assert.equal(afterRestart.headers.get('set-cookie'), null);
  assert.deepEqual(await result(afterRestart, 200), { items: [current] });
  assert.deepEqual(await result(await alice.send(`/${old.id}`), 200), { item: old });
});

test('persists all selectable controllers while preserving legacy support and owner isolation after restart', async (t) => {
  const { dataDir, first, start } = await fixture(t);
  await start();
  const owner = browser(first);
  const other = browser(first);
  await result(await owner.send(), 200);
  await result(await other.send(), 200);
  const legacyDefinition = {
    ...definition,
    supportDevice: ['arduinoUno', 'arduinoEsp32S3', 'aijiteESP32S3', 'arduinoEsp32', 'firebeetleEsp32E'],
  };
  const { item: legacy } = await result(await owner.send('', create(first.origin, legacyDefinition)), 201);
  const privateDir = join(dataDir, 'private-modules');
  const scopes = await readdir(privateDir);
  const versions = await Promise.all(scopes.map((scope) => readdir(join(privateDir, scope))));
  const legacyScope = scopes[versions.findIndex((ids) => ids.includes(legacy.id))];
  const legacyPath = join(privateDir, legacyScope, legacy.id, 'version.json');
  const legacyBytes = await readFile(legacyPath);
  assert.deepEqual(legacy.definition, legacyDefinition);

  assert.equal(controllerCatalog.length, 20);
  assert.equal(new Set(controllerCatalog).size, 20);
  assert.ok(controllerCatalog.includes('arduinoNano'));
  assert.ok(controllerCatalog.includes('microbit'));
  const saved = [legacy];
  const simpleDefinition = {
    ...definition,
    blocks: [{ key: 'constant', shape: 'reporter', message: '常量', inputs: [], code: '1' }],
  };
  for (const id of controllerCatalog) {
    const draft = { ...simpleDefinition, supportDevice: [id] };
    const { item } = await result(await owner.send('', create(first.origin, draft)), 201);
    assert.deepEqual(item.definition, draft);
    saved.push(item);
  }
  const mixedDefinition = { ...simpleDefinition, version: '2.0', supportDevice: ['microbit', 'arduinoNano', 'arduinoUno'] };
  const { item: mixed } = await result(await owner.send('', create(first.origin, mixedDefinition)), 201);
  saved.push(mixed);
  assert.notEqual(mixed.id, legacy.id);
  assert.deepEqual(mixed.definition, mixedDefinition);

  await start();
  const { items } = await result(await owner.send(), 200);
  assert.equal(items.length, saved.length);
  assert.equal(new Set(items.map(({ id }) => id)).size, saved.length);
  for (const item of saved) {
    assert.deepEqual(items.find(({ id }) => id === item.id), item);
    assert.deepEqual(await result(await owner.send(`/${item.id}`), 200), { item });
    assert.equal((await result(await other.send(`/${item.id}`), 404)).error.code, 'CUSTOM_MODULE_NOT_FOUND');
  }
  assert.deepEqual(await readFile(legacyPath), legacyBytes);
  assert.deepEqual(await result(await other.send(), 200), { items: [] });
  await result(await other.send(`/${mixed.id}`, { method: 'DELETE', headers: { Origin: first.origin } }), 404);
  assert.deepEqual(await result(await owner.send(`/${mixed.id}`), 200), { item: mixed });
});

test('rejects unknown, hidden, empty and duplicate support controllers without creating versions', async (t) => {
  const { first, start } = await fixture(t);
  await start();
  const owner = browser(first);
  await result(await owner.send(), 200);
  const { item } = await result(await owner.send('', create(first.origin, definition)), 201);
  const invalidLists = [
    undefined, null, 'arduinoNano', [], [''], [null], [1], [{ deviceId: 'arduinoNano' }],
    ['unknown'], ['ArduinoNano'], ['../arduinoNano'], ['null'], ['unselect'],
    ['arduinoUnoUltra'], ['arduinoSE'], ['arduinoEsp8266'],
    ['aijiteEsp32S3'], ['arduinoUno', 'unknown'], ['arduinoNano', 'arduinoNano'],
  ];
  for (const supportDevice of invalidLists) {
    const response = await owner.send('', create(first.origin, { ...definition, supportDevice }));
    const { error } = await result(response, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.details.field, 'definition.supportDevice');
  }
  assert.deepEqual(await result(await owner.send(), 200), { items: [item] });
});

test('requires issued cookies, checks exact Origin and ignores self-reported identity', async (t) => {
  const { first, second, start } = await fixture(t);
  await start();
  const id = 'custom' + '1'.repeat(32);
  for (const request of [
    first.send(`/${id}`),
    first.send('', create(first.origin, definition, { 'X-Owner-Id': id })),
  ]) {
    const denied = await request;
    assert.equal(denied.headers.get('set-cookie'), null);
    assert.equal((await result(denied, 401)).error.code, 'CUSTOM_MODULE_AUTH_REQUIRED');
  }
  const crossSiteBootstrap = await first.send('', { headers: { 'Sec-Fetch-Site': 'same-site' } });
  assert.equal(crossSiteBootstrap.headers.get('set-cookie'), null);
  await result(crossSiteBootstrap, 403);

  const alice = browser(first);
  await result(await alice.send(), 200);
  for (const Origin of [second.origin, 'null', first.origin + '/', first.origin + '.invalid']) {
    await result(await alice.send('', create(first.origin, definition, { Origin })), 403);
  }
  await result(await alice.send(`/${id}`, { method: 'DELETE' }), 403);
  await result(await alice.send('', create(first.origin, definition, { 'Sec-Fetch-Site': 'cross-site' })), 403);
  const unauthorized = await first.send('', {
    headers: { Cookie: alice.cookie.replace(/[0-9a-f]{64}$/, '0'.repeat(64)) },
  });
  assert.match(unauthorized.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  await result(unauthorized, 401);
  await result(await first.send('', { headers: { Cookie: `${alice.cookie}; ${alice.cookie}` } }), 401);
  const spoofed = create(first.origin, definition);
  spoofed.body = JSON.stringify({ definition, ownerId: id });
  await result(await alice.send('', spoofed), 400);
  const nested = create(first.origin, { ...definition, issuer: 'forged' });
  await result(await alice.send('', nested), 400);
  await result(await alice.send('/custom%2F..%2F-projects'), 404);
  assert.deepEqual(await result(await alice.send(), 200), { items: [] });
});

test('fails closed with an injected resolver and separates verified accounts by issuer and tenant', async (t) => {
  const { first, start } = await fixture(t);
  await start();
  const browserSession = browser(first);
  await result(await browserSession.send(), 200);
  const { item: local } = await result(await browserSession.send('', create(first.origin, definition)), 201);

  // The integration fixture simulates identities already verified by a trusted platform.
  const claims = new Map([
    ['verified-alice', { issuer: 'platform', tenant: 'lab1', subject: '../same/user' }],
    ['verified-bob', { issuer: 'platform', tenant: 'lab2', subject: '../same/user' }],
    ['verified-carol', { issuer: 'second-issuer', tenant: 'lab1', subject: '../same/user' }],
  ]);
  const resolver = {
    async resolve(request) {
      const token = request.get('authorization');
      if (token === 'unavailable') throw new Error('private verifier details');
      return claims.get(token) ?? null;
    },
  };
  await start(resolver);
  const denied = await browserSession.send('?subject=../same/user', { headers: { 'X-Subject': '../same/user' } });
  assert.equal(denied.headers.get('set-cookie'), null);
  await result(denied, 401);
  const unavailable = await result(await browserSession.send('', { headers: { Authorization: 'unavailable' } }), 503);
  assert.doesNotMatch(JSON.stringify(unavailable), /private verifier details/);

  const alice = { Authorization: 'verified-alice' };
  assert.deepEqual(await result(await browserSession.send('', { headers: alice }), 200), { items: [] });
  await result(await browserSession.send(`/${local.id}`, { headers: alice }), 404);
  const { item } = await result(await first.send('', create(first.origin, definition, alice)), 201);
  for (const Authorization of ['verified-bob', 'verified-carol']) {
    assert.deepEqual(await result(await first.send('', { headers: { Authorization } }), 200), { items: [] });
    await result(await first.send(`/${item.id}`, { headers: { Authorization } }), 404);
    await result(await first.send(`/${item.id}`, { method: 'DELETE', headers: { Authorization, Origin: first.origin } }), 404);
  }
  await start(resolver);
  assert.deepEqual(await result(await first.send(`/${item.id}`, { headers: alice }), 200), { item });
  await result(await first.send(`/${item.id}`, { method: 'DELETE', headers: { ...alice, Origin: first.origin } }), 204);
  assert.deepEqual(await result(await first.send('', { headers: alice }), 200), { items: [] });
  assert.deepEqual(await result(await first.send(`/${item.id}`, { headers: alice }), 200), { item });
});

test('validates declarative definitions and the 128 KiB JSON request limit', async (t) => {
  const { first, start } = await fixture(t);
  await start();
  const owner = browser(first);
  await result(await owner.send(), 200);
  const [command, reporter] = definition.blocks;
  const types = [
    { schemaVersion: 2 },
    { name: ' ' },
    { setup: undefined },
    { supportDevice: ['other'] },
    { blocks: [command, command] },
    { blocks: [{ ...command, inputs: [...command.inputs, command.inputs[0]] }] },
    { blocks: [{ ...reporter, inputs: [{ name: 'X', type: 'statement' }, reporter.inputs[1]] }] },
    { blocks: [{ ...reporter, message: '{{X}} {{X}}' }] },
    { blocks: [{ ...reporter, code: '{{OTHER}}' }] },
    { blocks: [{ ...reporter, inputs: [reporter.inputs[0], { name: 'MULTIPLIER', type: 'number', defaultValue: '3' }] }] },
    { blocks: [{ ...command, inputs: [command.inputs[0], { ...command.inputs[1], options: [['1', 'HIGH'], ['2', 'HIGH']] }, command.inputs[2]] }] },
    { blocks: [{ ...command, url: 'https://example.com/script.js' }] },
  ];
  for (const change of types) {
    const error = await result(await owner.send('', create(first.origin, { ...definition, ...change })), 400);
    assert.equal(error.error.code, 'VALIDATION_ERROR');
    assert.match(error.error.details.field, /^definition\./);
  }
  await result(await owner.send('', create(first.origin, definition, { 'Content-Type': 'text/plain' })), 415);
  const exact = create(first.origin, definition);
  exact.body += ' '.repeat(128 * 1024 - Buffer.byteLength(exact.body));
  await result(await owner.send('', { ...exact, body: exact.body + ' ' }), 413);
  await result(await owner.send('', { ...exact, body: '{' }), 400);
  assert.deepEqual(await result(await owner.send(), 200), { items: [] });
  await result(await owner.send('', exact), 201);
});

test('persists factory value inputs and pin menus alongside immutable legacy definitions', async (t) => {
  const { first, start } = await fixture(t);
  await start();
  const owner = browser(first);
  await result(await owner.send(), 200);
  const save = async (draft) => (await result(await owner.send('', create(first.origin, draft)), 201)).item;

  const legacyDefaults = [['NUMBER', 'number', 0], ['TEXT', 'text', ''], ['EXPRESSION', 'value', '0']];
  const legacyInputs = legacyDefaults.flatMap(([name, type]) => [
    { name, type, defaultValue: null }, { name: `${name}_OMITTED`, type },
  ]);
  const legacyBlock = {
    key: 'defaults', shape: 'command', inputs: legacyInputs,
    message: legacyInputs.map(({ name }) => `{{${name}}}`).join(' '), code: '',
  };
  const legacy = await save({ ...definition, blocks: [...definition.blocks, legacyBlock] });
  assert.deepEqual(legacy.definition.blocks, [...definition.blocks, {
    ...legacyBlock,
    inputs: legacyDefaults.flatMap(([name, type, defaultValue]) => [
      { name, type, defaultValue }, { name: `${name}_OMITTED`, type, defaultValue },
    ]),
  }]);

  const valueDefaults = [['TEXT', 'textValue', ''], ['NUMBER', 'numberValue', 0], ['FLAG', 'boolean', false]];
  const explicitValues = [
    { name: 'LABEL', type: 'textValue', defaultValue: '中文 "<&>" \\' },
    { name: 'OFFSET', type: 'numberValue', defaultValue: -2.5 },
    { name: 'ENABLED', type: 'boolean', defaultValue: true },
  ];
  const defaultValues = valueDefaults.map(([name, type, defaultValue]) => ({ name, type, defaultValue }));
  const valueInputs = [
    ...defaultValues.map(({ name, type }) => ({ name, type })),
    ...defaultValues.map((input) => ({ ...input, name: `${input.name}_EXPLICIT` })),
    ...explicitValues,
  ];
  const valueBlock = {
    key: 'newblock_1', shape: 'command', inputs: valueInputs,
    message: valueInputs.map(({ name }) => `{{${name}}}`).join(' '), code: '',
  };
  const menuBlock = {
    key: 'pin_menus', shape: 'command', message: '{{OUT}} {{ANALOG}} {{IN}} {{STATE}}', code: '',
    inputs: [
      { name: 'OUT', type: 'digitalOutputPin' },
      { name: 'ANALOG', type: 'analogInputPin' },
      { name: 'IN', type: 'digitalInputPin' },
      { name: 'STATE', type: 'dropdown', options: [['关闭', 'LOW'], ['打开', 'HIGH']] },
    ],
  };
  const revised = { ...legacy.definition, version: '2.0', blocks: [valueBlock, menuBlock] };
  const current = await save(revised);
  assert.notEqual(current.id, legacy.id);
  assert.deepEqual(current.definition, {
    ...revised, blocks: [{ ...valueBlock, inputs: [...defaultValues, ...valueInputs.slice(defaultValues.length)] }, menuBlock],
  });

  await start();
  const { items } = await result(await owner.send(), 200);
  assert.equal(items.length, 2);
  for (const item of [legacy, current]) {
    assert.deepEqual(items.find(({ id }) => id === item.id), item);
    assert.deepEqual(await result(await owner.send(`/${item.id}`), 200), { item });
  }
  const other = browser(first);
  assert.deepEqual(await result(await other.send(), 200), { items: [] });
  assert.equal((await result(await other.send(`/${current.id}`), 404)).error.code, 'CUSTOM_MODULE_NOT_FOUND');
});

test('rejects invalid factory defaults and client-provided pin data without committing a version', async (t) => {
  const { first, start } = await fixture(t);
  await start();
  const owner = browser(first);
  await result(await owner.send(), 200);
  function request(input) {
    const block = { key: 'newblock_1', shape: 'command', message: '{{INPUT}}', code: '', inputs: [{ name: 'INPUT', ...input }] };
    return create(first.origin, { ...definition, blocks: [block] });
  }
  async function reject(request, field) {
    const { error } = await result(await owner.send('', request), 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.details.field, `definition.blocks.0.inputs.0${field ? `.${field}` : ''}`);
  }

  for (const [type, wrongValue] of [['textValue', 1], ['numberValue', '1'], ['boolean', 'false']]) {
    await reject(request({ type, defaultValue: null }), 'defaultValue');
    await reject(request({ type, defaultValue: wrongValue }), 'defaultValue');
  }
  await reject(request({ type: 'boolean', defaultValue: 0 }), 'defaultValue');
  const overflow = request({ type: 'numberValue', defaultValue: 1 });
  overflow.body = overflow.body.replace('"defaultValue":1', '"defaultValue":1e309');
  await reject(overflow, 'defaultValue');

  for (const type of ['digitalOutputPin', 'analogInputPin', 'digitalInputPin']) {
    await reject(request({ type, defaultValue: null }), 'defaultValue');
    await reject(request({ type, options: [['Pin', '1']] }), 'options');
    await reject(request({ type, devicePinKey: 'arduino_pin_setDigitalOutput' }), '');
  }
  assert.deepEqual(await result(await owner.send(), 200), { items: [] });
});

test('keeps failed snapshot commits out of the directory and allows an explicit retry', async (t) => {
  const { dataDir, first, start } = await fixture(t);
  await start();
  const owner = browser(first);
  await result(await owner.send(), 200);
  const { item } = await result(await owner.send('', create(first.origin, definition)), 201);
  const privateDir = join(dataDir, 'private-modules');
  const [scope] = await readdir(privateDir);
  const ownerDir = join(privateDir, scope);
  const rename = fs.rename;
  const failCommit = t.mock.method(fs, 'rename', async (from, to) => {
    if (from.startsWith(ownerDir) && basename(from).startsWith('.stage-')) {
      throw new Error(`Filesystem details: ${from}`);
    }
    return rename(from, to);
  });
  const nextVersion = { ...definition, version: '2.0' };
  const error = await result(await owner.send('', create(first.origin, nextVersion)), 500);
  assert.equal(error.error.code, 'CUSTOM_MODULE_STORAGE_ERROR');
  assert.doesNotMatch(JSON.stringify(error), /Filesystem details|\.stage-/);
  assert.deepEqual(await readdir(ownerDir), [item.id]);
  assert.deepEqual(await result(await owner.send(), 200), { items: [item] });
  assert.deepEqual(await result(await owner.send(`/${item.id}`), 200), { item });
  failCommit.mock.restore();
  await result(await owner.send('', create(first.origin, nextVersion)), 201);
});
