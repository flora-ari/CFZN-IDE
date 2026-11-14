// Independent browser fixtures only. Importing this file starts no services/browser.
export const capabilities = () => ({ protocolVersion: 1, executionHost: 'local',
  profiles: ['arduinoUno','arduinoEsp32S3','aijiteESP32S3','arduinoEsp32','firebeetleEsp32E'].map(deviceId => ({
    id: `independent-${deviceId}`, deviceId, label: `SIMULATED ${deviceId}`, chip: deviceId === 'arduinoUno' ? 'avr' : deviceId.includes('S3') ? 'esp32s3' : 'esp32',
    fqbn: 'SIMULATED:never:compile', compileAvailable: true, uploadAvailable: true, realtimeAvailable: false
  })), toolchain: { cliVersion: null, description: 'Independent simulated capability service; no physical hardware' } });

export async function installSimulatedSerial(context) {
  await context.addInitScript(() => {
    window.__serial = { simulated: true, requests: 0, opens: 0, closes: 0, readers: 0, writers: 0, writes: [], authorized: false, failWrite: false };
    class SimulatedPort extends EventTarget {
      opened = false;
      getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
      async open() {
        if (this.opened) throw Error('SECOND_SERIAL_OWNER');
        this.opened = true; __serial.opens++;
        this.readable = new ReadableStream({ start: controller => { this.input = controller; } });
        this.writable = new WritableStream({ write: bytes => { if (__serial.failWrite) throw Error('SIMULATED_WRITE_FAILURE'); __serial.writes.push([...bytes]); } });
        const reader = this.readable.getReader.bind(this.readable), writer = this.writable.getWriter.bind(this.writable);
        this.readable.getReader = (...args) => { __serial.readers++; return reader(...args); };
        this.writable.getWriter = (...args) => { __serial.writers++; return writer(...args); };
      }
      async close() {
        if (this.readable?.locked || this.writable?.locked) throw Error('LOCKS_NOT_RELEASED');
        this.opened = false; __serial.closes++;
      }
    }
    window.__port = new SimulatedPort();
    Object.defineProperty(navigator, 'serial', { configurable: true, value: {
      getPorts: async () => __serial.authorized ? [__port] : [],
      requestPort: async () => { __serial.requests++; __serial.authorized = true; return __port; },
      addEventListener() {}, removeEventListener() {}
    } });
  });
}

// Network isolation: no request to the user's hardware executor can escape.
export async function installHardwareFixture(context, state) {
  state.calls ??= [];
  await context.route('**/api/v1/hardware/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    state.calls.push({ method: request.method(), path, body: request.postData() });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (state.allowJob && /\/(builds|jobs\/[^/]+(?:\/cancel)?)$/.test(path)) {
      if (path.endsWith('/builds')) state.job = { id: 'SIMULATED-JOB', kind: 'build', state: 'running', stage: 'compiling', deviceId: 'arduinoEsp32', profileId: 'independent-arduinoEsp32', sourceHash: 'SIMULATED', createdAt: new Date().toISOString() };
      if (path.endsWith('/cancel')) state.job.state = 'cancelling';
      const job = state.job;
      if (!job) throw Error('NO_SIMULATED_JOB');
      return route.fulfill({ status: path.endsWith('/builds') ? 202 : 200, contentType: 'application/json', body: JSON.stringify({ job, logs: [], nextLog: 0 }) });
    }
    if (request.method() !== 'GET') throw Error('UNEXPECTED_HARDWARE_MUTATION ' + path);
    if (state.mode === 'offline') return route.abort('connectionrefused');
    if (state.mode === 'timeout') return; // Caller closes context after observing bounded diagnostic timeout.
    const sequence = state.sequence = (state.sequence || 0) + 1;
    const mode = state.mode;
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    let body = path.endsWith('/ports') ? { items: [{ portId: 'SIMULATED-OS-PORT', displayName: 'SIMULATED OS target' }] } : capabilities();
    if (mode === 'protocol') body.protocolVersion = 999;
    if (mode === 'structure') body = { protocolVersion: 1, executionHost: 'local', profiles: {} };
    if (mode === 'missing-core' && body.profiles) body.profiles = body.profiles.map(p => ({ ...p, compileAvailable: false, uploadAvailable: false, reason: 'SIMULATED core unavailable' }));
    await route.fulfill({ status: mode === 'ports-fail' && path.endsWith('/ports') ? 503 : 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(error => {
      if (!/closed|disposed|cancel/i.test(String(error))) throw error;
    });
    state.completed ??= []; state.completed.push({ sequence, mode });
  });
}
