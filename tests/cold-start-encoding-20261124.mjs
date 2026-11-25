// Prepared verifier. Run only after the coordinator supplies a dedicated final encoding endpoint.
// No server startup, browser automation, device access or automatic target discovery.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { isIP } from 'node:net';

assert.ok(process.env.COLD_ENCODING_URL && process.env.COLD_CANDIDATE_WEB_DIR, 'Await frozen delivery: explicit COLD_ENCODING_URL and COLD_CANDIDATE_WEB_DIR are required.');
const target = new URL(process.env.COLD_ENCODING_URL), directory = resolve(process.env.COLD_CANDIDATE_WEB_DIR);
assert.ok(['http:', 'https:'].includes(target.protocol)); assert.match(target.pathname, /^\/openblock-vendor\/openblock-gui\.[0-9a-f]{16}\.js$/); assert.equal(target.search, '');
const identity = await readFile(join(directory, target.pathname.slice(1))), sha = b => createHash('sha256').update(b).digest('hex');
assert.equal(target.pathname.match(/\.([0-9a-f]{16})\.js$/)[1], sha(identity).slice(0, 16));
const connectIP = process.env.COLD_ENCODING_CONNECT_IP;
if (connectIP) assert.ok(isIP(connectIP), 'COLD_ENCODING_CONNECT_IP must be a literal IP, never a hostname');
const lookup = connectIP ? (hostname, options, callback) => {
  if (typeof options === 'function') { callback = options; options = {}; }
  assert.equal(hostname, target.hostname, 'connect override is limited to the supplied URL host');
  const answer = { address: connectIP, family: isIP(connectIP) };
  queueMicrotask(() => options?.all ? callback(null, [answer]) : callback(null, answer.address, answer.family));
} : undefined;
const report = { date: '2026-11-24', target: target.href, connectIP: connectIP ?? null, tlsHostnameVerification: 'default certificate verification retained; URL Host and SNI unchanged', client: 'raw node:http/https; no automatic response decompression', cases: [] };
function request(method, acceptEncoding, extra = {}, path = target.pathname) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, target), agent = url.protocol === 'https:' ? https : http;
    const req = agent.request(url, { method, ...(lookup ? { lookup } : {}), ...(url.protocol === 'https:' ? { servername: url.hostname, rejectUnauthorized: true } : {}), headers: { ...(acceptEncoding !== undefined ? { 'Accept-Encoding': acceptEncoding } : {}), ...extra } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('encoding fixture response timeout'))); req.on('error', reject); req.end();
  });
}
const cases = [
  { name: 'explicit br only', header: 'br, gzip;q=0, identity;q=0', encoding: 'br' },
  { name: 'case and whitespace', header: ' BR ; Q=1.000 , gzip ; q=0 , identity ; q=0 ', encoding: 'br' },
  { name: 'minimum positive legal br q', header: 'br;q=0.001, gzip;q=0, identity;q=0', encoding: 'br' },
  { name: 'documented server preference among positive q values', header: 'br;q=0.1, gzip;q=1, identity;q=1', encoding: 'br' },
  { name: 'gzip only', header: 'gzip, br;q=0, identity;q=0', encoding: 'gzip' },
  { name: 'identity only', header: 'identity, br;q=0, gzip;q=0', encoding: 'identity' },
  { name: 'legal zero br q', header: 'br;q=0.000, gzip;q=1, identity;q=0', encoding: 'gzip' },
  { name: 'exact token rather than substring', header: 'xbr, gzip;q=0, identity;q=1', encoding: 'identity' },
  { name: 'all supported representations rejected', header: 'br;q=0,gzip;q=0,identity;q=0', status: 406 },
  { name: 'zero with one decimal remains zero', header: 'br;q=0.0,gzip;q=0,identity;q=0', status: 406 },
  { name: 'wildcard rejects all', header: '*;q=0', status: 406 },
  { name: 'identity explicitly overrides wildcard rejection', header: '*;q=0,identity;q=1', encoding: 'identity' },
  { name: 'explicit br rejection overrides wildcard acceptance', header: '*;q=1,br;q=0,identity;q=0', encoding: 'gzip' },
  ...['bogus', '.5', '-1', '1.001', '0.1234', '1.0000'].map(q => ({ name: 'invalid br q rejected: ' + q, header: 'br;q=' + q + ',gzip;q=0,identity;q=0', status: 406 })),
];
function safety(response) {
  assert.ok(String(response.headers.vary ?? '').toLowerCase().split(',').map(v => v.trim()).includes('accept-encoding'), 'Vary must include Accept-Encoding');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(response.headers['permissions-policy'], 'serial=(self), usb=(self)', 'existing Permissions-Policy must survive');
}
function encodingOf(response) { return response.headers['content-encoding']?.toLowerCase() ?? 'identity'; }
const validators = new Map();
try {
  for (const item of cases) {
    const response = await request('GET', item.header); safety(response); assert.equal(response.status, item.status ?? 200, item.name);
    if (response.status === 406) assert.equal(response.headers['content-encoding'], undefined, '406 must not claim an encoding');
    else {
      assert.equal(encodingOf(response), item.encoding); assert.match(response.headers['content-type'] ?? '', /(?:application|text)\/javascript/i);
      const decoded = item.encoding === 'br' ? brotliDecompressSync(response.body) : item.encoding === 'gzip' ? gunzipSync(response.body) : response.body; assert.deepEqual(decoded, identity);
      assert.ok(response.headers.etag); if (response.headers['content-length']) assert.equal(Number(response.headers['content-length']), response.body.length);
      if (!validators.has(item.encoding)) validators.set(item.encoding, { etag: response.headers.etag, bytes: response.body.length, header: item.header });
    }
    report.cases.push({ name: item.name, passed: true, status: response.status, encoding: response.headers['content-encoding'] ?? null, transferredBytes: response.body.length });
  }
  assert.equal(validators.size, 3); assert.equal(new Set([...validators.values()].map(v => v.etag)).size, 3, 'each representation needs an independent validator');
  for (const [encoding, data] of validators) {
    const head = await request('HEAD', data.header); safety(head); assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers.etag, data.etag); assert.equal(encodingOf(head), encoding);
    if (head.headers['content-length']) assert.equal(Number(head.headers['content-length']), data.bytes);
    const same = await request('GET', data.header, { 'If-None-Match': data.etag }); safety(same); assert.equal(same.status, 304); assert.equal(same.body.length, 0); assert.equal(same.headers.etag, data.etag);
    if (same.headers['content-encoding']) assert.equal(encodingOf(same), encoding);
    if (same.headers['content-length']) assert.equal(Number(same.headers['content-length']), data.bytes);
    const different = [...validators].find(([other]) => other !== encoding)[1]; const cross = await request('GET', data.header, { 'If-None-Match': different.etag }); assert.equal(cross.status, 200, 'another encoding ETag cannot validate this representation');
    report.cases.push({ name: encoding + ' HEAD, conditional 304 and foreign representation validator', passed: true, etag: data.etag, representationBytes: data.bytes });
  }
  const missing = target.pathname.replace(/\.[0-9a-f]{16}\.js$/, '.0000000000000000.js');
  for (const path of [missing, target.pathname + '.br', target.pathname + '.gz', ...JSON.parse(process.env.COLD_INTERNAL_ENCODING_PATHS_JSON ?? '[]')]) {
    assert.ok(path.startsWith('/')); const response = await request('GET', 'br,gzip', {}, path); assert.ok([403, 404].includes(response.status), 'missing/internal representation must not serve GUI or SPA: ' + path); assert.equal(response.headers['content-encoding'], undefined);
    report.cases.push({ name: 'missing or private representation path', path, passed: true, status: response.status });
  }
  const absent = await request('GET', undefined); assert.equal(absent.status, 200); assert.notEqual(encodingOf(absent), 'br', 'br requires explicit acceptable token');
  report.cases.push({ name: 'absent Accept-Encoding does not implicitly opt into dedicated br', passed: true, encoding: encodingOf(absent) });
} catch (error) { report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { const out = join(import.meta.dirname, 'evidence/cold-start-performance-20261124'); await mkdir(out, { recursive: true }); await writeFile(join(out, 'encoding-http-checks.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ target: report.target, passedCases: report.cases.length, failure: report.failure ?? null }));
