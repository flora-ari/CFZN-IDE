import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { connectHttpTunnel } from './ssh-proxy.mjs';

// These proxies respond locally and never forward or contact an external server.
async function mockProxy(t, handler) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    handler(socket);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return { proxyHost: '127.0.0.1', proxyPort: server.address().port,
    targetHost: 'ssh.example.test', targetPort: 22 };
}

function readBytes(socket, length) {
  return new Promise((resolve, reject) => {
    let bytes = Buffer.alloc(0);
    const failed = (error) => { cleanup(); reject(error); };
    const closed = () => failed(new Error('Tunnel ended before all expected bytes arrived.'));
    const data = (chunk) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length >= length) {
        socket.pause(); cleanup(); resolve(bytes);
      }
    };
    function cleanup() { socket.off('data', data); socket.off('error', failed); socket.off('end', closed); }
    socket.on('data', data); socket.once('error', failed); socket.once('end', closed); socket.resume();
  });
}

test('preserves coalesced SSH banner bytes and forwards arbitrary binary data', { timeout: 5000 }, async (t) => {
  let request;
  const banner = Buffer.from('SSH-2.0-local-test\r\n');
  const options = await mockProxy(t, (socket) => {
    socket.once('data', (bytes) => {
      request = bytes.toString('ascii');
      socket.write(Buffer.concat([Buffer.from('HTTP/1.1 200 Connection established\r\n\r\n'), banner]));
      socket.on('data', (payload) => socket.write(payload));
    });
  });
  const tunnel = await connectHttpTunnel(options);
  t.after(() => tunnel.destroy());
  assert.equal(request, 'CONNECT ssh.example.test:22 HTTP/1.1\r\nHost: ssh.example.test:22\r\n\r\n');
  assert.deepEqual(await readBytes(tunnel, banner.length), banner);
  const payload = Buffer.from([0, 1, 127, 128, 255, 13, 10]);
  const response = readBytes(tunnel, payload.length);
  tunnel.write(payload);
  assert.deepEqual(await response, payload);
});

test('waits for fragmented HTTP headers before releasing the tunnel', { timeout: 5000 }, async (t) => {
  const options = await mockProxy(t, (socket) => socket.once('data', () => {
    socket.write('HTTP/1.1 200 OK\r\nX-Test: yes\r\n');
    setTimeout(() => { if (!socket.destroyed) socket.write('\r\nSSH-TEST'); }, 10);
  }));
  const tunnel = await connectHttpTunnel(options);
  t.after(() => tunnel.destroy());
  assert.equal((await readBytes(tunnel, 8)).toString(), 'SSH-TEST');
});

test('rejects proxy authentication errors and non-HTTP responses', { timeout: 5000 }, async (t) => {
  for (const [response, expected] of [
    ['HTTP/1.1 407 Proxy Authentication Required\r\n\r\n', /status 407/],
    ['not-http\r\n\r\n', /invalid proxy response/],
  ]) {
    const options = await mockProxy(t, (socket) => socket.once('data', () => socket.write(response)));
    await assert.rejects(connectHttpTunnel(options), expected);
  }
});

test('bounds incomplete headers, early closure and handshake time', { timeout: 5000 }, async (t) => {
  const large = await mockProxy(t, (socket) => socket.once('data', () => socket.write('X'.repeat(16385))));
  await assert.rejects(connectHttpTunnel(large), /exceed 16 KiB/);
  const closed = await mockProxy(t, (socket) => socket.once('data', () => socket.end()));
  await assert.rejects(connectHttpTunnel(closed), /closed before/);
  const silent = await mockProxy(t, () => {});
  await assert.rejects(connectHttpTunnel({ ...silent, timeoutMs: 50 }), /timed out/);
});

test('rejects invalid hosts and ports before opening a socket', () => {
  const valid = { proxyHost: '127.0.0.1', proxyPort: 7897, targetHost: 'ssh.example.test', targetPort: 22 };
  assert.throws(() => connectHttpTunnel({ ...valid, targetHost: 'host\r\nInjected: yes' }), /hostname/);
  assert.throws(() => connectHttpTunnel({ ...valid, proxyPort: 0 }), /port/);
});

test('CLI stdout contains only tunnel bytes and exits when the stream closes', { timeout: 5000 }, async (t) => {
  const options = await mockProxy(t, (socket) => socket.once('data', () => {
    socket.write('HTTP/1.1 200 OK\r\n\r\n');
    socket.on('data', (payload) => socket.write(payload));
  }));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./ssh-proxy.mjs', import.meta.url)),
    '--proxy-host', options.proxyHost, '--proxy-port', String(options.proxyPort),
    '--target-host', options.targetHost, '--target-port', String(options.targetPort)],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const output = []; const diagnostics = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => diagnostics.push(chunk));
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code) => resolve(code));
  });
  const payload = Buffer.from([0, 255, 128, 10, 13]);
  child.stdin.end(payload);
  assert.equal(await exited, 0, Buffer.concat(diagnostics).toString());
  assert.deepEqual(Buffer.concat(output), payload);
  assert.equal(Buffer.concat(diagnostics).length, 0);
});
