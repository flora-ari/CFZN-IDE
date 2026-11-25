import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
// @ts-expect-error Shared preparation helper is plain Node ESM.
import { optimizeGui, topLevelGuiModules, compactGuiFactory, auditGuiFactory, guiProtection, guiOptimizerInputs } from '../scripts/optimize-gui.mjs';
// @ts-expect-error Shared preparation helper is plain Node ESM.
import { patchOpenBlock } from '../scripts/openblock-hooks.mjs';
// @ts-expect-error Shared HTML helper is plain Node ESM.
import { injectFastGui, fastGuiUrl } from '../scripts/fast-gui-html.mjs';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

test('AST table slots keep repeated nested Webpack IDs scoped and preserve omitted slots', () => {
  const source = '(function(modules) {})([\n/* 0 */ (function(module) { module.exports = [\n/* 0 */ function nested() {},\n/* 1 */ function second() {}]; }),\n/* 1 */ (function(module) { module.exports = 1; }),\n/* 2 */,\n]);';
  const modules = topLevelGuiModules(source, 3);
  assert.equal(modules.length, 3); assert.equal(modules[0].id, 0); assert.equal(modules[1].id, 1);
  assert.match(source.slice(modules[0].start, modules[0].chunkEnd), /function nested/);
  assert.match(source.slice(modules[1].start, modules[1].chunkEnd), /exports = 1/);
  assert.equal(modules[2].factory, undefined);
  assert.throws(() => topLevelGuiModules('[]; []', 0), /exactly one/);
  assert.throws(() => topLevelGuiModules('const broken = [;', 1), /parse failed/);
  assert.throws(() => topLevelGuiModules(source.replace('/* 1 */ (function(module)', '/* 7 */ (function(module)'), 3), /marker mismatch/);
});

test('whitespace compaction preserves factory/inner names, parameter binding, directives, eval and legal text', async () => {
  const notice = '/* Copyright Example. Licensed under MIT. */';
  const source = `function NamedFactory(module, exports, __webpack_require__) {
    "use strict";
    ${notice}
    const meaningfulName = 7;
    function KeptName(input) { return input + meaningfulName; }
    exports.result = [NamedFactory.name, KeptName.name, KeptName(3), eval('meaningfulName'),
      __webpack_require__('value'), this === module.exports, '/* this string stays intact */'];
  }`;
  const compact = await compactGuiFactory(source, [notice]);
  assert.ok(compact.includes(notice)); assert.ok(compact.length < source.length);
  for (const value of [source, compact]) {
    const factory = runInNewContext(`(${value})`), module = { exports: {} as any };
    assert.equal(factory.name, 'NamedFactory'); assert.equal(factory.length, 3);
    factory.call(module.exports, module, module.exports, () => 'required');
    assert.deepEqual(Array.from(module.exports.result), ['NamedFactory', 'KeptName', 10, 7, 'required', true, '/* this string stays intact */']);
  }
  assert.equal(guiOptimizerInputs.options.minifySyntax, false);
  assert.equal(guiOptimizerInputs.options.minifyIdentifiers, false);
});

test('actual pinned GUI gets a reproducible hash and smaller gzip while every protected/skip module remains exact', async () => {
  const archive = fileURLToPath(new URL('../../../.runtime/upstream/openblock-gui-0.1.0-prerelease.20250611102354.tgz', import.meta.url));
  const original = execFileSync('tar', ['-xOf', archive, 'package/dist/openblock-gui.js'], { maxBuffer: 100 * 1024 * 1024 }).toString();
  const legacy = patchOpenBlock(original), legacyHash = sha(legacy);
  const fast = await optimizeGui(legacy);
  assert.equal(sha(legacy), legacyHash); assert.equal(fast.metadata.legacySha256, legacyHash);
  assert.equal(fast.metadata.sha256, sha(fast.code));
  assert.equal(fast.metadata.url, `/openblock-vendor/openblock-gui.${sha(fast.code).slice(0, 16)}.js`);
  assert.equal(fast.metadata.gzipBytes, gzipSync(fast.code, { level: 6 }).length);
  assert.ok(fast.metadata.bytes < Buffer.byteLength(legacy) * 0.85);
  assert.ok(fast.metadata.gzipBytes < fast.metadata.legacyGzipBytes * 0.86);
  assert.ok(fast.metadata.changedModules > 1700);
  assert.doesNotMatch(fast.code.slice(-150), /sourceMappingURL=/);
  const before = topLevelGuiModules(legacy), after = topLevelGuiModules(fast.code);
  // Regression for the rejected esbuild candidate: all 196 functions in actual slot 3,
  // including duplicate DomListener scopes and d/b parameters, must stay identical.
  const readFactory = (source: string, modules: any[], id: number) => source.slice(modules[id].factory.getStart(modules[id].file), modules[id].factory.end);
  const originalThree = readFactory(legacy, before, 3), fastThree = readFactory(fast.code, after, 3);
  assert.deepEqual(auditGuiFactory(fastThree), auditGuiFactory(originalThree));
  assert.match(fastThree, /undefined\s*&&\s*undefined\.__extends/);
  assert.doesNotMatch(fastThree, /function DomListener2\b/);
  assert.ok(fast.metadata.audit.verifiedFactories > 1700);
  assert.equal(fast.metadata.audit.tokenTextAndASTIdentical, true);
  // Independently enumerate token trivia, including the IIFE/empty-parameter boundaries
  // skipped by a node-only traversal, and require every legal occurrence verbatim.
  const legal = new Map<number, string>(), file = before[0].file;
  function collect(position: number, trailing = false) {
    for (const range of (trailing ? ts.getTrailingCommentRanges(legacy, position) : ts.getLeadingCommentRanges(legacy, position)) ?? []) {
      const text = legacy.slice(range.pos, range.end);
      if (/^\/\*!|@license|@preserve|copyright|copyleft|SPDX|licen[cs]e[ds]?\b/i.test(text)) legal.set(range.pos, text);
    }
  }
  function visit(node: ts.Node) { collect(node.pos); collect(node.end, true); node.getChildren(file).forEach(visit); }
  visit(file);
  assert.ok(legal.size >= 600);
  for (const notice of new Set(legal.values())) {
    assert.ok(fast.code.split(notice).length >= legacy.split(notice).length, `legal notice: ${notice.slice(0, 100)}`);
  }
  const protectedIds = new Set([...guiProtection.vm, ...guiProtection.blockly].map((item: any) => Number(item.id)));
  assert.equal(guiProtection.vm.length, 178); assert.equal(guiProtection.blockly.length, 15);
  for (const id of new Set([...protectedIds, ...guiOptimizerInputs.skip])) {
    assert.equal(sha(legacy.slice(before[id].start, before[id].chunkEnd)), sha(fast.code.slice(after[id].start, after[id].chunkEnd)), `module ${id}`);
  }
  // The immutable source manifest also rejects a valid-JS one-byte change before any minifier work.
  const at = before[34].factory.getStart(before[34].file);
  await assert.rejects(optimizeGui(legacy.slice(0, at) + ' ' + legacy.slice(at)), /protected.*34.*changed/);
});

test('original token printing preserves ASI, regex/template literals and duplicate inner names without folding', () => {
  const source = 'function Factory(module, exports) {\n' +
    ' var __extends = (undefined && undefined.__extends) || function(d, b) { return [d,b]; };\n' +
    ' function DomListener(d, b) { return d + b; }\n' +
    ' function nested() { function DomListener(d, b) { return d - b; } return DomListener(8, 2); }\n' +
    ' function automatic() { return\n /x+/gi.test("xx") }\n' +
    ' let count = 1\n ++count\n' +
    ' const pattern = /[/*]x+\\//gi;\n' +
    ' const template = `raw  spaces\\n${DomListener(1, 2)}`;\n' +
    ' // Copyright A.\n // Copyright B.\n' +
    ' exports.value = [nested(), automatic(), count, pattern.source, template];\n' +
    '}';
  const compact = compactGuiFactory(source);
  assert.deepEqual(auditGuiFactory(compact), auditGuiFactory(source));
  assert.notDeepEqual(auditGuiFactory(source.replace('function DomListener(d, b)', 'function DomListener2(d2, b2)')), auditGuiFactory(source));
  assert.match(compact, /return\n/); assert.ok(compact.includes('/[/*]x+\\//gi'));
  assert.ok(compact.includes('`raw  spaces\\n${'));
  assert.ok(compact.includes('// Copyright A.\n')); assert.ok(compact.includes('// Copyright B.\n'));
  const values = [source, compact].map(code => { const module = { exports: {} as any }; runInNewContext(`(${code})`)(module, module.exports); return Array.from(module.exports.value); });
  assert.deepEqual(values[1], values[0]);
});

test('home preload and editor classic script share the exact hash URL and preserve dependency order', () => {
  const manifest = { fastGui: { sha256: 'a'.repeat(64), url: `/openblock-vendor/openblock-gui.${'a'.repeat(16)}.js` } };
  const home = injectFastGui(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), manifest);
  const editor = injectFastGui(readFileSync(new URL('../openblock.html', import.meta.url), 'utf8'), manifest);
  const url = fastGuiUrl(manifest);
  assert.ok(home.includes(`<link rel="preload" as="script" href="${url}"`));
  assert.ok(editor.includes(`<script src="${url}"></script>`));
  assert.ok(home.indexOf(url) < home.indexOf('/src/main.tsx'));
  assert.ok(editor.indexOf('/react-16.min.js') < editor.indexOf('/react-dom-16.min.js'));
  assert.ok(editor.indexOf("window['react-dom'] = window.ReactDOM") < editor.indexOf(url));
  assert.ok(editor.indexOf(url) < editor.indexOf('/cfzn-extensions/module-loader.js'));
  assert.ok(editor.indexOf(url) < editor.indexOf('/src/openblock.ts'));
  assert.doesNotMatch(editor.match(/<script src="[^\"]*openblock-gui[^\"]*"[^>]*>/)![0], /async|defer|crossorigin/);
  assert.throws(() => fastGuiUrl({}), /invalid prepared/);
  assert.throws(() => fastGuiUrl({ fastGui: { ...manifest.fastGui, url: '/outside.js' } }), /invalid prepared/);
  assert.throws(() => injectFastGui('__CCRAFT_FAST_GUI_URL__ __CCRAFT_FAST_GUI_URL__', manifest), /exactly one/);
});
