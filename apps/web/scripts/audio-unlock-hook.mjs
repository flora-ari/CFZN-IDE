import { createHash } from 'node:crypto';

// The sole dependency exception: pinned startaudiocontext, not a VM/Blockly module.
export const audioUnlockSource = 'node_modules/startaudiocontext/StartAudioContext.js';
const header = '/* 520 */\n/***/ (function(module, exports, __webpack_require__) {';
const boundary = '\n/***/ }),\n/* 521 */';
const upstreamModuleSha256 = '25a2a59155f46255e47cc5000be589cdfed4b1d09b2c03d04e865d412a46dc9f';

// Serialized into this dependency's existing factory; it changes no browser globals.
function createStartAudioContext(environment) {
  const records = new WeakMap();
  let disposed = false;
  const document = environment.document;
  const window = environment.window;
  const navigator = environment.navigator;

  function createRecord(context) {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const bindings = new Map(), sources = new Set();
    const record = { promise, done: false, inFlight: false, addElements, observe };
    records.set(context, record);

    function releaseSource(source) {
      sources.delete(source);
      source.onended = null;
      try { source.stop(0); } catch (_) { /* Already ended/closed. */ }
      try { source.disconnect(); } catch (_) { /* Already disconnected/closed. */ }
    }
    function cleanup() {
      record.done = true;
      record.inFlight = false;
      context.removeEventListener('statechange', observe);
      window.removeEventListener('pagehide', unload);
      for (const [element, handlers] of bindings) {
        for (const [type, handler] of handlers) element.removeEventListener(type, handler, true);
      }
      bindings.clear();
      for (const source of sources) releaseSource(source);
      records.delete(context);
    }
    function observe() {
      if (record.done) return;
      if (context.state === 'running') { cleanup(); resolve(); }
      else if (context.state === 'closed') cleanup();
    }
    function unload() { disposed = true; cleanup(); }
    function validGesture(event, dragged) {
      if (!event || event.isTrusted !== true || record.done || disposed) return false;
      const activation = navigator && navigator.userActivation;
      if (activation && !activation.isActive) return false;
      if (event.type === 'touchend') return !dragged;
      if (event.type === 'mousedown' || event.type === 'click') return event.button === 0;
      return event.type === 'keydown' && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey &&
        typeof event.key === 'string' && event.key.length > 0 &&
        !['Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'].includes(event.key);
    }
    function unlock(event, dragged) {
      observe();
      if (!validGesture(event, dragged) || record.inFlight) return;
      record.inFlight = true;
      let source;
      const settled = () => {
        if (source) releaseSource(source);
        record.inFlight = false;
        observe(); // A fulfilled resume promise alone does not establish running.
      };
      try {
        // Retain the one-sample iOS unlock, only inside the trusted gesture stack.
        const buffer = context.createBuffer(1, 1, context.sampleRate);
        source = context.createBufferSource();
        sources.add(source);
        source.onended = () => releaseSource(source);
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);
        const resumed = context.resume ? context.resume() : undefined;
        // Policy/close failures remain pending until a later real gesture, never a timer.
        Promise.resolve(resumed).then(settled, settled);
      } catch (_) { settled(); }
    }
    function addElements(elements) {
      if (record.done || !elements) return;
      if (typeof elements === 'string') { addElements(document.querySelectorAll(elements)); return; }
      if (elements.jquery && typeof elements.toArray === 'function') { addElements(elements.toArray()); return; }
      if (typeof elements.addEventListener !== 'function' && typeof elements.length === 'number') {
        for (let index = 0; index < elements.length; index++) addElements(elements[index]);
        return;
      }
      if (typeof elements.addEventListener !== 'function' || bindings.has(elements)) return;
      let dragged = false;
      const handlers = new Map([
        ['touchstart', () => { dragged = false; }],
        ['touchmove', () => { dragged = true; }],
        ['touchend', event => { unlock(event, dragged); dragged = false; }],
        ['mousedown', event => unlock(event, false)],
        ['click', event => unlock(event, false)],
        ['keydown', event => unlock(event, false)],
      ]);
      bindings.set(elements, handlers);
      for (const [type, handler] of handlers) elements.addEventListener(type, handler, true);
    }

    if (disposed || context.state === 'closed') { record.done = true; records.delete(context); }
    else if (context.state === 'running') { record.done = true; records.delete(context); resolve(); }
    else {
      context.addEventListener('statechange', observe);
      window.addEventListener('pagehide', unload);
    }
    return record;
  }

  return function StartAudioContext(context, elements, callback) {
    const record = records.get(context) || createRecord(context);
    record.addElements(elements || document.body || document);
    record.observe();
    if (callback) record.promise.then(() => callback());
    return record.promise;
  };
}

export function patchAudioUnlock(original) {
  if (original.split(header).length !== 2) throw new Error(`${audioUnlockSource}: module must match exactly once.`);
  const start = original.indexOf(header) + header.length;
  const end = original.indexOf(boundary, start);
  const body = original.slice(start, end);
  if (end < start || createHash('sha256').update(body).digest('hex') !== upstreamModuleSha256) {
    throw new Error(`${audioUnlockSource}: pinned module hash mismatch.`);
  }
  const factory = '}(this, function () {';
  const returning = '\n\treturn StartAudioContext\n}))';
  if (body.split(factory).length !== 2 || body.split(returning).length !== 2) {
    throw new Error(`${audioUnlockSource}: factory must match exactly once.`);
  }
  const factoryStart = body.indexOf(factory) + factory.length;
  const factoryEnd = body.indexOf(returning, factoryStart);
  const replacement = `\n\n\tvar StartAudioContext = (${createStartAudioContext.toString()})({\n` +
    '\t\tdocument: document, window: window, navigator: typeof navigator === "undefined" ? undefined : navigator\n\t});\n';
  // Preserve the original MIT notice, UMD wrapper and every adjacent module byte.
  return original.slice(0, start) + body.slice(0, factoryStart) + replacement + body.slice(factoryEnd) + original.slice(end);
}
