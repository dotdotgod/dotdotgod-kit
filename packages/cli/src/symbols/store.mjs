import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fingerprint } from '../index/files.mjs';
import { sourceFiles, outlinePolicy as policy } from './discovery.mjs';
export { sourceFiles } from './discovery.mjs';
import { textFingerprint } from '../query/chunks.mjs';
import { EXTRACTOR_ID, languageForPath } from './languages.mjs';

export const OUTLINE_SCHEMA = 1;
export const outlinePath = (root) => join(root, '.dotdotgod', 'outlines.json');
function assertCachePath(root) {
  for (const path of [dirname(outlinePath(root)), outlinePath(root)]) {
    let stat;
    try { stat = lstatSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw new Error(`Outline cache must not use symlinks: ${path}`);
  }
}
export function readOutlines(root) {
  try {
    assertCachePath(root);
    const index = JSON.parse(readFileSync(outlinePath(root), 'utf8'));
    if (index.schema !== OUTLINE_SCHEMA || index.extractor !== EXTRACTOR_ID || !Array.isArray(index.files)) return null;
    const paths = new Set(); const ids = new Set();
    for (const file of index.files) {
      if (typeof file.path !== 'string' || file.path.startsWith('/') || file.path.split('/').includes('..') || paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.hash)) return null;
      if (!Number.isInteger(file.sourceLength) || file.sourceLength < 0 || !Number.isInteger(file.lineCount) || file.lineCount < 1) return null;
      if (file.language !== languageForPath(file.path) || ((file.language === null) !== (file.status === 'unsupported'))) return null;
      paths.add(file.path);
      if (!['parsed', 'partial', 'unsupported', 'failed'].includes(file.status) || !Array.isArray(file.symbols) || !Array.isArray(file.imports)) return null;
      if (file.imports.some((item) => typeof item.specifier !== 'string' || !Number.isInteger(item.line) || item.line < 1)) return null;
      for (const symbol of file.symbols) {
        if (symbol.path !== file.path || typeof symbol.id !== 'string' || !symbol.id.startsWith(`symbol:${file.path}#`) || ids.has(symbol.id) || typeof symbol.signature !== 'string' || typeof symbol.documentation !== 'string') return null;
        if (!Number.isInteger(symbol.startLine) || !Number.isInteger(symbol.endLine) || symbol.startLine < 1 || symbol.endLine < symbol.startLine || symbol.endLine > file.lineCount) return null;
        if (typeof symbol.name !== 'string' || typeof symbol.qualifiedName !== 'string' || !Number.isInteger(symbol.declarationStartLine) || symbol.declarationStartLine < symbol.startLine || symbol.declarationStartLine > symbol.endLine) return null;
        if ((symbol.bodyStartLine === null) !== (symbol.bodyEndLine === null)) return null;
        if (symbol.bodyStartLine !== null && (!Number.isInteger(symbol.bodyStartLine) || !Number.isInteger(symbol.bodyEndLine) || symbol.bodyStartLine < symbol.declarationStartLine || symbol.bodyEndLine > symbol.endLine || symbol.bodyEndLine < symbol.bodyStartLine)) return null;
        if (!Number.isInteger(symbol.declarationStartOffset) || !Number.isInteger(symbol.declarationEndOffset) || symbol.declarationStartOffset < 0 || symbol.declarationEndOffset < symbol.declarationStartOffset || symbol.declarationEndOffset > file.sourceLength) return null;
        if ((symbol.bodyStartOffset === null) !== (symbol.bodyEndOffset === null)) return null;
        if (symbol.bodyStartOffset !== null && (!Number.isInteger(symbol.bodyStartOffset) || !Number.isInteger(symbol.bodyEndOffset) || symbol.bodyStartOffset < symbol.declarationStartOffset || symbol.bodyEndOffset > symbol.declarationEndOffset || symbol.bodyEndOffset < symbol.bodyStartOffset)) return null;
        ids.add(symbol.id);
      }
    }
    for (const file of index.files) for (const symbol of file.symbols) if (symbol.ownerId !== null && !ids.has(symbol.ownerId)) return null;
    return index;
  } catch { return null; }
}
export function outlineStatus(root) {
  assertCachePath(root);
  const files = sourceFiles(root);
  const index = readOutlines(root);
  if (!index) return { ok: files.length === 0 && !existsSync(outlinePath(root)), reason: existsSync(outlinePath(root)) ? 'missing-or-invalid' : 'missing', paths: files.map((file) => file.path) };
  const old = new Map(index.files.map((file) => [file.path, file]));
  const current = new Set(files.map((file) => file.path));
  const changed = files.filter((file) => old.get(file.path)?.hash !== file.hash || old.get(file.path)?.sourceLength !== file.sourceLength || old.get(file.path)?.lineCount !== file.lineCount).map((file) => file.path);
  const removed = [...old.keys()].filter((path) => !current.has(path));
  const failures = index.files.filter((file) => ['failed', 'partial'].includes(file.status)).map((file) => file.path);
  const policyOk = index.policy === policy(root);
  return { ok: policyOk && !changed.length && !removed.length && !failures.length, reason: !policyOk ? 'policy-changed' : failures.length ? 'extraction-incomplete' : changed.length || removed.length ? 'source-changed' : 'fresh', paths: [...new Set([...changed, ...removed, ...failures])], unsupported: index.files.filter((file) => file.status === 'unsupported').map((file) => file.path) };
}
export async function buildOutlines(root) {
  assertCachePath(root);
  const files = sourceFiles(root);
  const old = readOutlines(root);
  const previous = new Map(old?.policy === policy(root) ? old.files.map((file) => [file.path, file]) : []);
  let parsed = 0; let reused = 0;
  const records = [];
  for (const file of files) {
    const cached = previous.get(file.path);
    if (cached?.hash === file.hash && ['parsed', 'unsupported'].includes(cached.status)) { records.push(cached); reused += 1; continue; }
    if (!file.language) { records.push({ ...file, status: 'unsupported', symbols: [], imports: [] }); continue; }
    const { extractSymbols } = await import('./parser.mjs');
    const source = readFileSync(join(root, file.path), 'utf8');
    const extracted = await extractSymbols(file.path, source, file.language);
    if (fingerprint(join(root, file.path)) !== file.hash) throw new Error(`Source changed during outline extraction: ${file.path}`);
    records.push({ ...file, ...extracted }); parsed += 1;
  }
  const index = { schema: OUTLINE_SCHEMA, extractor: EXTRACTOR_ID, policy: policy(root), files: records, refresh: { parsed, reused } };
  const target = outlinePath(root);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, JSON.stringify(index), { flag: 'wx' }); renameSync(temporary, target);
  return index;
}
export function outlineChunks(index) {
  // ponytail: one passage per symbol; split long comments if provider input limits dominate.
  return index.files.flatMap((file) => file.symbols.map((symbol) => {
    const text = `${symbol.signature}\n${symbol.documentation}`.trim();
    const passage = `Path: ${file.path}\nSymbol: ${symbol.qualifiedName}\nKind: ${symbol.kind}\n\n${text}`;
    return { ...symbol, kind: 'symbol', symbolKind: symbol.kind, heading: symbol.qualifiedName, text, passage, sourceHash: file.hash, fingerprint: textFingerprint(passage) };
  }));
}
