// Preparation/metadata fixture. No browser, HTTP service, serial, build or product mutation.
// Run baseline now; set COLD_CANDIDATE_WEB_DIR only after the coordinator freezes a candidate.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import { guiAstInvariants } from './helpers/gui-ast-invariants.mjs';

const root = resolve(import.meta.dirname, '..');
const baselineDir = join(root, 'build/deploy/20261124T081631Z-cfe8ac8d/bundle/web');
const candidateArgument = process.argv[2] || process.env.COLD_CANDIDATE_WEB_DIR;
const candidateDir = candidateArgument ? resolve(candidateArgument) : undefined;
const out = join(root, 'tests/evidence/cold-start-performance-20261124');
const sha = value => createHash('sha256').update(value).digest('hex');
const rate = 800 * 1024;
const requireWeb = createRequire(join(root, 'apps/web/package.json')), ts = requireWeb('typescript');
const analyses = new Map();
// Independently locate the pinned outer array through AST, never through global numeric comments.
function topLevelModules(source) {
  const ast = ts.createSourceFile('actual-gui.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, 'GUI must parse without recovered syntax errors');
  const candidates = [];
  function locate(node) {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 1959 && ts.isCallExpression(node.parent) && node.parent.arguments[0] === node) candidates.push(node);
    ts.forEachChild(node, locate);
  }
  locate(ast); assert.equal(candidates.length, 1, 'pinned top-level webpack module array must be unique');
  const array = candidates[0], printer = ts.createPrinter({ removeComments: true }), ranges = [], signatures = new Map(), unreliable = [];
  for (const [id, element] of array.elements.entries()) {
    const triviaEnd = element.kind === ts.SyntaxKind.OmittedExpression ? array.elements[id + 1]?.pos ?? array.end - 1 : element.getStart(ast);
    const trivia = source.slice(element.pos, triviaEnd), tags = [...trivia.matchAll(/\/\*\s*(\d+)\s*\*\//g)];
    assert.equal(tags.length, 1, 'one leading top-level marker required for slot ' + id); assert.equal(Number(tags[0][1]), id);
    ranges.push({ id: String(id), start: element.pos + tags[0].index, end: element.end, kind: ts.SyntaxKind[element.kind] });
    let value = element; while (ts.isParenthesizedExpression(value)) value = value.expression;
    if (!ts.isFunctionExpression(value) && element.kind !== ts.SyntaxKind.OmittedExpression) unreliable.push(String(id));
    signatures.set(String(id), guiAstInvariants(ts, ast, element, source, printer));
  }
  assert.equal(ranges[1169].kind, 'OmittedExpression', 'slot 1169 must remain a hole');
  const modules = new Map(ranges.map((range, index) => [range.id, source.slice(range.start, ranges[index + 1]?.start ?? range.end)]));
  return { modules, signatures, unreliable, bootstrapPrefix: source.slice(0, ranges[0].start), bootstrapSuffix: source.slice(ranges.at(-1).end).replace(/\n\/\/# sourceMappingURL=openblock-gui\.js\.map\s*$/, '\n'), emptySlot: ranges[1169].kind, moduleCount: ranges.length, functionCount: [...signatures.values()].reduce((n, s) => n + s.functionCount, 0), legalNoticeCount: [...signatures.values()].reduce((n, s) => n + s.legalNoticeCount, 0), executableTokenCount: [...signatures.values()].reduce((n, s) => n + s.tokenCount, 0) };
}
const exists = async path => { try { await access(path); return true; } catch { return false; } };
const manifest = JSON.parse(await readFile(join(root, 'apps/web/evidence/mindplus-parity-v07/upstream-byte-comparison.json'), 'utf8'));
assert.equal(manifest.vm.length, 178); assert.equal(manifest.blockly.length, 15);
async function inspect(directory, label) {
  let guiURL = '/openblock-vendor/openblock-gui.js';
  if (label === 'candidate') {
    const html = await readFile(join(directory, 'openblock.html'), 'utf8');
    const urls = [...html.matchAll(/<script\b[^>]*\bsrc=["'](\/openblock-vendor\/openblock-gui\.([0-9a-f]{16})\.js)["'][^>]*>/g)];
    assert.equal(urls.length, 1, 'candidate must execute one identity-hash GUI script'); guiURL = urls[0][1];
    assert.equal(sha(await readFile(join(directory, 'openblock-vendor/openblock-gui.js'))), '1bb1133602dfc5044f00404ea246321ad4bec5071a9baa482ec6fa8356ffb0d2', 'legacy GUI must remain unchanged');
  }
  const guiPath = join(directory, guiURL.slice(1)), gui = await readFile(guiPath), source = gui.toString(), analysis = topLevelModules(source), modules = analysis.modules;
  if (label === 'candidate') assert.equal(guiURL.match(/\.([0-9a-f]{16})\.js$/)[1], sha(gui).slice(0, 16), 'URL digest must identify final identity bytes');
  analyses.set(label, analysis);
  // Syntax compilation only; this does not constitute full GUI execution or browser readiness.
  new Script(source, { filename: label + '-openblock-gui.js' });
  for (const part of [...manifest.vm, ...manifest.blockly]) { assert.ok(modules.has(part.id), 'protected module boundary missing: ' + part.id); assert.equal(sha(modules.get(part.id)), part.sha256, 'protected module changed: ' + part.id); }
  const representations = [{ encoding: 'identity', bytes: gui.length, sha256: sha(gui) }];
  for (const [extension, encoding, decode] of [['.gz', 'gzip', gunzipSync], ['.br', 'br', brotliDecompressSync]]) if (await exists(guiPath + extension)) {
    const bytes = await readFile(guiPath + extension); assert.deepEqual(decode(bytes), gui); representations.push({ encoding, bytes: bytes.length, sha256: sha(bytes), decodedSHA256: sha(gui), idealGUITransferSecondsAt800KiBps: bytes.length / rate });
  }
  const documents = [];
  for (const file of ['index.html', 'openblock.html']) {
    const html = await readFile(join(directory, file), 'utf8');
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]), scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);
    const icons = links.filter(tag => /\brel\s*=\s*["']icon["']/i.test(tag)); assert.equal(icons.length, 1);
    const iconURL = icons[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]; assert.ok(iconURL?.startsWith('/'), 'favicon should stay same-origin');
    const bytes = await readFile(join(directory, iconURL.slice(1)));
    documents.push({ file, sha256: sha(html), icon: { tag: icons[0], url: iconURL, bytes: bytes.length, sha256: sha(bytes) }, preloads: links.filter(tag => /preload/i.test(tag)), scripts });
  }
  if (label === 'candidate') {
    const crossorigin = tag => { const value = tag.match(/\bcrossorigin(?:\s*=\s*["']([^"']*)["'])?/i); return value ? (value[1] || 'anonymous').toLowerCase() : null; };
    const executable = documents[1].scripts.filter(tag => tag.includes(guiURL)); assert.equal(executable.length, 1);
    for (const [index, document] of documents.entries()) {
      const preload = document.preloads.filter(tag => /\brel=["']preload["']/i.test(tag) && tag.includes(guiURL));
      assert.equal(preload.length, index === 0 ? 1 : preload.length, 'home must discover exactly one same-URL GUI preload'); assert.ok(preload.length <= 1);
      for (const tag of preload) { assert.match(tag, /\bas=["']script["']/i); assert.equal(crossorigin(tag), crossorigin(executable[0]), 'preload and classic script request modes must agree'); }
    }
  }
  const headerLogo = await readFile(join(directory, 'branding/ccraft-logo.png')), originalFavicon = await readFile(join(directory, 'branding/ccraft-tab-icon.png'));
  assert.equal(sha(headerLogo), 'c927127553d58dcfdb4de6487da3a2c894266d6a78b9de05d3e9535da2d010c2');
  assert.equal(sha(originalFavicon), 'c4375f067f4da96b6fb4b14a6c4ede4df0bb7a440f840e35c9a33680557292cb');
  const licenses = [];
  for (const name of ['LICENSE', 'LICENSE.MIT', 'TRADEMARK']) { const bytes = await readFile(join(directory, 'openblock-vendor', name)); licenses.push({ name, bytes: bytes.length, sha256: sha(bytes) }); }
  return { label, directory, gui: { url: guiURL, rawBytes: gui.length, sha256: sha(gui), moduleCount: modules.size, module520SHA256: sha(modules.get('520')), syntaxCompilationOnly: true, actualExecutionVerified: false, representations }, ast: { locator: 'unique outer CallExpression array, per-slot AST leading marker', modules: analysis.moduleCount, functionCount: analysis.functionCount, legalNoticeCount: analysis.legalNoticeCount, executableTokenCount: analysis.executableTokenCount, empty1169: analysis.emptySlot, unreliableSlots: analysis.unreliable }, protectedModules: { vm: 178, blockly: 15, byteHashesMatch: true }, documents, licenses, originalHeaderAndFaviconPreserved: true };
}
const baseline = await inspect(baselineDir, 'baseline');
assert.equal(baseline.gui.sha256, '1bb1133602dfc5044f00404ea246321ad4bec5071a9baa482ec6fa8356ffb0d2');
const result = { date: '2026-11-24', preparationOnly: !candidateDir, bandwidthBytesPerSecond: rate, metricBoundary: 'transfer estimates are not READY, editable time or LCP', baseline };
try { if (candidateDir) {
  const candidate = await inspect(candidateDir, 'candidate'); assert.deepEqual(candidate.licenses, baseline.licenses);
  result.candidate = candidate;
  assert.deepEqual(candidate.documents.map(d => d.icon), baseline.documents.map(d => d.icon), 'frozen favicon references and original bytes must remain unchanged');
  const before = analyses.get('baseline'), after = analyses.get('candidate');
  assert.equal(after.bootstrapPrefix, before.bootstrapPrefix, 'outer bootstrap prefix changed'); assert.equal(after.bootstrapSuffix, before.bootstrapSuffix, 'outer bootstrap suffix changed beyond removing obsolete source-map offset');
  for (const id of ['520', '237', '435', '1169', '1958', ...before.unreliable]) assert.equal(after.modules.get(id), before.modules.get(id), 'frozen standalone/nested/empty/tail slot changed: ' + id);
  result.bindingOrConstantMismatches = [...before.signatures].filter(([id, signature]) => JSON.stringify(after.signatures.get(id)) !== JSON.stringify(signature)).map(([id, signature]) => ({ module: id, baseline: signature, candidate: after.signatures.get(id) }));
  assert.equal(result.bindingOrConstantMismatches.length, 0, 'AST/signatures/identifiers/constants/raw tokens/license changed; module count=' + result.bindingOrConstantMismatches.length + ', first 20=' + result.bindingOrConstantMismatches.slice(0, 20).map(item => item.module).join(','));
  result.comparison = { rawBytesSaved: baseline.gui.rawBytes - candidate.gui.rawBytes,
    audioModuleByteIdentical: baseline.gui.module520SHA256 === candidate.gui.module520SHA256,
    representations: candidate.gui.representations.map(item => { const before = baseline.gui.representations.find(prior => prior.encoding === item.encoding); return { encoding: item.encoding, baselineBytes: before?.bytes, candidateBytes: item.bytes, bytesSaved: before ? before.bytes - item.bytes : undefined, reductionFraction: before ? 1 - item.bytes / before.bytes : undefined }; }),
    actualColdREADYImprovement: 'requires coordinator browser measurements; never inferred from sizes', regressionExecution: 'pending focused tests and coordinator real GUI checks' };
} } catch (error) { result.passed = false; result.failure = error.stack; process.exitCode = 1; }
if (!result.failure && candidateDir) result.passed = true;
await mkdir(out, { recursive: true });
await writeFile(join(out, candidateDir ? result.failure ? 'metadata-candidate-failure.json' : 'metadata-candidate.json' : 'metadata-baseline.json'), JSON.stringify(result, null, 2));
if (candidateDir && result.candidate) await writeFile(join(out, 'metadata-' + result.candidate.gui.sha256.slice(0, 16) + (result.failure ? '-failure' : '-passed') + '.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ preparationOnly: result.preparationOnly, passed: result.passed ?? null, baselineGUI: result.baseline.gui, candidateGUI: result.candidate?.gui, mismatchCount: result.bindingOrConstantMismatches?.length ?? 0, firstMismatchModules: result.bindingOrConstantMismatches?.slice(0, 20).map(item => item.module), failure: result.failure ?? null }, null, 2));
