import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readMemoryConfig } from "../memory/config.mjs";
import { codePaths, containedStat, gitChanges, inspectFile, pathEligibility, sameStat } from "../storage/change-detector.mjs";
import { indexPath, openReadOnly, openWriter } from "../storage/index-store.mjs";
import { outlinePolicy as policy } from "./discovery.mjs";
import { parserIdentity } from "./runtime.mjs";
export { sourceFiles } from "./discovery.mjs";
import { textFingerprint } from "../query/chunks.mjs";
import { EXTRACTOR_ID, languageForPath } from "./languages.mjs";

export const OUTLINE_SCHEMA = 1;
export const outlinePath = (root) => join(root, ".dotdotgod", "outlines.json");
function assertCachePath(root) {
  for (const path of [dirname(outlinePath(root)), outlinePath(root)]) {
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (stat && !(path === outlinePath(root) ? stat.isFile() : stat.isDirectory()))
      throw new Error(`Outline cache must not use symlinks or special files: ${path}`);
  }
}
export function readLegacyOutlines(root) {
  try {
    assertCachePath(root);
    const index = JSON.parse(readFileSync(outlinePath(root), "utf8"));
    if (
      index.schema !== OUTLINE_SCHEMA ||
      index.extractor !== EXTRACTOR_ID ||
      !Array.isArray(index.files)
    )
      return null;
    const paths = new Set();
    const ids = new Set();
    for (const file of index.files) {
      if (
        typeof file.path !== "string" ||
        file.path.startsWith("/") ||
        file.path.split("/").includes("..") ||
        paths.has(file.path) ||
        !/^[a-f0-9]{64}$/.test(file.hash)
      )
        return null;
      if (
        !Number.isInteger(file.sourceLength) ||
        file.sourceLength < 0 ||
        !Number.isInteger(file.lineCount) ||
        file.lineCount < 1
      )
        return null;
      if (
        file.language !== languageForPath(file.path) ||
        (file.language === null) !== (file.status === "unsupported")
      )
        return null;
      paths.add(file.path);
      if (
        !["parsed", "partial", "unsupported", "failed"].includes(file.status) ||
        !Array.isArray(file.symbols) ||
        !Array.isArray(file.imports)
      )
        return null;
      if (
        file.imports.some(
          (item) =>
            typeof item.specifier !== "string" ||
            !Number.isInteger(item.line) ||
            item.line < 1,
        )
      )
        return null;
      for (const symbol of file.symbols) {
        if (
          symbol.path !== file.path ||
          typeof symbol.id !== "string" ||
          !symbol.id.startsWith(`symbol:${file.path}#`) ||
          ids.has(symbol.id) ||
          typeof symbol.kind !== "string" ||
          typeof symbol.signature !== "string" ||
          typeof symbol.documentation !== "string"
        )
          return null;
        if (
          !Number.isInteger(symbol.startLine) ||
          !Number.isInteger(symbol.endLine) ||
          symbol.startLine < 1 ||
          symbol.endLine < symbol.startLine ||
          symbol.endLine > file.lineCount
        )
          return null;
        if (
          typeof symbol.name !== "string" ||
          typeof symbol.qualifiedName !== "string" ||
          !Number.isInteger(symbol.declarationStartLine) ||
          symbol.declarationStartLine < symbol.startLine ||
          symbol.declarationStartLine > symbol.endLine
        )
          return null;
        if ((symbol.bodyStartLine === null) !== (symbol.bodyEndLine === null))
          return null;
        if (
          symbol.bodyStartLine !== null &&
          (!Number.isInteger(symbol.bodyStartLine) ||
            !Number.isInteger(symbol.bodyEndLine) ||
            symbol.bodyStartLine < symbol.declarationStartLine ||
            symbol.bodyEndLine > symbol.endLine ||
            symbol.bodyEndLine < symbol.bodyStartLine)
        )
          return null;
        if (
          !Number.isInteger(symbol.declarationStartOffset) ||
          !Number.isInteger(symbol.declarationEndOffset) ||
          symbol.declarationStartOffset < 0 ||
          symbol.declarationEndOffset < symbol.declarationStartOffset ||
          symbol.declarationEndOffset > file.sourceLength
        )
          return null;
        if (
          (symbol.bodyStartOffset === null) !==
          (symbol.bodyEndOffset === null)
        )
          return null;
        if (
          symbol.bodyStartOffset !== null &&
          (!Number.isInteger(symbol.bodyStartOffset) ||
            !Number.isInteger(symbol.bodyEndOffset) ||
            symbol.bodyStartOffset < symbol.declarationStartOffset ||
            symbol.bodyEndOffset > symbol.declarationEndOffset ||
            symbol.bodyEndOffset < symbol.bodyStartOffset)
        )
          return null;
        ids.add(symbol.id);
      }
    }
    for (const file of index.files)
      for (const symbol of file.symbols)
        if (symbol.ownerId !== null && !ids.has(symbol.ownerId)) return null;
    return index;
  } catch {
    return null;
  }
}
export function outlineRecord(store, file) {
  return { path: file.path, hash: file.sha256, language: file.language, sourceLength: file.source_length,
    lineCount: file.line_count, status: file.status, symbols: store.symbols(file.path), imports: JSON.parse(file.imports_json) };
}

function storedOutlines(store) {
  const policy = store.meta('outline_policy');
  return policy ? { schema: OUTLINE_SCHEMA, extractor: EXTRACTOR_ID, policy,
    files: store.files('code').map((file) => outlineRecord(store, file)) } : null;
}

export function readOutlines(root) {
  const store = openReadOnly(root);
  if (!store) return existsSync(indexPath(root)) ? null : readLegacyOutlines(root);
  try { return storedOutlines(store); }
  finally { store.close(); }
}

function eligibleSourceFiles(root, config) {
  const allowed = pathEligibility(root, config, 'outline');
  return codePaths(root, config).filter((path) => allowed(path, 'code'));
}

export function outlineStatus(root) {
  assertCachePath(root);
  const config = readMemoryConfig(root);
  // Validation hashes independently: unlike refresh it verifies freshness even after stat-preserving edits.
  const files = eligibleSourceFiles(root, config).map((path) => inspectFile(root, path, null, { code: true })).filter(Boolean);
  const index = readOutlines(root);
  if (!index)
    return {
      ok: files.length === 0 && !existsSync(outlinePath(root)),
      reason: existsSync(outlinePath(root)) ? "missing-or-invalid" : "missing",
      paths: files.map((file) => file.path),
    };
  const old = new Map(index.files.map((file) => [file.path, file]));
  const current = new Set(files.map((file) => file.path));
  const changed = files
    .filter(
      (file) =>
        old.get(file.path)?.hash !== file.hash ||
        old.get(file.path)?.sourceLength !== file.sourceLength ||
        old.get(file.path)?.lineCount !== file.lineCount,
    )
    .map((file) => file.path);
  const removed = [...old.keys()].filter((path) => !current.has(path));
  const failures = index.files
    .filter((file) => ["failed", "partial"].includes(file.status))
    .map((file) => file.path);
  const policyOk = index.policy === policy(root);
  return {
    ok: policyOk && !changed.length && !removed.length && !failures.length,
    reason: !policyOk
      ? "policy-changed"
      : failures.length
        ? "extraction-incomplete"
        : changed.length || removed.length
          ? "source-changed"
          : "fresh",
    paths: [...new Set([...changed, ...removed, ...failures])],
    unsupported: index.files
      .filter((file) => file.status === "unsupported")
      .map((file) => file.path),
  };
}
export async function buildOutlines(root, { persist = true } = {}) {
  assertCachePath(root);
  const config = readMemoryConfig(root);
  const db = persist ? openWriter(root) : openReadOnly(root);
  const store = db ?? { meta: () => undefined, files: () => [], file: () => undefined };
  const staged = new Map();
  const remove = (path) => persist ? store.deleteFile(path) : staged.set(path, null);
  const save = (path, record) => persist ? store.upsertFile(record, record.symbols, outlineChunks({ files: [record] })) : staged.set(path, record);
  try {
    const allowed = pathEligibility(root, config, 'outline');
    const identity = textFingerprint(JSON.stringify([config.areas, parserIdentity(), EXTRACTOR_ID]));
    const previousPolicy = store.meta('outline_policy');
    const git = gitChanges(root, store);
    const fast = previousPolicy && identity === store.meta('outline_config') && git.paths
      && ![...git.paths].some((path) => path.split('/').at(-1) === '.gitignore');
    const currentPolicy = fast ? previousPolicy : policy(root);
    const old = store.files('code');
    const paths = fast ? git.paths : new Set([...old.map((file) => file.path), ...eligibleSourceFiles(root, config)]);
    let reused = fast ? old.filter((file) => !paths.has(file.path) && ['parsed', 'unsupported'].includes(file.status)).length : 0;
    for (const file of old) if (!['parsed', 'unsupported'].includes(file.status)) paths.add(file.path);
    let parsed = 0;
    for (const path of paths) {
      const cached = store.file(path);
      const reuse = previousPolicy === currentPolicy && ['parsed', 'unsupported'].includes(cached?.status);
      const file = allowed(path, 'code') ? inspectFile(root, path, reuse ? cached : null, { code: true }) : null;
      if (!file) { if (cached?.kind === 'code') remove(path); continue; }
      let record;
      if (reuse && cached.sha256 === file.hash) {
        reused += 1;
        if (sameStat(cached, file)) continue;
        record = { ...outlineRecord(store, cached), ...file };
      } else if (!file.language) record = { ...file, status: 'unsupported', symbols: [], imports: [] };
      else {
        const { extractSymbols } = await import('./parser.mjs');
        record = { ...file, ...await extractSymbols(path, file.source, file.language) };
        if (!sameStat(file, containedStat(root, path))) throw new Error(`Source changed during outline extraction: ${path}`);
        parsed += 1;
      }
      save(path, record);
    }
    const publish = (writer) => {
      for (const [path, record] of staged) {
        if (!record) writer.deleteFile(path);
        else {
          if (!sameStat(record, containedStat(root, path))) throw new Error(`Source changed during outline extraction: ${path}`);
          writer.upsertFile(record, record.symbols, outlineChunks({ files: [record] }));
        }
      }
      writer.transaction(() => {
        writer.setMeta('outline_policy', currentPolicy);
        writer.setMeta('outline_count', String(writer.sql('SELECT count(*) AS count FROM files WHERE kind=?').get('code').count));
        writer.setMeta('outline_config', identity);
        writer.setMeta('last_git_head', git.head ?? '');
        writer.setMeta('last_git_dirty', JSON.stringify(git.dirty ?? []));
      });
    };
    const refresh = { parsed, reused };
    if (persist) { publish(store); return { ...storedOutlines(store), refresh }; }
    const files = new Map(old.map((file) => [file.path, outlineRecord(store, file)]));
    for (const [path, record] of staged) {
      if (!record) files.delete(path);
      else {
        const { source, mtime_ms, size, ino, ...outline } = record;
        files.set(path, outline);
      }
    }
    return { files: [...files.values()], refresh, publish };
  } finally { db?.close(); }
}
export function outlineChunks(index) {
  return index.files.flatMap((file) =>
    file.symbols.map((symbol) => {
      const text = `${symbol.signature}\n${symbol.documentation}`.trim();
      const passage = `Path: ${file.path}\nSymbol: ${symbol.qualifiedName}\nKind: ${symbol.kind}\n\n${text}`;
      return {
        ...symbol,
        kind: "symbol",
        symbolKind: symbol.kind,
        heading: symbol.qualifiedName,
        text,
        passage,
        sourceHash: file.hash,
        fingerprint: textFingerprint(passage),
      };
    }),
  );
}
