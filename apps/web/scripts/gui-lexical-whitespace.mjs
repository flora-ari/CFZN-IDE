import { createHash } from 'node:crypto';
import ts from 'typescript';

const hash = value => createHash('sha256').update(value).digest('hex');
const isDoc = node => node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
const isLegal = text => /^\/\*!|@license|@preserve|copyright|copyleft|SPDX|licen[cs]e[ds]?\b/i.test(text);

function readFactory(text) {
  const source = `[${text}]`;
  const file = ts.createSourceFile('factory.js', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  if (file.parseDiagnostics.length || file.statements.length !== 1 || !ts.isExpressionStatement(file.statements[0]) ||
    !ts.isArrayLiteralExpression(file.statements[0].expression) || file.statements[0].expression.elements.length !== 1) {
    throw new Error('Invalid GUI factory syntax.');
  }
  let factory = file.statements[0].expression.elements[0];
  while (ts.isParenthesizedExpression(factory)) factory = factory.expression;
  if (!ts.isFunctionExpression(factory)) throw new Error('Unsupported GUI factory expression.');
  const tokens = [];
  function visit(node) {
    if (isDoc(node)) return;
    if (ts.isToken(node)) {
      const start = node.getStart(file), end = node.end;
      if (end > start) tokens.push({ start: start - 1, end: end - 1, kind: node.kind, text: source.slice(start, end) });
      return;
    }
    node.getChildren(file).forEach(visit);
  }
  visit(factory);
  return { file, factory, tokens };
}

function signature(read) {
  const lexemes = read.tokens.map(token => [token.kind, token.text]);
  const identifiers = read.tokens.filter(token => token.kind === ts.SyntaxKind.Identifier).map(token => token.text);
  function tokensFor(node) {
    if (!node) return [];
    const start = node.getStart(read.file) - 1, end = node.end - 1;
    let low = 0, high = read.tokens.length;
    while (low < high) { const middle = (low + high) >>> 1; if (read.tokens[middle].start < start) low = middle + 1; else high = middle; }
    const values = [];
    for (let index = low; index < read.tokens.length && read.tokens[index].end <= end; index++) values.push(read.tokens[index].text);
    return values;
  }
  const functions = [], structure = [];
  function visit(node) {
    if (isDoc(node)) return;
    structure.push(node.kind);
    if (ts.isFunctionLike(node)) functions.push({ kind: node.kind, name: tokensFor(node.name), parameters: node.parameters.map(tokensFor) });
    ts.forEachChild(node, visit);
    structure.push(-1);
  }
  visit(read.factory);
  return { tokensSHA256: hash(JSON.stringify(lexemes)), identifiersSHA256: hash(JSON.stringify(identifiers)),
    functionsSHA256: hash(JSON.stringify(functions)), astSHA256: hash(structure.join(',')),
    tokens: lexemes.length, identifiers: identifiers.length, functions: functions.length };
}

export function auditGuiFactory(text) { return signature(readFactory(text)); }

function printWhitespace(text, tokens, preserveLineBreaks) {
  const trivia = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard);
  const pair = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard);
  function canJoin(left, right) {
    if (!left || !right) return true;
    if (left.text.length + right.text.length > 256) return false;
    pair.setText(left.text + right.text);
    pair.scan(); if (pair.getTokenText() !== left.text) return false;
    pair.scan(); if (pair.getTokenText() !== right.text) return false;
    return pair.scan() === ts.SyntaxKind.EndOfFileToken;
  }
  function gap(value, left, right) {
    if (!value) return '';
    const lineBreak = /[\r\n\u2028\u2029]/.test(value);
    const comments = [];
    let lineComment = false;
    trivia.setText(value);
    for (let kind = trivia.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = trivia.scan()) {
      if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        const comment = trivia.getTokenText();
        if (isLegal(comment)) { comments.push(comment); if (kind === ts.SyntaxKind.SingleLineCommentTrivia) lineComment = true; }
      } else if (kind !== ts.SyntaxKind.WhitespaceTrivia && kind !== ts.SyntaxKind.NewLineTrivia) {
        throw new Error('Unaccounted GUI source token.');
      }
    }
    if (comments.length) {
      const separator = preserveLineBreaks && lineBreak ? '\n' : ' ';
      return ' ' + comments.join(lineComment ? '\n' : separator) + (lineComment || preserveLineBreaks && lineBreak ? '\n' : ' ');
    }
    if (preserveLineBreaks && lineBreak) return '\n';
    return canJoin(left, right) ? '' : ' ';
  }
  const pieces = []; let position = 0, previous;
  for (const token of tokens) {
    if (token.start < position) throw new Error('Overlapping GUI source tokens.');
    pieces.push(gap(text.slice(position, token.start), previous, token), token.text);
    position = token.end; previous = token;
  }
  pieces.push(gap(text.slice(position), previous, undefined));
  return pieces.join('');
}

export function compactGuiFactory(text, notices = []) {
  const original = readFactory(text), expected = signature(original);
  for (const preserveLineBreaks of [false, true]) {
    try {
      const candidate = printWhitespace(text, original.tokens, preserveLineBreaks);
      if (notices.some(notice => candidate.split(notice).length < text.split(notice).length)) throw new Error('GUI legal notice lost.');
      const actual = auditGuiFactory(candidate);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('GUI token, identifier, function signature or AST changed.');
      return candidate;
    } catch (error) { if (preserveLineBreaks) throw error; }
  }
  throw new Error('GUI whitespace contraction failed.');
}
