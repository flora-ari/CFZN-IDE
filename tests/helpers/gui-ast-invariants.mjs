import { createHash } from 'node:crypto';
const sha = text => createHash('sha256').update(text).digest('hex');

// Raw parser tokens preserve string/regexp/template spelling; AST structure catches ASI changes.
export function guiAstInvariants(ts, file, root, source, printer = ts.createPrinter({ removeComments: true })) {
  const functions = [], identifiers = [], constants = [], notices = new Map();
  const structure = createHash('sha256'), tokens = createHash('sha256'); let tokenCount = 0;
  const print = node => printer.printNode(ts.EmitHint.Unspecified, node, file);
  function comments(position, trailing = false) {
    for (const range of (trailing ? ts.getTrailingCommentRanges(source, position) : ts.getLeadingCommentRanges(source, position)) ?? []) {
      const text = source.slice(range.pos, range.end);
      if (/^\/\*!|@license|@preserve|copyright|copyleft|SPDX|licen[cs]e[ds]?\b/i.test(text)) notices.set(range.pos, text);
    }
  }
  function semantic(node) {
    structure.update('(' + node.kind + ':');
    if (ts.isFunctionLike(node)) functions.push({ kind: ts.SyntaxKind[node.kind], name: node.name ? print(node.name) : '', parameters: node.parameters.map(print), generator: !!node.asteriskToken, async: !!ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) });
    if (ts.isIdentifier(node)) identifiers.push(String(node.escapedText));
    if (ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) constants.push([ts.SyntaxKind[node.kind], node.text ?? ts.tokenToString(node.kind)]);
    ts.forEachChild(node, semantic); structure.update(')');
  }
  function lexical(node) {
    comments(node.pos); comments(node.end, true);
    // JSDoc subnodes are comment trivia, never executable Identifier/literal tokens.
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (node.statements) { comments(node.statements.pos); comments(node.statements.end); }
    const children = node.getChildren(file);
    if (children.length) children.forEach(lexical);
    else if (node.kind > ts.SyntaxKind.LastTriviaToken && node.kind <= ts.SyntaxKind.LastToken && node.kind !== ts.SyntaxKind.EndOfFileToken) {
      const raw = source.slice(node.getStart(file), node.end); tokens.update(node.kind + ':' + raw.length + ':' + raw + '\0'); tokenCount++;
    }
  }
  semantic(root); lexical(root);
  const legal = new Map(); for (const text of notices.values()) legal.set(text, (legal.get(text) ?? 0) + 1);
  return { functions: sha(JSON.stringify(functions)), identifiers: sha(identifiers.join('\u0000')), constants: sha(JSON.stringify(constants)), astStructure: structure.digest('hex'), rawTokens: tokens.digest('hex'), functionCount: functions.length, constantCount: constants.length, tokenCount, legalNoticeCount: notices.size, legalNotices: sha(JSON.stringify([...legal].sort(([a], [b]) => a.localeCompare(b)))) };
}
