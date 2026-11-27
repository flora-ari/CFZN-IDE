import assert from 'node:assert/strict';
import test from 'node:test';
import { CCraftLink, mountLinkGuide } from '../apps/web/src/ccraft-link.ts';

class Element {
  children = []; listeners = new Map(); attrs = {}; open = false; isConnected = true; disabled = false; focused = 0;
  constructor(tag) { this.tag = tag; }
  append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, f) { this.listeners.set(k, f); }
  removeEventListener(k) { this.listeners.delete(k); }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.get('close')?.(); }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
  focus() { this.focused++; }
}
function fixture(t, installedPlatform = true) {
  const body = new Element('body'), editor = new Element('existing-editor'); editor.textContent = 'unsaved draft'; body.append(editor);
  const docEvents = new Map(), hostEvents = new Map(), calls = []; let gesture = false, online = false, refuse = false, requests = 0;
  const doc = { body, activeElement: editor, visibilityState: 'visible', createElement: tag => new Element(tag), querySelector: () => editor, addEventListener: (k, f) => docEvents.set(k, f), removeEventListener: k => docEvents.delete(k) };
  const host = { top: { location: { set href(value) { assert.ok(gesture); calls.push(value); if (refuse) throw new Error('simulated navigation refusal'); } } }, get location() { throw new Error('must use top'); }, addEventListener: (k, f) => hostEvents.set(k, f), removeEventListener: k => hostEvents.delete(k) };
  const link = new CCraftLink('http://fixture.invalid/api', async () => { requests++; return Response.json(online ? { product: 'ccraft-link', protocolVersion: 1, version: 'fixture', instanceId: 'test-instance', serialDetection: 'serialport.list' } : {}); });
  const guide = mountLinkGuide(link, installedPlatform ? '/fixture-installer.exe' : undefined, doc, host);
  t.after(() => guide.dispose());
  return { body, editor, docEvents, hostEvents, link, guide, calls, get requests() { return requests; }, setOnline: v => { online = v; }, setRefuse: v => { refuse = v; }, click: action => { gesture = true; try { action(); } finally { gesture = false; } } };
}
const all = node => [node, ...node.children.flatMap(all)];
test('both gesture entries dispatch only to the mock top location and preserve existing editor DOM', async t => {
  const f = fixture(t); await f.link.check(); const launch = all(f.body).find(n => n.textContent === '打开 CCraft Link');
  assert.ok(launch); assert.ok(!all(f.body).some(n => n.tag === 'iframe'));
  f.click(() => f.guide.connect()); await f.link.check(); f.click(() => launch.onclick()); await f.link.check();
  assert.deepEqual(f.calls, ['ccraft-link://launch', 'ccraft-link://launch']); assert.ok(f.body.children.includes(f.editor)); assert.equal(f.editor.textContent, 'unsaved draft'); assert.equal(f.link.state.status, 'missing');
});
test('synchronous top navigation refusal still permits detection and recovery; ready suppresses dispatch and dispose removes only owned DOM/listeners', async t => {
  const f = fixture(t); await f.link.check(); f.setRefuse(true); f.click(() => f.guide.connect()); await f.link.check(); assert.equal(f.link.state.status, 'missing'); assert.ok(f.editor.isConnected);
  f.setOnline(true); await f.link.check(); await Promise.resolve(); assert.equal(f.link.state.status, 'ready'); assert.ok(!all(f.body).find(n => n.tag === 'dialog').open); assert.ok(f.editor.focused > 0);
  const calls = f.calls.length; f.click(() => f.guide.connect()); assert.equal(f.calls.length, calls);
  f.guide.dispose(); const requests = f.requests; await f.link.check(); assert.equal(f.requests, requests); assert.deepEqual(f.body.children, [f.editor]); assert.equal(f.docEvents.size, 0); assert.equal(f.hostEvents.size, 0);
});
test('unsupported download platform keeps manual/offline guide without any protocol dispatch', async t => {
  const f = fixture(t, false); await f.link.check(); f.click(() => f.guide.connect()); await f.link.check(); assert.equal(f.calls.length, 0); assert.ok(!all(f.body).some(n => n.textContent === '打开 CCraft Link')); assert.ok(f.editor.isConnected);
});
