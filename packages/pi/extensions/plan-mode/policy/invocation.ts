import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import { tokenizeShellCommand } from "../tools.ts";

export interface ExecutionInput {
 command?: string;
 executable?: string;
 args?: string[];
 cwd?: string;
 shell?: boolean;
 env?: Record<string, string | null>;
 environmentMode?: string;
 allowedEnv?: string[];
}
export interface Invocation {
 executable: string;
 args: string[];
 cwd: string;
 command: string;
 environmentFingerprint: string;
 fileIdentity: string;
 reusable: boolean;
 shell: boolean;
}
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function environmentFingerprint(env: NodeJS.ProcessEnv): string {
 return hash(JSON.stringify(Object.entries(env).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b))));
}
export function executableIdentity(path: string): string {
 const stat = statSync(path);
 return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${hash(readFileSync(path))}`;
}
export function quoteArguments(args: string[]): string {
 return args.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(" ");
}
export function resolveInvocation(input: ExecutionInput, root: string, source: "native" | "mcp" = "native", inherited: NodeJS.ProcessEnv = process.env): Invocation {
 const cwd = realpathSync(resolve(root, input.cwd ?? "."));
 const env: NodeJS.ProcessEnv = { ...inherited };
 if (source === "mcp") {
  for (const name of Object.keys(env)) {
   if (["NODE_OPTIONS", "PYTHONPATH", "RUBYOPT", "LD_PRELOAD"].includes(name) || (process.platform === "darwin" && name.startsWith("DYLD_")) || (input.environmentMode === "allowlist-v1" && !input.allowedEnv?.includes(name))) delete env[name];
  }
 }
 for (const [name, value] of Object.entries(input.env ?? {})) {
  if (value === null) delete env[name]; else env[name] = value;
 }
 let tokens: string[] | undefined;
 if (input.executable) tokens = [input.executable, ...(input.args ?? [])];
 else if (input.command && input.shell === false) tokens = [input.command];
 else tokens = tokenizeShellCommand(input.command ?? "");
 if (!tokens?.length || !tokens[0]) throw new Error("Unsupported shell syntax; use a simple command or executable/args.");
 const program = tokens[0];
 const candidates = isAbsolute(program) || program.includes("/")
  ? [resolve(cwd, program)]
  : (env.PATH ?? "").split(delimiter).map(path => resolve(cwd, path, program));
 let executable: string | undefined;
 for (const path of candidates) {
  try { accessSync(path, constants.X_OK); if (statSync(path).isFile()) { executable = realpathSync(path); break; } } catch { /* Try the next PATH entry. */ }
 }
 if (!executable) throw new Error(`Executable not found in execution context: ${program}`);
 return { executable, args: tokens.slice(1), cwd, command: quoteArguments([executable, ...tokens.slice(1)]), environmentFingerprint: environmentFingerprint(env), fileIdentity: executableIdentity(executable), reusable: source !== "mcp" && input.env === undefined && (!input.environmentMode || input.environmentMode === "inherit-filtered-v1") && !input.allowedEnv?.length && input.shell !== true, shell: !input.executable && input.shell !== false };
}
export function invocationKey(value: Invocation): string {
 return JSON.stringify([value.executable, value.args, value.cwd, value.environmentFingerprint, value.fileIdentity]);
}
