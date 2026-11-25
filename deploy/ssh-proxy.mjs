import { createConnection } from 'node:net';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// OpenSSH owns authentication and host-key verification; this helper carries bytes only.
export function connectHttpTunnel({ proxyHost, proxyPort, targetHost, targetPort, timeoutMs = 15000 }) {
  for (const host of [proxyHost, targetHost]) {
    if (typeof host !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(host)) throw new Error('Invalid proxy or target hostname.');
  }
  for (const port of [proxyPort, targetPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid proxy or target port.');
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: proxyHost, port: proxyPort });
    const timer = setTimeout(() => fail(new Error('HTTP CONNECT proxy handshake timed out.')), timeoutMs);
    let headers = Buffer.alloc(0);
    function cleanup() {
      clearTimeout(timer);
      socket.off('error', fail);
      socket.off('end', closed);
      socket.off('close', closed);
      socket.off('data', onData);
    }
    function fail(error) {
      cleanup();
      socket.destroy();
      reject(error);
    }
    function closed() { fail(new Error('Proxy closed before completing HTTP CONNECT.')); }
    function onData(chunk) {
      headers = Buffer.concat([headers, chunk]);
      const boundary = headers.indexOf('\r\n\r\n');
      if ((boundary < 0 ? headers.length : boundary + 4) > 16384) {
        fail(new Error('HTTP CONNECT response headers exceed 16 KiB.'));
        return;
      }
      if (boundary < 0) return;
      const status = /^HTTP\/1\.[01] (\d{3})(?:[ \r\n]|$)/.exec(headers.toString('latin1', 0, boundary));
      if (!status || Number(status[1]) < 200 || Number(status[1]) >= 300) {
        fail(new Error(`HTTP CONNECT rejected${status ? ` with status ${status[1]}` : ': invalid proxy response'}.`));
        return;
      }
      socket.pause();
      cleanup();
      // A proxy may send the first SSH bytes in the same packet as its HTTP response.
      const remainder = headers.subarray(boundary + 4);
      if (remainder.length) socket.unshift(remainder);
      resolve(socket);
    }
    socket.on('error', fail);
    socket.once('end', closed);
    socket.once('close', closed);
    socket.on('data', onData);
    socket.once('connect', () => {
      const authority = `${targetHost}:${targetPort}`;
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
  });
}

async function main() {
  const { values } = parseArgs({ options: {
    'proxy-host': { type: 'string' }, 'proxy-port': { type: 'string' },
    'target-host': { type: 'string' }, 'target-port': { type: 'string' },
  } });
  const socket = await connectHttpTunnel({
    proxyHost: values['proxy-host'], proxyPort: Number(values['proxy-port']),
    targetHost: values['target-host'], targetPort: Number(values['target-port']),
  });
  function failed(error) {
    process.stderr.write(`SSH proxy: ${error.message}\n`);
    process.exitCode = 1;
    socket.destroy();
    process.stdin.destroy();
  }
  socket.on('error', failed);
  process.stdin.on('error', failed);
  process.stdout.on('error', failed);
  socket.once('close', () => {
    process.stdin.unpipe(socket);
    process.stdin.destroy();
  });
  socket.pipe(process.stdout);
  process.stdin.pipe(socket);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`SSH proxy: ${error.message}\n`);
    process.exitCode = 1;
  });
}
