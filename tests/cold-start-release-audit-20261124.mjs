// Read-only isolation/representation audit. Passing this does not approve GUI semantics or READY performance.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
const root = resolve(import.meta.dirname, '..'), stage = resolve(process.argv[2] || (() => { throw new Error('explicit stage bundle directory required'); })());
const baseline = join(root, 'build/deploy/20261124T081631Z-cfe8ac8d/bundle'), release = basename(dirname(stage));
const sha = v => createHash('sha256').update(v).digest('hex'), read = (base, file) => readFile(join(base, file));
async function files(base, prefix = '') { const result = []; for (const entry of await readdir(join(base, prefix), { withFileTypes: true })) { const file = prefix ? prefix + '/' + entry.name : entry.name; if (entry.isDirectory()) result.push(...await files(base, file)); else { assert.ok(entry.isFile()); result.push(file); } } return result.sort(); }
const html = (await read(stage, 'web/openblock.html')).toString(), matches = [...html.matchAll(/<script\b[^>]*src=["'](\/openblock-vendor\/openblock-gui\.([0-9a-f]{16})\.js)["'][^>]*>/g)];
assert.equal(matches.length, 1); const url = matches[0][1], fastPath = 'web' + url, fast = await read(stage, fastPath); assert.equal(matches[0][2], sha(fast).slice(0, 16));
const before = new Set(await files(baseline)), after = new Set(await files(stage)), same = [], changed = [], representations = [];
const allowed = new Set(['web/index.html', 'web/openblock.html', 'web/openblock-vendor/manifest.json', 'release.json', 'compression.json', fastPath, fastPath + '.br', fastPath + '.gz']);
for (const file of new Set([...before, ...after])) {
  const a = before.has(file) ? await read(baseline, file) : null, b = after.has(file) ? await read(stage, file) : null;
  if (a && b && a.equals(b)) { same.push(file); continue; }
  assert.ok(!file.startsWith('api/'), 'API drift: ' + file); assert.ok(b, 'unexpected removal: ' + file);
  assert.ok(allowed.has(file) || file.startsWith('web/') && file.endsWith('.gz'), 'unexpected isolation change: ' + file);
  changed.push({ file, kind: a ? 'modified' : 'added', sha256: sha(b), bytes: b.length });
}
for (const file of after) if (file.startsWith('web/') && (file.endsWith('.gz') || file.endsWith('.br'))) {
  const extension = file.endsWith('.gz') ? '.gz' : '.br', bytes = await read(stage, file), raw = await read(stage, file.slice(0, -extension.length));
  assert.deepEqual(extension === '.gz' ? gunzipSync(bytes) : brotliDecompressSync(bytes), raw);
  representations.push({ file, bytes: bytes.length, decodedBytes: raw.length });
}
assert.deepEqual(await read(stage, 'web/openblock-vendor/openblock-gui.js'), await read(baseline, 'web/openblock-vendor/openblock-gui.js'));
const normalize = text => text.replace(/>\s+</g, '><').trim();
for (const file of ['web/index.html', 'web/openblock.html']) {
  const prior = (await read(baseline, file)).toString(), now = (await read(stage, file)).toString();
  const stripped = now.replace(/<link\b[^>]*>/g, tag => /\brel=["']preload["']/.test(tag) && tag.includes(url) ? '' : tag).split(url).join('/openblock-vendor/openblock-gui.js');
  assert.equal(normalize(stripped), normalize(prior), 'HTML changed beyond fast URL/preload: ' + file);
}
const baseManifest = JSON.parse((await read(baseline, 'web/openblock-vendor/manifest.json')).toString()), newManifest = JSON.parse((await read(stage, 'web/openblock-vendor/manifest.json')).toString());
const meta = { fastGui: newManifest.fastGui, guiOptimizer: newManifest.guiOptimizer, coldStartPatch: newManifest.coldStartPatch };
for (const key of Object.keys(meta)) delete newManifest[key]; assert.deepEqual(newManifest, baseManifest);
assert.equal(meta.fastGui.sha256, sha(fast)); assert.equal(meta.fastGui.url, url);
const manifest = JSON.parse(await readFile(join(dirname(stage), 'manifest.json'), 'utf8')), archive = join(dirname(stage), 'cfzn-ide.tar.gz'); assert.equal(sha(await readFile(archive)), manifest.sha256);
const result = { date: '2026-11-24', release, stage, baseline, structuralAuditPassed: true, candidateSemanticsAndPerformanceAcceptance: 'separate strict AST/execution/READY checks required; not inferred from an isolation check', fastGui: { url, sha256: sha(fast), bytes: fast.length }, filesBefore: before.size, filesAfter: after.size, identicalFiles: same.length, apiFilesIdentical: same.filter(file => file.startsWith('api/')).length, changed, representationsVerified: representations.length, fastRepresentations: representations.filter(r => r.file.startsWith(fastPath)), legacyUnchanged: true, htmlOnlyFastURLAndPreload: true, vendorManifestOnlyFastMetadata: true, archiveSHA256: manifest.sha256 };
const out = join(root, 'tests/evidence/cold-start-performance-20261124'); await mkdir(out, { recursive: true }); await writeFile(join(out, 'release-isolation-audit-' + release + '.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ...result, changed: changed.map(item => item.file) }, null, 2));
