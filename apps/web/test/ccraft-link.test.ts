import test from 'node:test';
import assert from 'node:assert/strict';
import { CCraftLink, isLinkHealth, mountLinkGuide } from '../src/ccraft-link.ts';
import { HardwareController } from '../src/hardware-controller.ts';
import { HardwareSession } from '../src/hardware-session.ts';
import { NativeSerialSocket } from '../src/native-serial-socket.ts';

const base = 'http://mock/api/v1/hardware/';
const health = () => ({ product: 'ccraft-link', protocolVersion: 1, version: '0.1.0', instanceId: 'instance-one', serialDetection: 'serialport.list' });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function until(condition: () => boolean) {
  const deadline = Date.now() + 1000;
  while (!condition()) { assert.ok(Date.now() < deadline); await new Promise(resolve => setImmediate(resolve)); }
}

test('health accepts only identified CCraft Link with the agreed protocol and real serial detection', () => {
  assert.equal(isLinkHealth(health()), true);
  for (const data of [null, {}, { protocolVersion: 1, executionHost: 'local' },
    { ...health(), product: 'hardware-main' }, { ...health(), protocolVersion: '1' }, { ...health(), protocolVersion: 2 },
    { ...health(), version: ' ' }, { ...health(), instanceId: '' }, { ...health(), serialDetection: 'mock' }]) assert.equal(isLinkHealth(data), false);
});

test('browser fetch receives the global receiver rather than the Link instance', async () => {
  let calls = 0;
  const request: typeof fetch = async function (this: unknown, url, init) {
    assert.equal(this, globalThis, 'native Window.fetch rejects an incompatible receiver');
    assert.equal(String(url), base + 'link/health'); assert.equal(init?.method, 'GET'); calls++;
    return Response.json(health());
  };
  const link = new CCraftLink(base, request);
  try { assert.equal(await link.check(), true); assert.equal(calls, 1); assert.equal(link.state.status, 'ready'); }
  finally { link.dispose(); }
});

test('concurrent entry points share one no-store health GET; first missing result downloads once across retries and reload', async () => {
  const pending = deferred<Response>(), calls: { url: string; init?: RequestInit }[] = [], saved = new Map<string, string>();
  let downloads = 0;
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  const link = new CCraftLink(base, async (url, init) => { calls.push({ url: String(url), init }); return pending.promise; }, () => { downloads++; }, storage);
  try {
    const one = link.check(), two = link.check(), entry = link.ensureReady();
    assert.equal(one, two); assert.equal(calls.length, 1);
    assert.equal(calls[0].url, base + 'link/health'); assert.equal(calls[0].init?.cache, 'no-store'); assert.equal(calls[0].init?.method, 'GET');
    pending.resolve(Response.json({ protocolVersion: 1, executionHost: 'local' }));
    assert.equal(await one, false); await assert.rejects(entry, /安装并启动 CCraft Link/);
    await link.check(); assert.equal(downloads, 1);
    const reloaded = new CCraftLink(base, async () => Response.json({}), () => { downloads++; }, storage);
    try { await reloaded.check(); assert.equal(downloads, 1); } finally { reloaded.dispose(); }
  } finally { link.dispose(); }
});

test('synchronous checking subscribers also reuse the pending probe', async () => {
  let calls = 0; const pending = deferred<Response>(), link = new CCraftLink(base, async () => { calls++; return pending.promise; });
  let nested: Promise<boolean> | undefined;
  link.subscribe(() => { if (link.state.status === 'checking') nested = link.check(); });
  try {
    const checking = link.check(); assert.equal(nested, checking); assert.equal(calls, 1);
    pending.resolve(Response.json(health())); assert.equal(await checking, true);
  } finally { link.dispose(); }
});

test('a stalled JSON body is bounded by the same timeout, and late success cannot overwrite missing state', async () => {
  const body = deferred<unknown>(); let downloads = 0;
  const link = new CCraftLink(base, async () => ({ ok: true, json: () => body.promise }) as Response, () => { downloads++; }, undefined, 20);
  try {
    assert.equal(await link.check(), false); assert.equal(link.state.status, 'missing'); assert.match(link.state.message, /超时/);
    body.resolve(health()); await new Promise(resolve => setImmediate(resolve));
    assert.equal(link.state.status, 'missing'); assert.equal(downloads, 1);
  } finally { link.dispose(); }
});

test('the production timeout expires at three seconds even if fetch ignores abort', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = deferred<Response>(), link = new CCraftLink(base, () => pending.promise);
  try {
    const checking = link.check(); context.mock.timers.tick(2999); assert.equal(link.state.status, 'checking');
    context.mock.timers.tick(1); assert.equal(await checking, false); assert.equal(link.state.status, 'missing');
    pending.resolve(Response.json(health())); await new Promise(resolve => setImmediate(resolve)); assert.equal(link.state.status, 'missing');
  } finally { link.dispose(); context.mock.timers.reset(); }
});

test('the persistent guide exposes manual download and status when automatic download is blocked, then hides after recovery', async () => {
  class Element {
    tag: string; children: Element[] = []; attrs: Record<string, string> = {}; hidden = false; textContent = ''; disabled = false;
    className = ''; id = ''; href = ''; download = ''; type = ''; onclick?: () => void;
    constructor(tag: string) { this.tag = tag; }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    append(...items: Element[]) { this.children.push(...items); }
    remove() {}
  }
  const body = new Element('body'), doc = { body, createElement: (tag: string) => new Element(tag), addEventListener() {}, removeEventListener() {}, hasFocus: () => true, visibilityState: 'visible' };
  const host = { addEventListener() {}, removeEventListener() {} }; let online = false;
  const link = new CCraftLink(base, async () => online ? Response.json(health()) : Response.json({}), () => { throw new Error('download blocked'); });
  const stop = mountLinkGuide(link, '/downloads/CCraft-Link-Setup.exe', doc as unknown as Document, host as unknown as Window & typeof globalThis);
  try {
    assert.equal(await link.check(), false);
    const panel = body.children[0], status = panel.children.find(item => item.attrs.role === 'status')!, download = panel.children.find(item => item.tag === 'a')!, retry = panel.children.find(item => item.tag === 'button')!;
    assert.equal(panel.hidden, false); assert.equal(status.attrs['aria-live'], 'polite');
    assert.equal(download.href, '/downloads/CCraft-Link-Setup.exe'); assert.equal(download.download, 'CCraft-Link-Setup.exe');
    assert.equal(retry.disabled, false); assert.ok(retry.onclick); assert.match(panel.children.map(item => item.textContent).join(''), /继续离线编辑/);
    online = true; const checking = link.check(); assert.equal(panel.hidden, false); assert.equal(retry.disabled, true);
    await checking; assert.equal(panel.hidden, true);
  } finally { stop(); }
});

test('blur aborts a pending check, stale responses cannot overwrite a newer ready result, and dispose prevents later checks', async () => {
  const old = deferred<Response>(); let calls = 0, downloads = 0;
  const link = new CCraftLink(base, async () => ++calls === 1 ? old.promise : Response.json(health()), () => { downloads++; });
  const checking = link.check(); link.setActive(false); await checking;
  link.setActive(true); await link.ensureReady();
  assert.equal(link.state.status, 'ready'); old.resolve(Response.json({})); await new Promise(resolve => setImmediate(resolve));
  assert.equal(link.state.status, 'ready'); assert.equal(downloads, 0);
  link.dispose(); const before = calls; assert.equal(await link.check(), false); assert.equal(calls, before);
});

test('missing guide polls at 3 seconds only while focused; recovery stops polling without downloading again', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let online = false, calls = 0, downloads = 0;
  const link = new CCraftLink(base, async () => { calls++; if (!online) throw new TypeError('Failed to fetch'); return Response.json(health()); }, () => { downloads++; });
  try {
    await link.check(); assert.equal(downloads, 1); assert.equal(calls, 1);
    context.mock.timers.tick(2999); assert.equal(calls, 1);
    context.mock.timers.tick(1); await until(() => link.state.status === 'missing'); assert.equal(calls, 2); assert.equal(downloads, 1);
    link.setActive(false); context.mock.timers.tick(9000); assert.equal(calls, 2);
    online = true; link.setActive(true); await until(() => link.state.status === 'ready');
    const recovered = calls; context.mock.timers.tick(9000); assert.equal(calls, recovered); assert.equal(downloads, 1);
  } finally { link.dispose(); context.mock.timers.reset(); }
});

test('connection, direct native discover/upload and controller start reject missing Link before any device or job request', async () => {
  let scans = 0, requests = 0, downloads = 0;
  const link = new CCraftLink(base, async () => Response.json({ product: 'old-service' }), () => { downloads++; });
  const session = new HardwareSession({ getPorts: async () => { scans++; return []; }, requestPort: async () => { throw new Error('must not choose'); } });
  const source = { deviceId: 'arduinoUno', code: 'void setup(){}', documentId: 1, editVersion: 1, realtime: false, moduleIds: [] };
  const hardware = new HardwareController(session, () => source, base, () => {}, async () => { requests++; throw new Error('must not request'); });
  hardware.setLinkGuard(link);
  const socket = new NativeSerialSocket(hardware), replies: any[] = []; socket.setHandleMessage(reply => replies.push(reply)); socket.open();
  try {
    await assert.rejects(Promise.resolve(hardware.start(false)), /安装并启动 CCraft Link/);
    await assert.rejects(hardware.applySerialSettings({ browserPortId: 'local:COM3', options: session.options }), /安装并启动 CCraft Link/);
    socket.sendMessage({ id: 1, method: 'discover' });
    socket.sendMessage({ id: 2, method: 'upload', params: { message: 'void setup(){}' } });
    await until(() => replies.length === 2);
    assert.ok(replies.every(reply => /安装并启动 CCraft Link/.test(reply.error.message)));
    assert.equal(scans, 0); assert.equal(requests, 0); assert.equal(downloads, 1); assert.equal(hardware.busy, false);
  } finally { socket.close(); link.dispose(); }
});

test('identified Link with no ports and no toolchain stays ready without downloads; recovery never starts jobs', async () => {
  let online = false, downloads = 0, posts = 0;
  const link = new CCraftLink(base, async () => { if (!online) throw new TypeError('Failed to fetch'); return Response.json(health()); }, () => { downloads++; });
  const source = { deviceId: 'arduinoUno', code: 'void setup(){}', documentId: 1, editVersion: 1, realtime: false, moduleIds: [] };
  const hardware = new HardwareController(new HardwareSession(), () => source, base, () => {}, async (url, init) => {
    if (init?.method === 'POST') posts++;
    return Response.json(String(url).endsWith('/ports') ? { items: [] } : { protocolVersion: 1, executionHost: 'local', toolchain: { cliVersion: null, description: 'not configured' }, profiles: [
      { id: 'uno', deviceId: 'arduinoUno', label: 'Uno', chip: 'avr', fqbn: 'arduino:avr:uno', compileAvailable: false, uploadAvailable: false, realtimeAvailable: false, reason: 'No toolchain configured for this profile.' },
    ] });
  }); hardware.setLinkGuard(link);
  try {
    await link.check(); assert.equal(downloads, 1);
    online = true; await hardware.refresh();
    assert.equal(link.state.status, 'ready'); assert.equal(hardware.snapshot().localService.status, 'online'); assert.deepEqual(hardware.ports, []);
    assert.match(hardware.startDisabledReason(false), /工具链/); assert.equal(downloads, 1); assert.equal(posts, 0); assert.equal(hardware.busy, false);
    await hardware.refresh(); assert.equal(downloads, 1); assert.equal(posts, 0);
  } finally { link.dispose(); }
});
