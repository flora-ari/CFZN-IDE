import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, realpath, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { test, after } from 'node:test';
import { LocalSerialLike, SerialSources } from '../apps/web/src/local-serial.ts';
import { HardwareSession, defaultSerialOptions } from '../apps/web/src/hardware-session.ts';
import { HardwareController } from '../apps/web/src/hardware-controller.ts';
import { SerialDevicePanel } from '../apps/web/src/serial-device-panel.ts';
import { renderConnectionPanel } from '../apps/web/src/connection-modal.ts';

// Actual Nest HTTP and actual frontend classes; the OS driver alone is injected.
const root = resolve(import.meta.dirname, '..');
const requireApi = createRequire(join(root, 'apps/api/package.json'));
const { createHardwareApp } = requireApi('./dist/hardware/app.js');
requireApi('@nestjs/common').Logger.overrideLogger(false);
const origin = 'https://serial-independent.example.test';
const evidence = { transport: 'real Nest HTTP on OS-assigned loopback ports', driver: 'injected EventEmitter fake; no OS serial binding loaded', cases: [] };
const out = join(root, 'tests/evidence/serial-device-panel-20261124');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function until(predicate) { for (let i = 0; i < 300; i++) { if (predicate()) return; await pause(5); } assert.fail('fixture condition timed out'); }
class Port extends EventEmitter {
  isOpen = false; written = []; closeFails = false;
  open(callback) { Promise.resolve(this.gate?.promise).then(() => { if (this.openError) callback(this.openError); else { this.isOpen = true; callback(); } }); }
  close(callback) { queueMicrotask(() => { if (this.closeFails) callback(new Error('fixture close retained')); else { this.isOpen = false; this.emit('close'); callback(); } }); }
  write(bytes, callback) { this.written.push(Buffer.from(bytes)); queueMicrotask(callback); return false; }
  drain(callback) { queueMicrotask(callback); }
}
async function fixture(t) {
  const parent = await realpath(tmpdir()), directory = await mkdtemp(join(parent, 'ccraft-independent-serial-'));
  const state = { handles: [], calls: [], mode: 'ok', ports: ['MOCK_A', 'MOCK_B'].map((portId, i) => ({ portId, displayName: 'Identical CP210x ' + i, usbVendorId: '10C4', usbProductId: 'EA60', identity: 'fixture-' + i })) };
  const app = await createHardwareApp({ runtimeDir: directory, profiles: {}, toolchains: {}, allowedOrigins: [origin] }, {
    serialDriver: { list: async () => state.ports, create(path, options) { const p = new Port(); p.path = path; p.options = options;
      if (state.mode === 'released') p.openError = new Error('fixture access denied');
      if (state.mode === 'held') { p.gate = deferred(); p.closeFails = true; }
      state.handles.push(p); return p; } },
    ports: async () => state.ports, serialOptions: { ioTimeoutMs: 100 }, discovered: { views: [], ready: new Map(), cliVersion: null },
  });
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api/v1/hardware';
  assert.ok(![3001, 3002, 5173].includes(Number(new URL(base).port)));
  const storageMap = new Map(), storage = { getItem: k => storageMap.get(k) ?? null, setItem: (k, v) => storageMap.set(k, v) };
  let legacy = false, loseOpen = false;
  const request = async (url, init = {}) => {
    const headers = new Headers(init.headers); headers.set('Origin', origin);
    const response = await fetch(url, { ...init, headers });
    const data = await response.clone().json();
    state.calls.push({ path: String(url).slice(base.length), body: init.body ? JSON.parse(init.body) : undefined, token: headers.get('X-CCraft-Serial-Token'), status: response.status, data });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (String(url) === base + '/serial/sessions' && loseOpen) throw new TypeError('fixture response lost after server completion');
    if (String(url) === base + '/capabilities' && legacy) { delete data.serial; return Response.json(data); }
    return response;
  };
  const views = [];
  function view() {
    const local = new LocalSerialLike(base, request), sources = new SerialSources(local), session = new HardwareSession(sources);
    const current = { deviceId: 'arduinoEsp32', code: 'void setup(){}', documentId: 1, editVersion: 1, moduleIds: [], realtime: false };
    const hardware = new HardwareController(session, () => current, base, () => {}, request);
    const panel = new SerialDevicePanel(hardware, sources, (id, options) => hardware.applySerialSettings({ browserPortId: id, options }), () => session.close(), storage);
    const result = { local, sources, session, current, hardware, panel, row: port => panel.rows.find(row => row.port === port) };
    views.push(result); return result;
  }
  async function raw(path, body, token) {
    const response = await request(base + path, { ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CCraft-Serial-Token': token } : {}) } });
    return { status: response.status, ...(await response.json()) };
  }
  t.after(async () => {
    for (const p of state.handles) { p.closeFails = false; p.gate?.resolve(); }
    for (const v of views) { await v.session.close().catch(() => {}); v.local.dispose(); }
    await app.close();
    assert.equal(dirname(await realpath(directory)), parent);
    await rm(directory, { recursive: true, force: true });
  });
  return { state, base, view, raw, setLegacy: v => { legacy = v; }, setLost: v => { loseOpen = v; } };
}
const record = (name, detail) => evidence.cases.push({ name, ...detail });

test('real HTTP panel keeps same-VID preferences separate, receives bytes, orders TX and switches one owner', async t => {
  const f = await fixture(t), v = f.view(); await v.panel.refresh();
  assert.equal(v.local.status, 'online'); assert.equal(v.hardware.profiles.length, 0);
  const a = v.row('MOCK_A').id, b = v.row('MOCK_B').id;
  v.panel.edit(a, '9600'); await v.panel.save(a); v.panel.edit(b, '57600'); await v.panel.save(b);
  assert.equal(f.state.handles.length, 0);
  v.panel.edit(a, '19200'); await v.panel.refresh(); assert.equal(v.row('MOCK_A').draftBaud, '19200');
  v.panel.edit(a, '9600'); await v.panel.activate(a);
  assert.equal(f.state.handles[0].path, 'MOCK_A'); assert.equal(f.state.handles[0].options.baudRate, 9600);
  const received = []; v.session.onBytes(bytes => received.push(...bytes));
  f.state.handles[0].emit('data', Buffer.from([0, 10, 13, 128, 255])); await until(() => received.length === 5);
  f.state.handles[0].emit('data', Buffer.from([5, 6])); await until(() => received.length === 7);
  assert.deepEqual(received, [0, 10, 13, 128, 255, 5, 6]);
  await Promise.all([v.session.write(Uint8Array.of(0, 255)), v.session.write(Uint8Array.of(10, 13))]);
  assert.deepEqual(f.state.handles[0].written.map(b => [...b]), [[0, 255], [10, 13]]);
  const tx = f.state.calls.filter(c => c.path.endsWith('/write')); assert.deepEqual(tx.map(c => c.body.sequence), [1, 2]);
  const before = f.state.handles[0].written.length;
  const retry = await f.raw(tx[0].path, tx[0].body, tx[0].token); assert.equal(retry.status, 200); assert.equal(f.state.handles[0].written.length, before);
  v.hardware.busy = true; await assert.rejects(v.session.write(Uint8Array.of(9)), /作业/); await assert.rejects(v.panel.activate(b), /作业/); v.hardware.busy = false;
  assert.equal(f.state.handles.length, 1);
  v.panel.setSource('browser'); assert.equal(v.row('MOCK_A').active, true); assert.equal(v.session.status, 'open'); v.panel.setSource('local');
  await v.panel.activate(b); assert.equal(f.state.handles[0].isOpen, false); assert.equal(f.state.handles[1].path, 'MOCK_B'); assert.equal(f.state.handles[1].options.baudRate, 57600);
  assert.equal(f.state.handles.filter(p => p.isOpen).length, 1);
  await v.panel.disconnectRow(b); assert.equal(v.session.portId, null); assert.ok(f.state.handles.every(p => !p.isOpen));
  const next = f.view(); await next.panel.refresh(); assert.equal(next.row('MOCK_A').savedBaud, 9600); assert.equal(next.row('MOCK_B').savedBaud, 57600);
  assert.equal(f.state.handles.length, 2);
  const readCursors = f.state.calls.filter(c => c.path.includes('/read?')).map(c => Number(new URL(f.base + c.path).searchParams.get('after')));
  assert.ok(readCursors.includes(5));
  record('same VID, two persisted rates and stream lifecycle', { savedRates: [9600, 57600], rx: received, txSequences: [1, 2], readCursors, duplicateTxDidNotWrite: true, driverOpens: 2 });
});

test('real HTTP open failures confirm null/released and retain a closeable held session', async t => {
  const f = await fixture(t), v = f.view(); await v.panel.refresh(); const a = v.row('MOCK_A').id;
  // Another client acquires after enumeration, reproducing a real row-to-open race.
  const foreign = await f.raw('/serial/clients', {}), listing = await f.raw('/serial/devices', undefined, foreign.clientToken);
  const owned = await f.raw('/serial/sessions', { requestId: randomUUID(), deviceRef: listing.items[0].deviceRef, options: defaultSerialOptions }, foreign.clientToken);
  await assert.rejects(v.panel.activate(a)); assert.equal(v.session.portId, null);
  assert.equal(f.state.calls.findLast(c => c.path === '/serial/sessions').data.error.details.session, null);
  await f.raw('/serial/sessions/' + owned.session.id + '/close', {}, foreign.clientToken);
  await v.panel.refresh(); // The other client released externally; refresh its cached ownership row.
  f.state.mode = 'released'; await assert.rejects(v.panel.activate(a), /fixture access denied/);
  assert.equal(v.session.portId, null);
  const released = f.state.calls.findLast(c => c.path === '/serial/sessions').data.error.details.session; assert.equal(released.held, false);
  f.state.mode = 'held'; await assert.rejects(v.panel.activate(a), /释放|确认/);
  const held = f.state.calls.findLast(c => c.path === '/serial/sessions').data.error.details.session;
  assert.equal(held.held, true); assert.equal(v.session.portId, a); assert.equal(v.session.status, 'error');
  assert.match(v.row('MOCK_B').blocked, /释放/);
  const count = f.state.handles.length, p = f.state.handles.at(-1); p.gate.resolve(); await until(() => p.isOpen);
  await assert.rejects(v.panel.activate(v.row('MOCK_B').id), /释放/); assert.equal(f.state.handles.length, count);
  p.closeFails = false; await v.panel.disconnectRow(a); assert.equal(v.session.portId, null);
  const closeCalls = f.state.calls.filter(c => c.path.endsWith('/close')); assert.ok(closeCalls.some(c => c.path.includes(held.id)));
  f.state.mode = 'ok'; await v.panel.activate(a); await v.panel.disconnectRow(a);
  record('authoritative open error snapshots', { nullCleared: true, releasedCleared: !released.held, heldIdClosed: held.id, retainedUntilExplicitRetry: true, otherRowBlocked: true });
});

test('lost real HTTP open response reconciles the same request and never creates a second driver handle', async t => {
  const f = await fixture(t), v = f.view(); await v.panel.refresh(); f.setLost(true);
  const a = v.row('MOCK_A').id; await assert.rejects(v.panel.activate(a), /未确认/);
  assert.equal(v.session.portId, a); assert.equal(f.state.handles.length, 1);
  f.setLost(false); await v.panel.disconnectRow(a);
  const opens = f.state.calls.filter(c => c.path === '/serial/sessions'); assert.ok(opens.length >= 3);
  assert.equal(new Set(opens.map(c => c.body.requestId)).size, 1); assert.ok(opens.every(c => JSON.stringify(c.body) === JSON.stringify(opens[0].body)));
  assert.equal(f.state.handles.length, 1); assert.equal(f.state.handles[0].isOpen, false); assert.equal(v.session.portId, null);
  record('lost open response with real backend idempotence', { submissions: opens.length, uniqueRequestIds: 1, driverOpens: 1, released: true });
});

test('legacy capability fallback keeps OS rows inert and all rendered row actions occupy only column five', async t => {
  const f = await fixture(t); f.setLegacy(true); const v = f.view(); await v.panel.refresh();
  assert.equal(v.local.status, 'legacy'); assert.equal(v.panel.rows.length, 2);
  await assert.rejects(v.panel.activate(v.row('MOCK_A').id), /更新/); assert.equal(f.state.handles.length, 0);
  const R = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter(v => v !== false && v != null) }) };
  const walk = node => node && typeof node === 'object' ? [node, ...node.children.flatMap(walk)] : [];
  const nodes = walk(renderConnectionPanel(R, v.panel)), rows = nodes.filter(n => n.type === 'tr' && n.props['data-port-id']);
  for (const row of rows) { assert.equal(row.children.length, 5); for (const td of row.children.slice(0, 4)) assert.ok(!walk(td).some(n => n.type === 'button'));
    assert.equal(walk(row.children[4]).filter(n => n.type === 'button').length, 2); }
  assert.equal(nodes.filter(n => n.type === 'input').length, 2); assert.ok(!nodes.some(n => n.type === 'select' || n.type === 'img'));
  f.setLegacy(false); await v.panel.refresh(); assert.equal(v.local.status, 'online'); assert.equal(f.state.handles.length, 0);
  record('legacy and action structure', { legacyRows: 2, driverOpens: 0, columns: 5, actionsOnlyInLastCell: true, actualBrowserGeometry: 'not exercised in this independent task' });
});

test('frozen editor, GUI, all protected modules, licenses and user PNG retain the agreed bytes', async () => {
  const dist = join(root, 'apps/web/dist'), gui = await readFile(join(dist, 'openblock-vendor/openblock-gui.js'));
  assert.equal(sha(gui), '78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5');
  const html = await readFile(join(dist, 'openblock.html'), 'utf8'); assert.ok(html.includes('editor-BLAc7Bpd.js')); assert.ok(html.includes('editor-D-1o8Rs6.css'));
  const manifest = JSON.parse(await readFile(join(root, 'apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json'), 'utf8'));
  assert.equal(manifest.vm.length, 178); assert.equal(manifest.blockly.length, 15);
  const text = gui.toString(), chunks = [...text.matchAll(/^\/\* (\d+) \*\//gm)];
  const modules = new Map(chunks.map((m, i) => [m[1], text.slice(m.index, chunks[i + 1]?.index ?? text.length)]));
  for (const part of [...manifest.vm, ...manifest.blockly]) assert.equal(sha(modules.get(part.id)), part.sha256, 'protected module ' + part.id);
  const archive = join(root, '.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz');
  const extract = name => execFileSync('tar', ['-xOf', archive, 'package/' + name], { maxBuffer: 100 * 1024 * 1024 });
  // Independently compare frozen upstream modules, rather than trusting only a cached manifest.
  const upstream = extract('dist/openblock-gui.js').toString(), matches = [...upstream.matchAll(/^\/\* (\d+) \*\//gm)];
  const originals = new Map(matches.map((m, i) => [m[1], upstream.slice(m.index, matches[i + 1]?.index ?? upstream.length)]));
  for (const part of [...manifest.vm, ...manifest.blockly]) assert.equal(modules.get(part.id), originals.get(part.id));
  for (const name of ['LICENSE', 'LICENSE.MIT', 'TRADEMARK']) {
    const local = name.startsWith('dist/') ? join(dist, 'openblock-vendor', name.slice(5)) : join(dist, 'openblock-vendor', name);
    assert.deepEqual(await readFile(local), extract(name));
  }
  const pngHashes = [];
  for (const path of ['apps/web/public/branding/ccraft-logo.png', 'apps/web/dist/branding/ccraft-logo.png']) {
    const hash = sha(await readFile(join(root, path))); assert.equal(hash, 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2'); pngHashes.push({ path, sha256: hash }); }
  record('frozen protected resources', { guiSHA256: sha(gui), vmModules: manifest.vm.length, blocklyModules: manifest.blockly.length, licenses: 3, pngHashes });
});

after(async () => { await mkdir(out, { recursive: true }); await writeFile(join(out, 'independent-checks.json'), JSON.stringify(evidence, null, 2)); });
