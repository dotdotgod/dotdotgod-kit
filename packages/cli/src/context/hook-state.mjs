import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { formatHookError, validateSessionId } from '../primitives.mjs';
export { formatHookError };

const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const PATCH_HEADER_RE = /^\*\*\* (?:Update File|Add File|Delete File|Move to): (.+)$/gm;

export function parseHookInput(raw = readFileSync(0, 'utf8')) {
  const text = String(raw ?? '').trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Hook stdin must be a JSON object.');
  }
  return parsed;
}

export function extractHookSessionId(input) {
  const raw = input?.session_id ?? input?.sessionId ?? input?.conversationId;
  try {
    return validateSessionId(raw);
  } catch {
    return null;
  }
}

export function isInitializedProject(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return false;
  const resolved = resolve(dir);
  try {
    const cfg = lstatSync(join(resolved, 'dotdotgod.config.json'));
    if (!cfg.isSymbolicLink() && cfg.isFile()) return true;
  } catch { /* check .dotdotgod */ }
  try {
    const dot = lstatSync(join(resolved, '.dotdotgod'));
    if (!dot.isSymbolicLink() && dot.isDirectory()) return true;
  } catch { /* not initialized */ }
  return false;
}

export function findInitializedRoot(startDir) {
  if (typeof startDir !== 'string' || !startDir.trim()) return null;
  let current = resolve(startDir);
  const root = parse(current).root;
  while (true) {
    if (isInitializedProject(current)) return current;
    if (current === root) return null;
    current = dirname(current);
  }
}

function containsSegmentPath(base, target) {
  if (target === base) return true;
  const prefix = base.endsWith(sep) ? base : `${base}${sep}`;
  return target.startsWith(prefix);
}

export function selectWorkspaceForPath(workspaces, targetPath) {
  if (!Array.isArray(workspaces) || typeof targetPath !== 'string' || !targetPath.trim()) return null;
  const resolvedTarget = resolve(targetPath);
  let realTarget = null;
  try { realTarget = realpathSync(resolvedTarget); } catch { /* may not exist */ }
  let best = null;
  for (const entry of workspaces) {
    if (typeof entry !== 'string' || !entry.trim()) continue;
    const resolvedWs = resolve(entry);
    let matched = containsSegmentPath(resolvedWs, resolvedTarget);
    if (!matched && realTarget) {
      try { matched = containsSegmentPath(realpathSync(resolvedWs), realTarget); } catch { /* ignore */ }
    }
    if (matched && (!best || resolvedWs.length > best.length)) best = resolvedWs;
  }
  return best;
}

export function parseApplyPatchPaths(patchText) {
  if (typeof patchText !== 'string' || !patchText) return [];
  const paths = new Set();
  for (const match of patchText.matchAll(PATCH_HEADER_RE)) {
    const candidate = match[1].trim();
    if (candidate) paths.add(candidate);
  }
  return [...paths];
}

export function isDotdotgodMcpTool(name, suffix, prefixes) {
  if (typeof name !== 'string' || !name || !Array.isArray(prefixes)) return false;
  return prefixes.some((prefix) => name === `${prefix}${suffix}`);
}

export function hasFailedToolResult(input) {
  if (!input || typeof input !== 'object') return false;
  if (input.is_error === true || input.isError === true || Boolean(input.error)) return true;
  const response = input.tool_response ?? input.toolResponse ?? input.tool_result ?? input.toolResult ?? input.result;
  if (!response || typeof response !== 'object') return false;
  if (response.is_error === true || response.isError === true || Boolean(response.error)) return true;
  if (response.ok === false || response.status === 'error' || response.status === 'failed') return true;
  if (response.structuredContent?.ok === false) return true;
  return false;
}

export function readArtifactBounded(artifactDir, fileName = 'implementation_plan.md', maxBytes = MAX_ARTIFACT_BYTES) {
  if (typeof artifactDir !== 'string' || !artifactDir.trim()) return null;
  let fd = -1;
  try {
    const realDir = realpathSync(artifactDir);
    const target = join(realDir, fileName);
    const lst = lstatSync(target);
    if (lst.isSymbolicLink() || !lst.isFile() || lst.size > maxBytes) return null;
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
    fd = openSync(target, flags);
    const fst = fstatSync(fd);
    if (!fst.isFile() || fst.dev !== lst.dev || fst.ino !== lst.ino || fst.size > maxBytes) return null;
    const buf = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset <= maxBytes) {
      const n = readSync(fd, buf, offset, buf.length - offset, null);
      if (n === 0) break;
      offset += n;
      if (offset > maxBytes) return null;
    }
    return buf.subarray(0, offset);
  } catch {
    return null;
  } finally {
    if (fd >= 0) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

export async function runHookSafely(fn) {
  try {
    const out = await fn();
    process.stdout.write(`${JSON.stringify(out ?? {})}\n`);
  } catch (error) {
    process.stderr.write(`${formatHookError(error)}\n`);
    process.stdout.write('{}\n');
  }
}
