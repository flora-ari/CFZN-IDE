import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Script } from 'node:vm';
import ts from 'typescript';
import { compactGuiFactory, auditGuiFactory } from './gui-lexical-whitespace.mjs';
export { compactGuiFactory, auditGuiFactory } from './gui-lexical-whitespace.mjs';

const reference = JSON.parse(readFileSync(new URL('../evidence/mindplus-parity-v07/upstream-byte-comparison.json', import.meta.url), 'utf8'));
export const guiProtection = { vm: reference.vm, blockly: reference.blockly };
export const guiOptimizerInputs = {
  algorithm: 'original-ast-token-whitespace-v2', typescript: ts.version,
  modules: 1959, skip: [237, 435, 520, 1169, 1958],
  options: { minifyWhitespace: true, minifyIdentifiers: false, minifySyntax: false,
    originalTokenText: true, preserveLegalComments: true, verifyAllFunctionSignatures: true, verifyAST: true },
  protection: guiProtection,
};
const sha = value => createHash('sha256').update(value).digest('hex');
const unwrap = node => ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

function parse(text) {
  const file = ts.createSourceFile('gui.js', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length) throw new Error('GUI JavaScript parse failed.');
  return file;
}

// AST array slots identify the OUTER table. Numeric comments inside 237/435 are never entries here.
export function topLevelGuiModules(text, count = guiOptimizerInputs.modules) {
  const file = parse(text), tables = [];
  function visit(node) {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === count) { tables.push(node); return; }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (tables.length !== 1) throw new Error('Expected exactly one pinned GUI module table.');
  const table = tables[0];
  const modules = table.elements.map((element, id) => {
    const leadingEnd = ts.isOmittedExpression(element) ? table.elements[id + 1]?.pos ?? table.end : element.getStart(file);
    const leading = text.slice(element.pos, leadingEnd);
    const marker = `/* ${id} */`;
    const offset = leading.indexOf(marker);
    if (offset < 0 || leading.indexOf(marker, offset + marker.length) >= 0) throw new Error(`GUI slot ${id} marker mismatch.`);
    const factory = unwrap(element);
    return { id, start: element.pos + offset, end: element.end,
      factory: ts.isFunctionExpression(factory) ? factory : undefined, file };
  });
  for (let index = 0; index < modules.length; index++) modules[index].chunkEnd = modules[index + 1]?.start ?? modules[index].end;
  return modules;
}

function checkProtection(text, modules) {
  for (const [group, expected] of [['vm', 178], ['blockly', 15]]) {
    if (guiProtection[group].length !== expected) throw new Error(`GUI ${group} protection count changed.`);
    for (const item of guiProtection[group]) {
      const module = modules[Number(item.id)];
      if (!module || sha(text.slice(module.start, module.chunkEnd)) !== item.sha256) {
        throw new Error(`GUI protected ${group} module ${item.id} bytes changed.`);
      }
    }
  }
}

export async function optimizeGui(legacy) {
  const modules = topLevelGuiModules(legacy);
  checkProtection(legacy, modules);
  const protectedIds = new Set([...guiProtection.vm, ...guiProtection.blockly].map(item => Number(item.id)));
  const skip = new Set([...protectedIds, ...guiOptimizerInputs.skip]);
  const edits = [], skipped = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < modules.length) {
      const module = modules[cursor++];
      if (skip.has(module.id)) continue;
      const factory = module.factory;
      if (!factory) { skipped.push({ id: module.id, reason: 'unsupported factory' }); continue; }
      const start = factory.getStart(module.file), end = factory.end;
      try {
        const compact = compactGuiFactory(legacy.slice(start, end));
        edits.push({ id: module.id, start, end, text: compact });
      } catch (error) { skipped.push({ id: module.id, reason: error.message }); }
    }
  }));
  let position = 0;
  const pieces = [];
  for (const edit of edits.sort((a, b) => a.start - b.start)) {
    pieces.push(legacy.slice(position, edit.start), edit.text); position = edit.end;
  }
  pieces.push(legacy.slice(position));
  // This directive is outside the module array. Its old offsets cannot describe the fast file.
  const code = pieces.join('').replace(/\n\/\/# sourceMappingURL=openblock-gui\.js\.map\s*$/, '\n');
  new Script(code);
  const optimizedModules = topLevelGuiModules(code);
  checkProtection(code, optimizedModules);
  for (const id of skip) {
    const a = modules[id], b = optimizedModules[id];
    if (legacy.slice(a.start, a.chunkEnd) !== code.slice(b.start, b.chunkEnd)) throw new Error(`Skipped GUI module ${id} changed.`);
  }
  let verifiedFactories = 0, verifiedFunctions = 0, verifiedIdentifiers = 0;
  for (const module of modules) {
    if (skip.has(module.id) || !module.factory) continue;
    const current = optimizedModules[module.id];
    const before = auditGuiFactory(legacy.slice(module.factory.getStart(module.file), module.factory.end));
    const after = auditGuiFactory(code.slice(current.factory.getStart(current.file), current.factory.end));
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`GUI module ${module.id} lexical/AST audit failed.`);
    verifiedFactories++; verifiedFunctions += before.functions; verifiedIdentifiers += before.identifiers;
  }
  const digest = sha(code);
  return { code, metadata: {
    url: `/openblock-vendor/openblock-gui.${digest.slice(0, 16)}.js`, sha256: digest,
    bytes: Buffer.byteLength(code), gzipBytes: gzipSync(code, { level: 6 }).length,
    legacySha256: sha(legacy), legacyBytes: Buffer.byteLength(legacy), legacyGzipBytes: gzipSync(legacy, { level: 6 }).length,
    changedModules: edits.length, skipped: skipped.sort((a, b) => a.id - b.id),
    audit: { verifiedFactories, verifiedFunctions, verifiedIdentifiers, tokenTextAndASTIdentical: true },
    protectedModules: { vm: 178, blockly: 15 }, preserved: guiOptimizerInputs.skip,
  } };
}
