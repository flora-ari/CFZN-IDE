import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { LocalSerialLike, SerialSources } from '../apps/web/src/local-serial.ts';
import { HardwareSession } from '../apps/web/src/hardware-session.ts';
import { HardwareController } from '../apps/web/src/hardware-controller.ts';
import { SerialDevicePanel } from '../apps/web/src/serial-device-panel.ts';
import { NativeSerialSocket } from '../apps/web/src/native-serial-socket.ts';
import { makeConnectionView, renderConnectionPanel } from '../apps/web/src/connection-modal.ts';

// Actual frontend objects; permission and port Streams are test doubles. No fetch/listener/OS access.
const root = resolve(import.meta.dirname, '..'), out = join(root, 'tests/evidence/browser-serial-default-20261124');
const report = { date: '2026-11-24', environment: 'Node with strip-types; real frontend objects and fake SerialLike permission objects', browserGeometry: 'not exercised', cases: [] };
const sha = value => createHash('sha256').update(value).digest('hex');
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(5); } assert.fail('fixture condition timed out'); }
const R = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter(child => child !== false && child != null) }) };
const nodes = item => item && typeof item === 'object' ? [item, ...item.children.flatMap(nodes)] : [];
const text = item => typeof item === 'string' ? item : item && typeof item === 'object' ? item.children.map(text).join('') : '';
const newButton = panel => nodes(renderConnectionPanel(R, panel)).find(n => n.type === 'button' && text(n) === '连接新设备');
class Port extends EventTarget {
  opens = []; closes = 0; isOpen = false; closeFails = false;
  readable = null; writable = null;
  getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
  async open(options) { assert.equal(this.isOpen, false); this.opens.push({ ...options }); this.isOpen = true; this.readable = new ReadableStream(); this.writable = new WritableStream(); }
  async close() { this.closes++; if (this.closeFails) throw new Error('fixture close retained'); this.isOpen = false; this.readable = null; this.writable = null; }
}
function fixture(t, browserSupported = true) {
  const a = new Port(), b = new Port(), fresh = new Port();
  const state = { http: 0, localEnumerations: 0, scans: 0, choices: 0, insideClick: false, enforceClick: false, allowed: [a, b], choose: () => Promise.resolve(fresh), enumerate: undefined };
  const request = async () => { state.http++; throw new TypeError('fixture local HTTP unavailable'); };
  const local = new LocalSerialLike('http://fixture.invalid/api/v1/hardware', request);
  const originalGetPorts = local.getPorts.bind(local);
  local.getPorts = (...args) => { state.localEnumerations++; return originalGetPorts(...args); };
  const browser = { getPorts: () => { state.scans++; return state.enumerate ? state.enumerate() : Promise.resolve(state.allowed); },
    requestPort: () => { state.choices++; if (state.enforceClick) assert.ok(state.insideClick, 'requestPort must run in the original synchronous click stack'); return state.choose(); } };
  const sources = new SerialSources(local, browserSupported ? browser : undefined), session = new HardwareSession(sources);
  const current = { deviceId: 'arduinoEsp32', code: 'void setup(){}', documentId: 1, editVersion: 1, moduleIds: [], realtime: false };
  const hardware = new HardwareController(session, () => current, local.base, () => {}, request);
  let connects = 0;
  const panel = new SerialDevicePanel(hardware, sources, (id, options) => { connects++; return hardware.applySerialSettings({ browserPortId: id, options }); }, () => session.close(), { getItem: () => null, setItem: () => {} });
  t.after(async () => { for (const port of [a, b, fresh]) port.closeFails = false; hardware.busy = false; await session.close(); local.dispose(); });
  return { a, b, fresh, local, sources, session, hardware, panel, current, state, connects: () => connects };
}
function check(name, run) {
  test(name, async t => { try { const detail = await run(t); report.cases.push({ name, passed: true, detail }); }
    catch (error) { report.cases.push({ name, passed: false, error: error.stack }); throw error; } });
}

check('mount, reopen, refresh and native discovery enumerate browser objects without HTTP, permission or open', async t => {
  const f = fixture(t); assert.equal(f.panel.source, 'browser');
  const effects = [], hooks = { ...R, useState: () => [0, () => {}], useEffect: effect => effects.push(effect()) };
  const View = makeConnectionView(hooks, f.panel); View(); await until(() => !f.session.scanning && f.panel.rows.length === 2);
  effects.pop()(); View(); await until(() => !f.session.scanning); effects.pop()(); await f.panel.refresh();
  const socket = new NativeSerialSocket(f.hardware), messages = []; socket.discoverySource = 'browser'; socket.setHandleMessage(m => messages.push(m)); socket.open();
  f.sources.setSource('local'); // Explicit discovery source must win even if a prior source selection was local.
  socket.sendMessage({ id: 71, method: 'discover' }); await until(() => messages.some(m => m.id === 71));
  assert.ok(messages.find(m => m.id === 71 && 'result' in m)); socket.close();
  assert.equal(f.state.http, 0); assert.equal(f.state.localEnumerations, 0); assert.equal(f.state.choices, 0); assert.equal(f.a.opens.length + f.b.opens.length, 0);
  const a = f.panel.rows[0].id, b = f.panel.rows[1].id; f.panel.edit(a, '9600'); f.panel.edit(b, '57600');
  await f.panel.activate(b); assert.equal(f.b.opens[0].baudRate, 57600); assert.equal(f.a.opens.length, 0); assert.equal(f.state.choices, 0);
  return { browserScans: f.state.scans, localHTTP: 0, permissionPrompts: 0, existingPortDirectOpens: 1, baud: 57600 };
});

check('actual new-device button requests permission synchronously, suppresses repeats and connects once with row settings', async t => {
  const f = fixture(t), selection = deferred(); await f.panel.refresh(); const old = f.panel.rows[0].id, known = f.panel.rows[1].id;
  f.panel.edit(old, '9600'); await f.panel.activate(old); f.panel.edit(known, '38400');
  f.state.enforceClick = true; f.state.choose = () => selection.promise;
  f.state.insideClick = true; newButton(f.panel).props.onClick(); f.state.insideClick = false;
  assert.equal(f.state.choices, 1); assert.equal(f.a.closes, 0); assert.equal(f.panel.connectingNew, true);
  newButton(f.panel).props.onClick(); assert.equal(f.state.choices, 1); selection.resolve(f.fresh); await until(() => !f.panel.connectingNew);
  assert.equal(f.fresh.opens.length, 1); assert.equal(f.fresh.opens[0].baudRate, 115200); assert.equal(f.a.closes, 1); assert.equal(f.connects(), 2);
  assert.equal(f.panel.rows.find(r => r.id === old).savedBaud, 9600); assert.equal(f.panel.rows.find(r => r.id === known).draftBaud, '38400');
  f.state.choose = () => Promise.resolve(f.b); f.state.insideClick = true; const pending = f.panel.connectNewDevice(); f.state.insideClick = false; await pending;
  assert.equal(f.b.opens.length, 1); assert.equal(f.b.opens[0].baudRate, 38400); await f.panel.activate(known); assert.equal(f.b.opens.length, 1);
  assert.equal(f.state.http, 0);
  return { syncClick: true, repeatedClickPrompts: 1, newPortOpens: 1, newPortBaud: 115200, knownPortBaud: 38400, sameTargetNoReopen: true };
});

check('cancel and denied selections preserve the old stream and independent drafts with no automatic retry', async t => {
  const f = fixture(t); await f.panel.refresh(); const a = f.panel.rows[0].id, b = f.panel.rows[1].id;
  f.panel.edit(a, '19200'); await f.panel.activate(a); f.panel.edit(b, '57600');
  for (const name of ['NotFoundError', 'SecurityError']) {
    f.state.choose = () => Promise.reject(new DOMException('fixture ' + name, name)); await f.panel.connectNewDevice();
    assert.equal(f.session.portId, a); assert.equal(f.session.status, 'open'); assert.equal(f.session.options.baudRate, 19200);
    assert.equal(f.a.closes, 0); assert.equal(f.b.opens.length + f.fresh.opens.length, 0); assert.equal(f.panel.rows.find(r => r.id === b).draftBaud, '57600');
  }
  assert.equal(f.state.choices, 2); assert.match(text(renderConnectionPanel(R, f.panel)), /fixture SecurityError/); assert.equal(f.state.http, 0);
  return { cancelledAndDenied: true, permissionCalls: 2, oldCloses: 0, oldBaud: 19200, otherDraft: 57600 };
});

check('guards are rechecked after permission selection and unknown ownership or failed close blocks a new chooser', async t => {
  const f = fixture(t); await f.panel.refresh(); const old = f.panel.rows[0].id; await f.panel.activate(old);
  for (const guard of ['busy', 'protocol', 'mutation']) {
    const selection = deferred(); f.state.choose = () => selection.promise; const pending = f.panel.connectNewDevice();
    if (guard === 'busy') f.hardware.busy = true;
    if (guard === 'protocol') f.current.realtime = true;
    if (guard === 'mutation') f.hardware.setMutationGuard(() => 'fixture pending project change');
    selection.resolve(f.fresh); await assert.rejects(pending);
    assert.equal(f.session.portId, old); assert.equal(f.a.closes, 0); assert.equal(f.fresh.opens.length, 0);
    f.hardware.busy = false; f.current.realtime = false; f.hardware.setMutationGuard(() => '');
  }
  const before = f.state.choices;
  f.hardware.busy = true; await assert.rejects(f.panel.connectNewDevice(), /作业/); f.hardware.busy = false;
  f.current.realtime = true; await assert.rejects(f.panel.connectNewDevice(), /协议/); f.current.realtime = false;
  f.a.closeFails = true; await assert.rejects(f.panel.disconnectRow(old), /fixture close retained/);
  await assert.rejects(f.panel.connectNewDevice(), /释放/); assert.equal(f.state.choices, before); assert.equal(f.session.portId, old); assert.ok(newButton(f.panel).props.disabled);
  f.a.closeFails = false; await f.panel.disconnectRow(old); assert.equal(f.session.portId, null);
  return { lateGuards: ['busy', 'protocol', 'mutation'], targetOpens: 0, newPromptsWhileHeld: 0, retryCloseReleased: true };
});

check('source cache, active opposite-source objects and manual source choice survive refresh and view recreation', async t => {
  const f = fixture(t), localPort = new Port();
  localPort.connectionInfo = { id: 'local-fixture', source: 'local', portId: 'MOCK_LOCAL', name: 'Fake local row', label: 'MOCK_LOCAL', preferenceKey: 'fixture|MOCK_LOCAL', confirmed: true, ownership: 'idle' };
  f.local.getPorts = async () => { f.state.localEnumerations++; return [localPort]; }; f.local.confirmed = true; f.local.status = 'online';
  await f.panel.refresh(); const browserId = f.panel.rows[0].id; f.panel.edit(browserId, '57600');
  await f.panel.setSource('local'); f.panel.edit('local-fixture', '9600'); await f.panel.activate('local-fixture');
  const httpBefore = f.state.http; await f.panel.setSource('browser'); await f.panel.refresh();
  assert.equal(f.state.http, httpBefore); assert.equal(f.session.portId, 'local-fixture'); assert.equal(localPort.closes, 0); assert.equal(f.panel.rows.find(r => r.id === 'local-fixture').active, true);
  assert.ok(f.session.ports.some(p => p.id === 'local-fixture')); assert.equal(f.panel.rows.find(r => r.id === browserId).draftBaud, '57600');
  assert.match(text(renderConnectionPanel(R, f.panel)), /本机串口服务/); await f.panel.setSource('local');
  const effects = [], hooks = { ...R, useState: () => [0, () => {}], useEffect: effect => effects.push(effect()) };
  makeConnectionView(hooks, f.panel)(); await until(() => !f.session.scanning); effects.pop()(); assert.equal(f.panel.source, 'local'); assert.equal(f.session.options.baudRate, 9600);
  await f.panel.setSource('browser'); await f.panel.activate(browserId); assert.equal(localPort.isOpen, false); assert.equal(f.session.options.baudRate, 57600);
  f.state.allowed = []; await f.panel.refresh(); assert.ok(f.panel.rows.some(r => r.id === browserId && r.active)); assert.equal(f.a.closes, 0);
  return { localCachePreserved: true, localActiveVisibleInBrowser: true, browserRefreshLocalHTTP: 0, manualSourceSurvivesMount: true, bothRatesPreserved: [9600, 57600] };
});

check('stale browser enumeration cannot remove newly selected object and unsupported browser defaults to local', async t => {
  const f = fixture(t), scan = deferred(); f.state.enumerate = () => scan.promise;
  const refreshing = f.panel.refresh(); await f.panel.connectNewDevice(); scan.resolve([]); await refreshing;
  assert.equal(f.fresh.opens.length, 1); assert.ok(f.panel.rows.some(r => r.active)); assert.equal(f.state.http, 0);
  const unsupported = fixture(t, false); assert.equal(unsupported.panel.source, 'local'); await unsupported.panel.refresh();
  assert.ok(unsupported.state.localEnumerations > 0); await assert.rejects(unsupported.panel.connectNewDevice(), /不支持 Web Serial/); assert.equal(unsupported.state.choices, 0);
  return { staleScanPreservesSelection: true, unsupportedDefault: 'local', unsupportedPrompts: 0 };
});

check('five columns retain only rightmost row actions; browser view hides inactive local errors and separate authorization button', async t => {
  const f = fixture(t); await f.panel.refresh(); f.local.status = 'offline'; f.local.message = 'Failed to fetch fixture local';
  let tree = renderConnectionPanel(R, f.panel), all = nodes(tree);
  assert.doesNotMatch(text(tree), /Failed to fetch|本机串口服务：|授权浏览器串口/); assert.equal(all.filter(n => n.type === 'button' && text(n) === '连接新设备').length, 1);
  assert.deepEqual(all.filter(n => n.type === 'th').map(text), ['设备名称', '端口', '波特率', '状态', '操作']);
  for (const row of all.filter(n => n.type === 'tr' && n.props['data-port-id'])) { assert.equal(row.children.length, 5); row.children.slice(0, 4).forEach(td => assert.ok(!nodes(td).some(n => n.type === 'button'))); assert.equal(nodes(row.children[4]).filter(n => n.type === 'button').length, 2); }
  f.state.enumerate = () => Promise.reject(new Error('fixture browser enumeration error')); await f.panel.refresh(); tree = renderConnectionPanel(R, f.panel);
  assert.match(text(tree), /fixture browser enumeration error/); assert.doesNotMatch(text(tree), /Failed to fetch fixture local/);
  assert.equal(f.state.http, 0);
  return { columns: 5, rowActionColumn: 5, independentAuthorizationButton: false, browserErrorVisible: true, inactiveLocalErrorHidden: true, evidenceType: 'React element structure, no actual browser layout' };
});

check('final entry and protected GUI, VM, Blockly, licenses and user PNG remain byte-identical', async () => {
  const dist = join(root, 'apps/web/dist'), html = await readFile(join(dist, 'openblock.html'), 'utf8');
  assert.ok(html.includes('editor-DKjvixSe.js')); assert.ok(html.includes('editor-D-1o8Rs6.css'));
  const editor = await readFile(join(dist, 'assets/editor-DKjvixSe.js'), 'utf8'); assert.ok(editor.includes('连接新设备')); assert.ok(!editor.includes('授权浏览器串口'));
  const gui = await readFile(join(dist, 'openblock-vendor/openblock-gui.js'));
  assert.equal(sha(gui), '78c7b2c43ea6eddffe6877c43b8fe677b9568849d84d45b436f9d077b1fbcbb5');
  const archive = join(root, '.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz');
  const extract = name => execFileSync('tar', ['-xOf', archive, 'package/' + name], { maxBuffer: 100 * 1024 * 1024 });
  const manifest = JSON.parse(await readFile(join(root, 'apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json'), 'utf8'));
  const chunks = value => { const matches = [...value.matchAll(/^\/\* (\d+) \*\//gm)]; return new Map(matches.map((m, i) => [m[1], value.slice(m.index, matches[i + 1]?.index ?? value.length)])); };
  const upstream = chunks(extract('dist/openblock-gui.js').toString()), shipped = chunks(gui.toString()); assert.equal(manifest.vm.length, 178); assert.equal(manifest.blockly.length, 15);
  for (const part of [...manifest.vm, ...manifest.blockly]) { assert.equal(shipped.get(part.id), upstream.get(part.id)); assert.equal(sha(shipped.get(part.id)), part.sha256); }
  for (const name of ['LICENSE', 'LICENSE.MIT', 'TRADEMARK']) assert.deepEqual(await readFile(join(dist, 'openblock-vendor', name)), extract(name));
  for (const path of ['apps/web/public/branding/ccraft-logo.png', 'apps/web/dist/branding/ccraft-logo.png']) assert.equal(sha(await readFile(join(root, path))), 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2');
  const native = await readFile(join(root, 'apps/web/src/native-hardware.ts'), 'utf8'); assert.match(native, /activeSocket\.discoverySource = connectingSource/);
  return { editor: 'editor-DKjvixSe.js', css: 'editor-D-1o8Rs6.css', editorSHA256: sha(editor), guiSHA256: sha(gui), vmModules: 178, blocklyModules: 15, licenses: 3, pngSHA256: 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2' };
});

after(async () => { await mkdir(out, { recursive: true }); await writeFile(join(out, 'independent-checks.json'), JSON.stringify(report, null, 2)); });
