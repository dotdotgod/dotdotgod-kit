import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { nativeBinary } from "./native-binary.ts";
import type { Invocation } from "./invocation.ts";

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const secretArguments = (args: string[]) => args.some(arg => /(?:password|passwd|token|secret|api[-_]?key|authorization|credential)|:\/\/[^/\s]+:[^@\s]+@/i.test(arg));
const inside = (root: string, path: string) => { const p = relative(root, path); return p !== ".." && !p.startsWith("../") && !isAbsolute(p); };
// This identifies entry bytes, not imports, configuration, or environment-dependent behavior.
export function durableKeys(value: Invocation, root: string): {project: string; global: string} | undefined {
 if (!value.reusable || secretArguments(value.args) || !inside(root, value.cwd)) return;
 try {
  const bytes = readFileSync(value.executable);
  let interpreter: string | undefined;
  if (bytes.subarray(0, 2).toString() === "#!") {
   const line = bytes.toString("utf8").split(/\r?\n/, 1)[0]!.slice(2).trim();
   if (!/^\/[^\s]+$/.test(line)) return;
   interpreter = realpathSync(line);
   accessSync(interpreter, constants.X_OK);
   if (basename(interpreter) === "env" || !nativeBinary(readFileSync(interpreter))) return;
  } else if (!nativeBinary(bytes)) return;
  const target = interpreter && inside(root, value.executable) ? ["relative", relative(root, value.executable)] : ["absolute", value.executable];
  const tuple = [target, digest(bytes), interpreter ? [interpreter, digest(readFileSync(interpreter))] : null, value.args, relative(root, value.cwd)];
  return {project: digest(JSON.stringify([root, tuple])), global: digest(JSON.stringify(tuple))};
 } catch { return; }
}

export class DurableApprovals {
 readonly directory: string;
 constructor(directory = join(homedir(), ".dotdotgod", "plan-approvals"), readonlyName = "grants.json") { this.directory = directory; this.file = join(directory, readonlyName); }
 readonly file: string;
 private ancestors(): void {
  let path = this.directory;
  while (true) {
   try { const stat = lstatSync(path); if (stat.isSymbolicLink() || ((stat.mode & 0o022) !== 0 && (stat.mode & 0o1000) === 0)) throw new Error("Approval store ancestors must not be symlinks or writable by others."); }
   catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
   const parent = dirname(path); if (parent === path) break; path = parent;
  }
 }
 private privatePath(path: string, directory: boolean): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) ||
      (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error("Approval store must be private and user-owned.");
 }
 private read(): string[] {
  this.ancestors();
  try { this.privatePath(this.directory, true); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const file = this.file;
  try {
   this.privatePath(file, false);
   const data: unknown = JSON.parse(readFileSync(file, "utf8"));
   if (!Array.isArray(data) || !data.every(v => typeof v === "string" && /^(project|global):[a-f0-9]{64}$/.test(v))) throw new Error("Invalid approval store.");
   return data;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
 }
 has(keys: {project: string; global: string}): boolean {
  const rows = this.read(); return rows.includes(`project:${keys.project}`) || rows.includes(`global:${keys.global}`);
 }
 async save(rows: string[], validate: () => boolean): Promise<void> {
  this.ancestors();
  mkdirSync(this.directory, {recursive: true, mode: 0o700});
  this.privatePath(this.directory, true);
  const lock = `${this.file}.lock`;
  // shortcut: crashed writers leave a lock; remove it manually only after confirming no writer remains.
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
   try { writeFileSync(lock, "", {flag: "wx", mode: 0o600}); acquired = true; break; }
   catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  if (!acquired) throw new Error("Approval store is busy.");
  const temporary = join(this.directory, `${randomUUID()}.tmp`);
  try {
   const merged = [...new Set([...this.read(), ...rows])];
   writeFileSync(temporary, JSON.stringify(merged), {flag: "wx", mode: 0o600});
   if (!validate()) throw new Error("Approval context changed before save.");
   // Successful rename is the consent commit. No fallible work may revoke it.
   renameSync(temporary, this.file);
  } finally {
   try { unlinkSync(temporary); } catch { /* Already published or not created. */ }
   try { unlinkSync(lock); } catch { /* Publication remains committed. */ }
  }
 }
}
