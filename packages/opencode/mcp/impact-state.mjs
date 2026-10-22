// packages/context/src/impact-state.mjs
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// packages/context/src/session.mjs
var SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
function validateSessionId(value) {
  if (typeof value !== "string" || !SESSION_ID.test(value)) {
    throw new TypeError("sessionId must be an opaque 1-128 character identifier using letters, digits, dot, underscore, tilde, or hyphen.");
  }
  return value;
}

// packages/context/src/retention.mjs
var RETENTION_MS = 24 * 60 * 60 * 1e3;

// packages/context/src/impact-state.mjs
function impactPath(root, path) {
  if (typeof path !== "string" || !path.trim() || path.includes("\0")) return void 0;
  const absolute = resolve(root, path);
  const name = relative(resolve(root), absolute).replaceAll("\\", "/");
  if (!name || name === ".." || name.startsWith("../") || isAbsolute(name)) return void 0;
  if (/(^|\/)(node_modules|\.git|\.dotdotgod|dist|build|coverage)(\/|$)/.test(name)) return void 0;
  if (/^docs\/(plan|archive)(\/|$)/.test(name)) return void 0;
  let ancestor = absolute;
  while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
  const realRelative = relative(realpathSync(root), realpathSync(ancestor));
  if (realRelative === ".." || realRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(realRelative)) return void 0;
  return name;
}
function impactFingerprint(root, path) {
  try {
    return createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
  } catch (error) {
    return error.code === "ENOENT" ? "missing" : void 0;
  }
}
var ImpactState = class {
  constructor(root, sessionId) {
    this.root = resolve(root);
    this.sessionId = validateSessionId(sessionId);
    this.path = join(this.root, ".dotdotgod/context/impact.sqlite");
  }
  database(write = false) {
    if (!write && !existsSync(this.path)) return void 0;
    if (write) mkdirSync(dirname(this.path), { recursive: true });
    const db = new DatabaseSync(this.path);
    db.exec("PRAGMA busy_timeout=5000");
    db.exec("CREATE TABLE IF NOT EXISTS pending (session TEXT NOT NULL, path TEXT NOT NULL, revision TEXT NOT NULL, fingerprint TEXT, PRIMARY KEY(session,path))");
    db.exec("BEGIN IMMEDIATE");
    try {
      const columns = db.prepare("PRAGMA table_info(pending)").all();
      if (!columns.some((column) => column.name === "expires_at")) {
        db.exec("ALTER TABLE pending ADD COLUMN created_at INTEGER; ALTER TABLE pending ADD COLUMN expires_at INTEGER;");
        const now = Date.now();
        db.prepare("UPDATE pending SET created_at = ?, expires_at = ?").run(now, now + RETENTION_MS);
      }
      db.prepare("DELETE FROM pending WHERE expires_at <= ?").run(Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
    return db;
  }
  mark(paths) {
    const names = [...new Set(paths.map((path) => impactPath(this.root, path)).filter(Boolean))];
    if (!names.length) return;
    const db = this.database(true);
    try {
      const insert = db.prepare("INSERT OR REPLACE INTO pending (session,path,revision,fingerprint,created_at,expires_at) VALUES (?, ?, ?, ?, ?, ?)");
      db.exec("BEGIN IMMEDIATE");
      const now = Date.now();
      for (const path of names) insert.run(this.sessionId, path, randomUUID(), impactFingerprint(this.root, path) ?? null, now, now + RETENTION_MS);
      db.exec("COMMIT");
    } finally {
      db.close();
    }
  }
  snapshot(paths) {
    const selected = paths ? new Set(paths.map((path) => impactPath(this.root, path)).filter(Boolean)) : void 0;
    const db = this.database();
    if (!db) return [];
    try {
      return db.prepare("SELECT path,revision,fingerprint FROM pending WHERE session=? ORDER BY path").all(this.sessionId).filter((item) => !selected || selected.has(item.path));
    } finally {
      db.close();
    }
  }
  complete(snapshot) {
    if (!snapshot.length) return;
    const db = this.database();
    if (!db) return;
    try {
      const remove = db.prepare("DELETE FROM pending WHERE session=? AND path=? AND revision=?");
      for (const item of snapshot) {
        if (item.fingerprint && impactFingerprint(this.root, item.path) === item.fingerprint) remove.run(this.sessionId, item.path, item.revision);
      }
    } finally {
      db.close();
    }
  }
  status(limit = 50) {
    const all = this.snapshot();
    return { ok: true, count: all.length, pending: all.slice(0, limit).map(({ path }) => ({ path })), truncated: all.length > limit };
  }
};
async function withImpactReview(root, sessionId, paths, review, signal) {
  signal?.throwIfAborted();
  const state = new ImpactState(root, sessionId);
  const snapshot = state.snapshot(paths).map((item) => ({ ...item, fingerprint: impactFingerprint(root, item.path) }));
  const result = await review();
  signal?.throwIfAborted();
  if (result.ok === true) state.complete(snapshot);
  return { ...result, checked: result.ok === true ? paths : [], impactStatus: state.status() };
}
function impactReminder(status) {
  if (!status.count) return void 0;
  return `[DOTDOTGOD IMPACT PENDING \u2014 ADVISORY]
${status.count} changed file(s) await impact review:
${status.pending.slice(0, 8).map((item) => `- ${item.path}`).join("\n")}
Run project_impact from the dotdotgod_context MCP server for the relevant paths and review related evidence. Pending impact does not block edits, tests, builds, commits, or other tools. Only observed edits are tracked; shell, external, and unobserved changes may require explicit paths.`;
}
export {
  ImpactState,
  impactFingerprint,
  impactPath,
  impactReminder,
  withImpactReview
};
