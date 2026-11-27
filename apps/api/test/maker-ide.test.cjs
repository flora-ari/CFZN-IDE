const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
const { buffer } = require('node:stream/consumers');
const { test } = require('node:test');
const { Logger } = require('@nestjs/common');
const { ZipFile } = require('yazl');
const { createApp } = require('../dist/app.js');
const { ApiError } = require('../dist/common/api-error.js');
const { MakerAccounts } = require('../dist/ide/maker.js');
const { MinioProjectObjects } = require('../dist/ide/objects.js');

const MIME = 'application/x.openblock.ob';
const AUTH = '/ide/auth/';
const USERS = { one: { id: 11, username: 'one', restriction: null }, two: { id: 22, username: 'two', restriction: null } };
Logger.overrideLogger(false);

async function archive(marker, length) {
  const zip = new ZipFile();
  const options = { compress: false, mtime: new Date(2025, 0, 1) };
  zip.addBuffer(Buffer.from(JSON.stringify({ targets: [], marker })), 'project.json', options);
  if (length !== undefined) zip.addBuffer(Buffer.alloc(length), 'fixture.bin', options);
  zip.end();
  return buffer(zip.outputStream);
}

async function fixture(t, limits = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'cfzn-maker-test-'));
  const store = new Map();
  const issuedAccess = new Map([['portal-one', 'one']]);
  const issuedRefresh = new Map();
  let counter = 0;
  let failedUpload = false;
  let failedRemove = false;
  let app;
  let base;
  const banned = new Set();
  const user = (account) => ({ ...USERS[account], restriction: banned.has(account) ? { active: true } : null });
  function credentials(account) {
    const access = 'access-' + ++counter;
    const refresh = 'refresh-' + counter;
    issuedAccess.set(access, account);
    issuedRefresh.set(refresh, account);
    return { access, refresh };
  }
  const options = {
    config: {
      stateDir: join(dataDir, 'authenticated'), publicOrigin: 'https://ide.example',
      portalOrigin: 'https://maker.example', makerBaseUrl: 'http://127.0.0.1:8801',
      makerHost: 'maker.example', sessionSecret: 'test secret used for fixture only and at least 32 bytes',
      maxBytes: 64 * 1024 ** 2, quotaBytes: 1024 ** 3, maxCount: 200, ticketTtl: 90,
      ...limits,
    },
    makerFetch: async (url, options) => {
      assert.equal(options.headers.Host, 'maker.example');
      assert.equal(options.redirect, 'error');
      const operation = url.split('/').at(-2);
      const body = options.body ? JSON.parse(options.body) : {};
      const account = issuedAccess.get(options.headers.Authorization?.slice(7));
      if (operation === 'login' && Object.hasOwn(USERS, body.username) && body.password === 'valid') {
        return Response.json({ ...credentials(body.username), user: user(body.username) });
      }
      if (operation === 'me' && account) return Response.json(user(account));
      if (operation === 'logout' && account) {
        issuedRefresh.delete(body.refresh);
        return Response.json({});
      }
      if (operation === 'refresh' && issuedRefresh.has(body.refresh)) {
        const owner = issuedRefresh.get(body.refresh);
        issuedRefresh.delete(body.refresh);
        return Response.json(credentials(owner));
      }
      return Response.json({ message: 'Invalid' }, { status: 401 });
    },
    objects: {
      async probe() {},
      async put(key, bytes) {
        store.set(key, Buffer.from(bytes));
        if (failedUpload) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'Fixture object write failure');
      },
      async get(key) {
        assert.ok(store.has(key));
        return Readable.from([store.get(key)]);
      },
      async remove(key) {
        if (failedRemove) throw new Error('Fixture object removal failure');
        store.delete(key);
      },
    },
  };
  async function start() {
    app = await createApp(dataDir, { ide: options });
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()) + '/api/v1';
  }
  t.after(async () => {
    await app?.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  await start();
  const request = (path, options) => fetch(base + path, options);
  const json = (path, body, headers = {}) => request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const login = async (username) => {
    const response = await json(AUTH + 'login/', { username, password: 'valid' });
    assert.equal(response.status, 200);
    return response;
  };
  return {
    request, json, login, store, banned,
    failUpload: (value) => { failedUpload = value; },
    failRemove: (value) => { failedRemove = value; },
    restart: async () => { await app.close(); app = undefined; await start(); },
  };
}

const bearer = (data) => ({ Authorization: 'Bearer ' + data.access });
const cookies = (response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

async function error(response, status, code) {
  assert.equal(response.status, status);
  const payload = await response.json();
  assert.equal(payload.error.code, code);
}

function create(fixture, bytes, headers) {
  const body = new FormData();
  body.set('name', 'Maker project');
  body.set('file', new Blob([bytes], { type: MIME }), 'project.ob');
  return fixture.request('/projects/', { method: 'POST', headers, body });
}

function overwrite(fixture, id, bytes, headers, version = '"1"') {
  return fixture.request('/projects/' + id + '/content/', {
    method: 'PUT', body: bytes, headers: { ...headers, 'Content-Type': MIME, 'If-Match': version },
  });
}

test('Maker sends the configured virtual host and the MinIO SDK round-trips signed object bytes', async (t) => {
  const saved = new Map();
  const server = createServer(async (request, response) => {
    try {
      const { url, method, headers } = request;
      if (url === '/api/v1/auth/me/') {
        assert.equal(headers.host, 'maker.example');
        assert.equal(headers.authorization, 'Bearer portal-fixture');
        response.end(JSON.stringify(USERS.one));
        return;
      }
      assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=fixture-access\//);
      const target = new URL(url, 'http://127.0.0.1');
      if (target.searchParams.has('location')) {
        response.end('<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>');
      } else if (method === 'HEAD') {
        response.end();
      } else if (method === 'PUT') {
        assert.equal(headers['content-type'], MIME);
        saved.set(target.pathname, await buffer(request));
        response.setHeader('ETag', '"fixture"');
        response.end();
      } else if (method === 'GET') {
        assert.ok(saved.has(target.pathname));
        response.end(saved.get(target.pathname));
      } else {
        assert.equal(method, 'DELETE');
        saved.delete(target.pathname);
        response.writeHead(204).end();
      }
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const maker = new MakerAccounts({ makerBaseUrl: base, makerHost: 'maker.example' });
  assert.deepEqual(await maker.me('portal-fixture'), USERS.one);
  const objects = new MinioProjectObjects({
    minioEndpoint: base, minioBucket: 'private-fixture',
    minioAccessKey: 'fixture-access', minioSecretKey: 'fixture-secret',
  });
  const key = 'projects/v1/fixture/project.ob';
  const original = Buffer.from([0, 1, 2, 128, 255]);
  await objects.probe();
  await objects.put(key, original);
  assert.deepEqual(await buffer(await objects.get(key)), original);
  await objects.remove(key);
  assert.equal(saved.size, 0);
});

test('Maker credentials, cookie scope, cross-origin ticket, rotation and one-time exchange', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await (await f.request('/health')).json(), { status: 'ok', storage: 'minio', auth: 'maker' });
  await error(await f.request(AUTH + 'me/'), 401, 'UNAUTHORIZED');
  await error(await f.json(AUTH + 'login/', { username: 'one', password: 'wrong' }), 401, 'INVALID_CREDENTIALS');
  await error(await f.json(AUTH + 'login/', { username: 'one', password: 'valid' }, { Origin: 'https://other.example' }), 403, 'FORBIDDEN');
  const logged = await f.login('one');
  const initial = await logged.json();
  const setCookies = logged.headers.getSetCookie();
  assert.equal(setCookies.length, 2);
  for (const [value, name, path] of [
    [setCookies[0], 'cfzn_ide_access', '/api/'],
    [setCookies[1], 'cfzn_ide_refresh', '/api/v1/ide/auth/'],
  ]) {
    assert.ok(value.startsWith(name + '='));
    const attributes = value.split('; ').slice(1);
    for (const expected of ['Path=' + path, 'HttpOnly', 'Secure', 'SameSite=Lax']) assert.ok(attributes.includes(expected));
    assert.ok(!attributes.some((attribute) => /^domain=/i.test(attribute)));
  }
  assert.deepEqual(await (await f.request(AUTH + 'me/', { headers: { Cookie: cookies(logged) } })).json(), USERS.one);
  const rotated = await f.json(AUTH + 'refresh/', { refresh: initial.refresh });
  assert.equal(rotated.status, 200);
  await error(await f.json(AUTH + 'refresh/', { refresh: initial.refresh }), 401, 'UNAUTHORIZED');
  await error(await f.request(AUTH + 'me/', { headers: bearer(initial) }), 401, 'UNAUTHORIZED');
  const portalHeaders = { Authorization: 'Bearer portal-one', Origin: 'https://maker.example' };
  const preflight = await f.request(AUTH + 'sso-ticket/', { method: 'OPTIONS', headers: { Origin: portalHeaders.Origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), portalHeaders.Origin);
  const unused = await (await f.json(AUTH + 'sso-ticket/', {}, portalHeaders)).json();
  const issued = await f.json(AUTH + 'sso-ticket/', {}, portalHeaders);
  assert.equal(issued.headers.get('access-control-allow-origin'), portalHeaders.Origin);
  const ticket = await issued.json();
  assert.equal(new URL(ticket.entry_url).searchParams.get('ticket'), ticket.ticket);
  await error(await f.json(AUTH + 'exchange/', { ticket: unused.ticket }), 401, 'INVALID_SSO_TICKET');
  const exchanges = await Promise.all([1, 2].map(() => f.json(AUTH + 'exchange/', { ticket: ticket.ticket })));
  assert.deepEqual(exchanges.map((result) => result.status).sort(), [200, 401]);
  const sso = exchanges.find((result) => result.ok);
  assert.deepEqual((await sso.json()).user, USERS.one);
  const logout = await f.json(AUTH + 'logout/', {}, { Cookie: cookies(sso) });
  assert.equal(logout.status, 200);
  assert.equal(logout.headers.getSetCookie().length, 2);
  await error(await f.request(AUTH + 'me/', { headers: { Cookie: cookies(sso) } }), 401, 'UNAUTHORIZED');
  assert.equal((await f.request(AUTH + 'me/', { headers: { Cookie: cookies(rotated) } })).status, 200);
});

test('protected projects stay account-scoped and retain the committed archive through failed writes', async (t) => {
  const original = await archive('original');
  const f = await fixture(t, { maxCount: 1 });
  const one = bearer(await (await f.login('one')).json());
  const two = bearer(await (await f.login('two')).json());
  const badBody = { method: 'PUT', headers: { 'Content-Type': MIME, 'Content-Encoding': 'gzip' }, body: 'not gzip' };
  await error(await f.request('/projects/unknown/content', badBody), 401, 'UNAUTHORIZED');
  await error(await f.request('/projects/unknown/content', {
    ...badBody, headers: { ...badBody.headers, ...one, 'X-IDE-Account-ID': '22' },
  }), 409, 'ACCOUNT_CHANGED');

  const made = await create(f, original, one);
  assert.equal(made.status, 201);
  const { project } = await made.json();
  assert.equal(project.size, original.length);
  assert.equal(project.checksum, createHash('sha256').update(original).digest('hex'));
  assert.equal(project.contentType, MIME);
  assert.equal(project.savedAt, project.createdAt);
  await error(await create(f, original, one), 409, 'PROJECT_LIMIT_REACHED');
  assert.deepEqual(await (await f.request('/projects', { headers: two })).json(), { items: [] });
  const path = '/projects/' + project.id;
  await error(await f.request(path, { headers: two }), 404, 'NOT_FOUND');
  await error(await f.request(path + '/content', { headers: { ...two, 'If-Match': '"9"' } }), 404, 'NOT_FOUND');
  const renamed = await f.request(path, {
    method: 'PATCH', headers: { ...one, 'Content-Type': 'application/json' }, body: '{"name":"Renamed"}',
  });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).project.revision, 1);
  f.banned.add('one');
  await error(await overwrite(f, project.id, original, one), 403, 'ACCOUNT_RESTRICTED');
  f.banned.delete('one');

  const updated = await archive('changed');
  f.failUpload(true);
  await error(await overwrite(f, project.id, updated, one), 503, 'STORAGE_UNAVAILABLE');
  assert.equal(f.store.size, 1);
  assert.deepEqual([...f.store.values()][0], original);
  f.failUpload(false);
  f.failRemove(true);
  const writes = await Promise.all([1, 2].map(() => overwrite(f, project.id, updated, one)));
  assert.deepEqual(writes.map((result) => result.status).sort(), [200, 412]);
  await error(writes.find((result) => result.status === 412), 412, 'REVISION_MISMATCH');
  assert.equal(f.store.size, 2);
  f.failRemove(false);
  await f.restart();
  assert.equal(f.store.size, 1);
  const reopened = await f.request(path + '/content', { headers: { ...one, 'If-Match': '"2"' } });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(reopened.headers.get('cache-control'), 'no-store');
  assert.equal(reopened.headers.get('etag'), '"2"');
  assert.deepEqual(Buffer.from(await reopened.arrayBuffer()), updated);
  assert.equal((await f.request(path, { method: 'DELETE', headers: one })).status, 204);
  assert.equal(f.store.size, 0);
});

test('64 MiB archives pass POST and PUT, and one extra byte fails without changing them', async (t) => {
  const limit = 64 * 1024 ** 2;
  const f = await fixture(t, { quotaBytes: limit });
  const one = bearer(await (await f.login('one')).json());
  const overhead = (await archive('boundary', 0)).length;
  const exact = await archive('boundary', limit - overhead);
  assert.equal(exact.length, limit);
  const made = await create(f, exact, one);
  assert.equal(made.status, 201);
  const { project } = await made.json();
  const extra = Buffer.concat([exact, Buffer.from([0])]);
  await error(await create(f, extra, one), 413, 'PAYLOAD_TOO_LARGE');
  await error(await overwrite(f, project.id, extra, one), 413, 'PAYLOAD_TOO_LARGE');
  await error(await create(f, await archive('extra project'), one), 413, 'STORAGE_QUOTA_EXCEEDED');
  assert.equal((await overwrite(f, project.id, exact, one)).status, 200);
  assert.equal(f.store.size, 1);
});
