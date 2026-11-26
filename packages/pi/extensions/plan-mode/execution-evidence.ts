import { createHash } from "node:crypto";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { mcpTool } from "../shared/mcp.ts";
import type { PlanModeRuntimeMode } from "./controllers/mode-lifecycle.ts";
import type { DiscussionQueueSummary } from "./plans.ts";
import { canonicalPath } from "./policy/markdown.ts";
import { getTextContent } from "./runtime/messages.ts";
import { ARCHIVE_DIRECTORY, DOCUMENTATION_ROOT, PLAN_DIRECTORY } from "./runtime/paths.ts";
import { scanMarkdownLines, type TodoItem } from "./todos.ts";

export type AllowlistedRunnerId = "test" | "lint" | "typecheck" | "build" | "validate" | "verify";
export type SafeCheckRef = { kind: "plan"; index: number } | { kind: "generic"; runner: AllowlistedRunnerId } | { kind: "unconfirmed" };
export type VerificationCheckOutcome = "passed" | "failed" | "timed_out" | "aborted" | "capture_limit_exceeded" | "unconfirmed";
export type ExecutionPauseState = "blocked" | "no_progress" | "budget_exhausted" | "aborted" | "error";
export type ExecutionReplanTrigger = "signal" | "consecutive_failures";
export type ExecutionNoticeKind = "replan_consecutive_failures" | "replan_signal" | "blocked" | "no_progress" | "budget_exhausted"
	| "legacy_executing_recovery" | "corrupted_evidence_recovery" | "branch_switch_executing";
export type PlanReviewFailureReason = "invalid_path" | "unreadable" | "malformed_verification" | "changed_during_review" | "unexpected_error";

export interface PersistedLastCheckState {
	ref: SafeCheckRef;
	outcome: VerificationCheckOutcome;
	consecutiveFailures: number;
}

export interface SafeExecutionUxSummary {
	readonly mode: PlanModeRuntimeMode;
	readonly planPath?: string;
	readonly todoCompleted: number;
	readonly todoTotal: number;
	readonly remainingTodoSteps: readonly number[];
	readonly editRevision: number;
	readonly requiredCheckCount: number;
	readonly passedRequiredCheckCount: number;
	readonly missingRequiredCheckIndices: readonly number[];
	readonly needsSubstantiveVerification: boolean;
	readonly lastCheck?: Readonly<PersistedLastCheckState>;
	readonly continuationCount: number;
	readonly maxContinuations: 3;
	readonly pauseState?: ExecutionPauseState;
	readonly replanTrigger?: ExecutionReplanTrigger;
}

// Compiled units are RAM-only and must not be projected into notices or journals.
export interface CompiledCommandUnit {
	executable: string;
	args: readonly string[];
	effectiveCwdRel: string;
	envAssignments: readonly (readonly [string, string | null])[];
}

export interface CompiledVerificationCheck {
	index: number;
	key: `V${number}`;
	units: readonly CompiledCommandUnit[];
	isSubstantive: boolean;
}

export type PlanVerificationContract =
	| { ok: true; checks: readonly CompiledVerificationCheck[]; contractHash: string }
	| { ok: false; reason: "unterminated_fence" | "malformed_command" | "malformed_verification" };

export type ReviewSnapshotResult =
	| {
		ok: true;
		planPath: string;
		markdown: string;
		todos: readonly TodoItem[];
		verificationContract: Extract<PlanVerificationContract, { ok: true }>;
		verificationCount: number;
		discussionQueue: DiscussionQueueSummary;
	}
	| { ok: false; reason: PlanReviewFailureReason; planPath?: never };

export interface PersistedExecutionEvidenceSnapshot {
	attemptId: string;
	planPath?: string;
	contractHash: string;
	requiredCheckCount: number;
	editRevision: number;
	sourceEditRevision?: number;
	unverifiedDebt?: boolean;
	editedPaths: string[];
	editedPathsTruncated: boolean;
	passedRequiredRevisions: Record<string, number>;
	substantivePassedRevision?: number;
	lastCheck?: PersistedLastCheckState;
	hasObservedExecutionTurn: boolean;
}

export interface ObservedCommandOutcome {
	units: readonly CompiledCommandUnit[];
	outcome: VerificationCheckOutcome;
	countsAsFailure: boolean;
	batchConcurrency: number;
}
export type ExecutionSignal = { kind: "replan" | "blocked" };
export type SettleGateReason = "incomplete_todos" | "unverified_edits" | "missing_plan_verifications" | "verification_failed";
export type SettleGateDecision =
	| { action: "noop" }
	| { action: "defer_to_other_extension" }
	| { action: "complete" }
	| { action: "continue"; reasons: readonly SettleGateReason[]; nextAttempt: number; progressFingerprint: string }
	| { action: "replan"; trigger: ExecutionReplanTrigger }
	| { action: "stop"; reason: ExecutionPauseState };
export interface ExecutionCompleteMetricPayload {
	editRevision: number;
	editedFileCount: number;
	editedFileCountCapped: boolean;
	requiredCheckCount: number;
	todoCount: number;
	continuationCount: number;
}
export interface PendingCompletion {
	generation: number;
	attemptId: string;
	metricPayload: ExecutionCompleteMetricPayload;
}
export interface PendingNonUiStatusNotice {
	generation: number;
	attemptId: string;
	kind: Extract<ExecutionNoticeKind, "replan_consecutive_failures" | "replan_signal" | "blocked" | "no_progress" | "budget_exhausted">;
	content: string;
}

const controlChars = /[\x00-\x1f\x7f-\x9f]/;
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
export const EMPTY_CONTRACT_HASH = sha256("[]");

function containedRelative(root: string, path: string): string | undefined {
	const rel = relative(root, path);
	return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? undefined : rel.split(sep).join("/") || ".";
}

export function normalizeRelativeCwd(cwd: string, rawCwd: string): string | undefined {
	if (controlChars.test(rawCwd)) return undefined;
	const path = rawCwd || ".";
	if (containedRelative(resolve(cwd), resolve(cwd, path)) === undefined) return undefined;
	try {
		return containedRelative(canonicalPath(cwd, "."), canonicalPath(cwd, path));
	} catch {
		return undefined;
	}
}

export type EditPathClassification =
	| { tracked: true; invalidatesPlanChecks: true; normalizedPath: string; category: "source_or_config" | "runtime_prompt_or_skill" }
	| { tracked: false; invalidatesPlanChecks: true; normalizedPath: string; reason: "plain_docs_or_spec" }
	| { tracked: false; invalidatesPlanChecks: false; reason: "invalid_or_outside_cwd" | "excluded_directory" | "plan_or_archive" };

const excludedDirectory = /(?:^|\/)(?:\.dotdotgod|\.git|node_modules|dist|build|coverage|\.next|\.turbo|\.cache)(?:\/|$)/;
const runtimeMarkdown = /^(?:packages|skills|prompts|workflows|rules|agents|\.(?:agents|claude|pi|codex))\/.*\.md$/i;
const plainDocument = /\.(?:md|mdx|markdown|txt|rst|adoc)$/i;
const buildFile = new Set([
	"Makefile", "GNUmakefile", "Dockerfile", "Containerfile", "Jenkinsfile", "Procfile", "Justfile", "justfile", "Brewfile", "Gemfile",
	"Rakefile", "Vagrantfile", "Caddyfile", "Earthfile", "Tiltfile", "Taskfile", "BUILD", "WORKSPACE", "BUCK", "CODEOWNERS",
	".env", ".npmrc", ".nvmrc", ".node-version", ".python-version", ".tool-versions", ".editorconfig", ".gitignore", ".gitattributes",
	".dockerignore", ".prettierignore", ".eslintignore", ".prettierrc", ".eslintrc", ".babelrc", ".swcrc",
]);

export function classifyEditTrackingPath(cwd: string, rawPath: string): EditPathClassification {
	const path = rawPath.replace(/^@/, "").replaceAll("\\", "/");
	const invalid = { tracked: false, invalidatesPlanChecks: false, reason: "invalid_or_outside_cwd" } as const;
	if (!path || controlChars.test(path) || /[;&|<>`$!#]/.test(path) || path.split("/").includes("..")) return invalid;
	const lexicalPath = containedRelative(resolve(cwd), resolve(cwd, path));
	const normalizedPath = normalizeRelativeCwd(cwd, path);
	if (!lexicalPath || !normalizedPath || normalizedPath === ".") return invalid;
	const paths = [lexicalPath, normalizedPath];
	if (paths.some(p => [PLAN_DIRECTORY, ARCHIVE_DIRECTORY].some(root => p === root || p.startsWith(`${root}/`)))) {
		return { tracked: false, invalidatesPlanChecks: false, reason: "plan_or_archive" };
	}
	if (paths.some(p => excludedDirectory.test(p))) return { tracked: false, invalidatesPlanChecks: false, reason: "excluded_directory" };
	const name = posix.basename(normalizedPath);
	const isSpec = paths.some(p => p.startsWith(`${DOCUMENTATION_ROOT}/spec/`) || p.startsWith("docs/spec/"));
	if (isSpec) return { tracked: false, invalidatesPlanChecks: true, normalizedPath, reason: "plain_docs_or_spec" };
	if (/^(?:SKILL|AGENTS|CLAUDE|CODEX)\.md$/i.test(name) || runtimeMarkdown.test(normalizedPath)) {
		return { tracked: true, invalidatesPlanChecks: true, normalizedPath, category: "runtime_prompt_or_skill" };
	}
	if (!plainDocument.test(name) && (buildFile.has(name) || /^(?:Dockerfile|Containerfile|Makefile|\.env)\./.test(name) || /[^/]\.[A-Za-z0-9]+$/.test(name))) {
		return { tracked: true, invalidatesPlanChecks: true, normalizedPath, category: "source_or_config" };
	}
	return { tracked: false, invalidatesPlanChecks: true, normalizedPath, reason: "plain_docs_or_spec" };
}

const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;
const variable = /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/;
function sortedEnv(env: Readonly<Record<string, string | null>>): CompiledCommandUnit["envAssignments"] {
	return Object.entries(env).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

interface ShellWord { text: string; assignmentKey: string | undefined }

function tokenizeVerificationChain(command: string): ShellWord[][] | undefined {
	if (controlChars.test(command.replaceAll("\t", ""))) return undefined;
	let words: ShellWord[] = [];
	const segments = [words];
	let text = "";
	let active = false;
	let quote: "'" | '"' | undefined;
	let literalPrefix = true;
	let assignmentKey: string | undefined;
	const flush = () => {
		if (!active) return;
		words.push({ text, assignmentKey });
		text = "";
		active = false;
		literalPrefix = true;
		assignmentKey = undefined;
	};
	for (let i = 0; i < command.length; i++) {
		const char = command.charAt(i);
		if (!quote && /[ \t]/.test(char)) { flush(); continue; }
		if (!quote && char === "&" && command[i + 1] === "&") {
			flush();
			if (!words.length) return undefined;
			words = [];
			segments.push(words);
			i++;
			continue;
		}
		active = true;
		if (char === quote) { quote = undefined; continue; }
		if (!quote && (char === '"' || char === "'")) { quote = char; literalPrefix = false; continue; }
		if (char === "\\" && quote !== "'") {
			const next = command[i + 1];
			if (!next) return undefined;
			if (!quote || /["\\$`]/.test(next)) {
				text += next;
				literalPrefix = false;
				i++;
				continue;
			}
		}
		if (quote !== "'" && (char === "`" || (char === "$" && command[i + 1] === "("))) return undefined;
		if (char === "$" && quote !== "'") {
			const ref = command.slice(i).match(variable)?.[0];
			if (!ref) return undefined;
			text += ref;
			literalPrefix = false;
			i += ref.length - 1;
			continue;
		}
		if (!quote && /[&|;<>#(){}!]/.test(char)) return undefined;
		if (!quote && char === "=" && literalPrefix && envName.test(text)) assignmentKey = text;
		text += char;
	}
	flush();
	return quote || !words.length ? undefined : segments;
}

export function parseVerificationShellChain(command: string, effectiveCwdRel = ".", cwd?: string, envOverrides: Readonly<Record<string, string | null>> = {}): CompiledCommandUnit[] | undefined {
	const segments = tokenizeVerificationChain(command);
	if (!segments) return undefined;
	const units: CompiledCommandUnit[] = [];
	for (const [index, segment] of segments.entries()) {
		const offset = segment.findIndex(word => word.assignmentKey === undefined);
		if (offset < 0) return undefined;
		const inline = segment.slice(0, offset).map(word => [word.assignmentKey!, word.text.slice(word.assignmentKey!.length + 1)] as const);
		const [executable, ...args] = segment.slice(offset).map(word => word.text);
		if (!executable || executable.includes("$")) return undefined;
		if (executable === "cd") {
			const dir = args[0];
			if (inline.length || index === segments.length - 1 || args.length !== 1 || !dir || /^[-~]/.test(dir) || /[$*?\[\]]/.test(dir) || isAbsolute(dir)) return undefined;
			const next = cwd ? normalizeRelativeCwd(cwd, posix.join(effectiveCwdRel, dir)) : posix.join(effectiveCwdRel, dir);
			if (!next || next === ".." || next.startsWith("../")) return undefined;
			effectiveCwdRel = next;
			continue;
		}
		units.push({ executable, args, effectiveCwdRel, envAssignments: sortedEnv({ ...envOverrides, ...Object.fromEntries(inline) }) });
	}
	return units;
}

export function extractPlanVerificationContract(markdown: string, cwd?: string): PlanVerificationContract {
	const checks: CompiledVerificationCheck[] = [];
	const seen = new Set<string>();
	let level: number | undefined;
	let open = false;
	let shell = false;
	for (const entry of scanMarkdownLines(markdown)) {
		const { kind, line } = entry;
		let command: string | undefined;
		if (kind === "text") {
			const [, hashes, heading = ""] = line.match(/^(#{1,6})[ \t]+(.*?)[ \t]*$/) ?? [];
			const bold = line.match(/^\*\*(.+?):\*\*[ \t]*$/)?.[1];
			const depth = hashes?.length;
			if (level !== undefined && (bold || (depth !== undefined && depth <= level))) break;
			if (level === undefined) {
				if (bold && /^Verification$/i.test(bold)) level = 3;
				else if ((depth === 2 || depth === 3) && /^Verification\s*:?$/i.test(heading)) level = depth;
				continue;
			}
			command = line.match(/^[ \t]*[-*][ \t]+`([^`\r\n]+)`[ \t]*$/)?.[1];
		} else if (level !== undefined) {
			if (kind === "open") {
				open = true;
				shell = /^(?:bash|sh|zsh|shell)?$/.test(entry.language);
			} else if (kind === "close") open = false;
			else if (shell && line.trim() && !line.trimStart().startsWith("#")) command = line;
		}
		if (command === undefined) continue;
		const units = parseVerificationShellChain(command, ".", cwd);
		if (!units) return { ok: false, reason: "malformed_command" };
		const key = JSON.stringify(units);
		if (seen.has(key)) continue;
		if (checks.length === 100) return { ok: false, reason: "malformed_verification" };
		seen.add(key);
		const index = checks.length + 1;
		checks.push({ index, key: `V${index}`, units, isSubstantive: classifyGenericVerification(units, cwd) !== undefined });
	}
	if (open) return { ok: false, reason: "unterminated_fence" };
	return { ok: true, checks, contractHash: checks.length ? sha256(JSON.stringify(checks.map(check => check.units))) : EMPTY_CONTRACT_HASH };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ReceiptEvent = {
	toolName: string;
	input: unknown;
	structuredContent?: unknown;
	isError: boolean;
	content?: Parameters<typeof getTextContent>[0];
};

function nativeBashOutcome(event: ReceiptEvent): VerificationCheckOutcome {
	const code = isRecord(event.structuredContent) ? event.structuredContent.exit_code : undefined;
	if (code !== undefined && (!Number.isInteger(code) || (code === 0) === event.isError)) return "unconfirmed";
	if (!event.isError) return "passed";
	if (code === undefined) {
		const text = getTextContent(event.content ?? []);
		if (/(?:^|\n)Command aborted(?![\s\S])/.test(text)) return "aborted";
		if (/(?:^|\n)Command timed out after \d+(?:\.\d+)? seconds(?:\. [^\r\n]*)?(?![\s\S])/.test(text)) return "timed_out";
	}
	return "failed";
}

function mcpRowOutcome(row: unknown): VerificationCheckOutcome {
	if (!isRecord(row)) return "unconfirmed";
	const { ok, code, signal, timedOut, aborted, captureLimitExceeded } = row;
	if (ok === true) return code === 0 && timedOut === false && aborted === false && captureLimitExceeded === false && signal == null ? "passed" : "unconfirmed";
	if (ok !== false || (code != null && !Number.isInteger(code)) || (signal != null && typeof signal !== "string") || [timedOut, aborted, captureLimitExceeded].some(flag => flag !== undefined && typeof flag !== "boolean")) return "unconfirmed";
	if (aborted === true) return "aborted";
	if (timedOut === true) return "timed_out";
	if (captureLimitExceeded === true) return "capture_limit_exceeded";
	return code !== 0 && (typeof code === "number" || typeof signal === "string") ? "failed" : "unconfirmed";
}

function compileMcpSpec(cwd: string, batchCwd: unknown, spec: unknown): CompiledCommandUnit[] | undefined {
	if (!isRecord(spec)) return undefined;
	const rawCwd = spec.cwd ?? batchCwd ?? ".";
	const effectiveCwdRel = typeof rawCwd === "string" ? normalizeRelativeCwd(cwd, rawCwd) : undefined;
	if (!effectiveCwdRel) return undefined;
	const env = spec.env ?? {};
	if (!isRecord(env) || Object.entries(env).some(([key, value]) => !envName.test(key) || (value !== null && typeof value !== "string"))) return undefined;
	const envOverrides = env as Record<string, string | null>;
	if (spec.executable || spec.shell === false) {
		const executable = spec.executable || spec.command;
		const args: unknown = spec.executable ? spec.args ?? [] : [];
		if (typeof executable !== "string" || !executable || controlChars.test(executable) || !Array.isArray(args) || !args.every(arg => typeof arg === "string" && !arg.includes("\0"))) return undefined;
		return [{ executable, args, effectiveCwdRel, envAssignments: sortedEnv(envOverrides) }];
	}
	return typeof spec.command === "string" && (spec.shell == null || spec.shell === true) ? parseVerificationShellChain(spec.command, effectiveCwdRel, cwd, envOverrides) : undefined;
}

export function extractObservedCommandOutcomes(cwd: string, event: ReceiptEvent): ObservedCommandOutcome[] {
	const { toolName, input } = event;
	if (!isRecord(input)) return [];
	function observed(units: CompiledCommandUnit[] | undefined, outcome: VerificationCheckOutcome, batchConcurrency: number): ObservedCommandOutcome {
		return { units: units ?? [], outcome, batchConcurrency, countsAsFailure: outcome === "failed" || outcome === "timed_out" || outcome === "capture_limit_exceeded" };
	}
	if (toolName === "bash") {
		if (typeof input.command !== "string" || !input.command.trim()) return [];
		return [observed(parseVerificationShellChain(input.command, ".", cwd), nativeBashOutcome(event), 1)];
	}
	if (toolName !== mcpTool("execute") || !Array.isArray(input.commands) || input.commands.length < 1 || input.commands.length > 100) return [];
	const envelope = event.structuredContent;
	const payload = isRecord(envelope) && envelope.isError !== true && isRecord(envelope.structuredContent) ? envelope.structuredContent : undefined;
	const results = payload?.results;
	const concurrency = payload?.concurrency;
	const valid = !event.isError && Array.isArray(results) && results.length === input.commands.length && typeof concurrency === "number" && Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8;
	return input.commands.map((spec, i) => observed(compileMcpSpec(cwd, input.cwd, spec), valid ? mcpRowOutcome(results[i]) : "unconfirmed", valid ? concurrency : 1));
}

const unsafeEnv = /^(?:PATH$|NODE_OPTIONS$|PYTHONPATH$|LD_PRELOAD$|LD_LIBRARY_PATH$|DYLD_|BASH_ENV$|ENV$|RUBYOPT$|PERL5OPT$|SKIP)/i;
const nonExecution = /^(?:--help|-h|--version|-v|-V|--collect-only|--list-tests|--listTests|--no-run|--dry-run)(?:=|$)/;
const packageManagers = /^(?:npm|pnpm|yarn|bun)$/;
const scriptRunners: readonly [RegExp, AllowlistedRunnerId][] = [
	[/^(?:verify|check)(?::.+)?$/, "verify"], [/^test(?::.+)?$/, "test"], [/^lint(?::.+)?$/, "lint"],
	[/^(?:typecheck|type-check|tsc)$/, "typecheck"], [/^(?:build|compile)$/, "build"],
];
const standaloneRunners: readonly [RegExp, AllowlistedRunnerId][] = [
	[/^(?:vitest|jest|mocha|pytest|rspec|phpunit|ctest)$/, "test"],
	[/^(?:tsc|mypy|pyright)$/, "typecheck"],
	[/^(?:eslint|flake8|golangci-lint|shellcheck)$/, "lint"],
];
const subcommandRunners: readonly [RegExp, RegExp, AllowlistedRunnerId][] = [
	[/^(?:go|cargo|dotnet|mvn|gradle|make|just)$/, /^test$/, "test"],
	[/^cargo$/, /^check$/, "typecheck"], [/^go$/, /^vet$/, "typecheck"],
	[/^biome$/, /^(?:check|lint)$/, "lint"], [/^ruff$/, /^check$/, "lint"], [/^cargo$/, /^clippy$/, "lint"],
	[/^(?:cargo|go|make|dotnet|gradle)$/, /^build$/, "build"],
	[/^cmake$/, /^--build$/, "build"], [/^mvn$/, /^(?:compile|package)$/, "build"],
	[/^(?:make|just)$/, /^(?:check|verify)$/, "verify"],
];

function classifyUnitGenericRunner(unit: CompiledCommandUnit, cwd?: string): AllowlistedRunnerId | undefined {
	if (unit.envAssignments.some(([key]) => unsafeEnv.test(key))) return undefined;
	let name = unit.executable.replace(/^node_modules\/\.bin\//, "");
	if (!/^[A-Za-z0-9_.-]+$/.test(name)) return undefined;
	let args = unit.args;
	if (args.some(arg => nonExecution.test(arg) || arg === "help")) return undefined;
	if (packageManagers.test(name)) {
		while (args.length) {
			const flag = args[0] ?? "";
			if (["--filter", "-C", "--dir"].includes(flag) && args[1]) args = args.slice(2);
			else if (flag === "-w" || /^(?:--filter|--dir)=.+/.test(flag)) args = args.slice(1);
			else break;
		}
		if (/^(?:pnpm|yarn)$/.test(name) && args[0] === "exec") args = args.slice(1);
		else return scriptRunners.find(([pattern]) => pattern.test(args[args[0] === "run" ? 1 : 0] ?? ""))?.[1];
	} else if (!/^(?:npx|bunx)$/.test(name)) {
		return classifyRunnerInvocation(name, args, unit.effectiveCwdRel, cwd);
	} else if (args[0] === "--") args = args.slice(1);
	name = args[0]?.replace(/^node_modules\/\.bin\//, "") ?? "";
	return /^[A-Za-z0-9_.-]+$/.test(name) ? classifyRunnerInvocation(name, args.slice(1), unit.effectiveCwdRel, cwd) : undefined;
}

function classifyRunnerInvocation(name: string, args: readonly string[], effectiveCwdRel: string, cwd?: string): AllowlistedRunnerId | undefined {
	const [first = "", second] = args;
	if (name === "dotdotgod") return first === "validate" ? "validate" : undefined;
	if (name === "node") {
		if (second === "validate" && first) {
			const script = "packages/cli/bin/dotdotgod.mjs";
			if (cwd ? resolve(cwd, effectiveCwdRel, first) === resolve(cwd, script) : !isAbsolute(first) && posix.join(effectiveCwdRel, first) === script) return "validate";
		}
		// A script, eval, preload or loader can exit before the test runner starts.
		for (const arg of args) {
			if (arg === "--test") return "test";
			if (!/^--(?:experimental-strip-types|experimental-transform-types|no-warnings)$/.test(arg)) break;
		}
		return undefined;
	}
	if ((name === "make" && args.some(arg => /^(?:-[A-Za-z]*[nqth]|--just-print|--dry-run|--recon|--question|--touch)(?:=|$)/.test(arg)))
		|| (name === "go" && args.some(arg => /^-list(?:=|$)/.test(arg)))) return undefined;
	if (/^python(?:[0-9.]+)?$/.test(name) && first === "-m" && (second === "pytest" || second === "unittest")) return "test";
	return standaloneRunners.find(([executable]) => executable.test(name))?.[1]
		?? subcommandRunners.find(([executable, subcommand]) => executable.test(name) && subcommand.test(first))?.[2];
}

export function classifyGenericVerification(units: readonly CompiledCommandUnit[], cwd?: string): AllowlistedRunnerId | undefined {
	for (const unit of units) {
		const runner = classifyUnitGenericRunner(unit, cwd);
		if (runner) return runner;
	}
	return undefined;
}

function unitKey({ executable, args, effectiveCwdRel, envAssignments }: CompiledCommandUnit): string {
	return JSON.stringify([executable, args, effectiveCwdRel, envAssignments]);
}

export function matchVerificationCommand(checks: readonly CompiledVerificationCheck[], observed: ObservedCommandOutcome, cwd?: string) {
	const units = observed.units.map(unitKey);
	const required = checks.map(check => ({ check, units: check.units.map(unitKey) }));
	const runner = classifyGenericVerification(observed.units, cwd);
	const canUseSlice = observed.outcome === "passed";
	const matchedPlanChecks = required.filter(requiredCheck => {
		const matchesAt = (start: number) => requiredCheck.units.every((unit, i) => unit === units[start + i]);
		return canUseSlice ? units.some((_, i) => matchesAt(i)) : requiredCheck.units.length === units.length && matchesAt(0);
	}).map(({ check }) => check);
	const ambiguousChainFailure = !canUseSlice && units.length > 1 && !matchedPlanChecks.length
		&& (runner !== undefined || required.some(check => check.units.some(unit => units.includes(unit))));
	const genericRunner = ambiguousChainFailure ? undefined : runner;
	return {
		...observed,
		outcome: ambiguousChainFailure ? "unconfirmed" as const : observed.outcome,
		countsAsFailure: !ambiguousChainFailure && observed.countsAsFailure,
		matchedPlanChecks, genericRunner, ambiguousChainFailure,
		satisfiesSubstantive: genericRunner !== undefined || matchedPlanChecks.some(check => check.isSubstantive),
	};
}

export function extractExecutionSignals(text: string): ExecutionSignal | undefined {
	const prose = [...scanMarkdownLines(text)].map(entry => entry.kind === "text" ? entry.line : "\0").join("\n");
	// Match equal backtick runs; unequal runs may be content of an inline code span.
	const visible = prose.replace(/(?<!`)(`+)(?!`)[^\0]*?(?<!`)\1(?!`)/g, "\0");
	if (/\[REPLAN(?:[ \t]*:[^\]\r\n\0]*)?\]/i.test(visible)) return { kind: "replan" };
	if (/\[BLOCKED(?:[ \t]*:[^\]\r\n\0]*)?\]/i.test(visible)) return { kind: "blocked" };
	return undefined;
}

export function computeExecutionProgressFingerprint(
	snapshot: PersistedExecutionEvidenceSnapshot,
	todos: readonly TodoItem[],
): string {
	const { editRevision, sourceEditRevision, unverifiedDebt, passedRequiredRevisions, substantivePassedRevision, lastCheck } = snapshot;
	const currentPasses = Object.keys(passedRequiredRevisions).filter(key => passedRequiredRevisions[key] === editRevision).sort();
	const ref = lastCheck?.ref;
	return sha256(JSON.stringify([
		todos.filter(todo => todo.completed).map(todo => todo.step).sort((a, b) => a - b),
		editRevision, sourceEditRevision, unverifiedDebt, currentPasses, substantivePassedRevision,
		ref?.kind, ref?.kind === "plan" ? ref.index : ref?.kind === "generic" ? ref.runner : undefined,
		lastCheck?.outcome, lastCheck?.consecutiveFailures,
	]));
}

export interface ExecutionSettleGateInput {
	executing: boolean;
	outcome: "completed" | "aborted" | "error";
	hasObservedExecutionTurn: boolean;
	hasDispatchedExecutionHandoff: boolean;
	latestSignal?: ExecutionSignal | undefined;
	lastCheck?: PersistedLastCheckState | undefined;
	remainingTodoCount: number;
	needsSubstantiveVerification: boolean;
	missingRequiredCheckIndices: readonly number[];
	eventContinue: boolean;
	pendingMessagesCount: number;
	canContinue: boolean;
	runContinuationCount: number;
	lastProgressFingerprint?: string | undefined;
	currentFingerprint: string;
}

export function evaluateExecutionSettleGate(input: ExecutionSettleGateInput): SettleGateDecision {
	const { outcome, hasObservedExecutionTurn, latestSignal, lastCheck, runContinuationCount, currentFingerprint } = input;
	if (!input.executing) return { action: "noop" };
	if (outcome !== "completed") return hasObservedExecutionTurn || input.hasDispatchedExecutionHandoff
		? { action: "stop", reason: outcome } : { action: "noop" };
	if (!hasObservedExecutionTurn) return { action: "noop" };
	if (latestSignal?.kind === "replan") return { action: "replan", trigger: "signal" };
	if (lastCheck && lastCheck.ref.kind !== "unconfirmed" && lastCheck.consecutiveFailures >= 2
		&& (lastCheck.outcome === "failed" || lastCheck.outcome === "timed_out" || lastCheck.outcome === "capture_limit_exceeded")) {
		return { action: "replan", trigger: "consecutive_failures" };
	}
	if (latestSignal?.kind === "blocked") return { action: "stop", reason: "blocked" };
	const reasons: SettleGateReason[] = [];
	if (input.remainingTodoCount > 0) reasons.push("incomplete_todos");
	if (input.needsSubstantiveVerification) reasons.push("unverified_edits");
	if (input.missingRequiredCheckIndices.length) reasons.push("missing_plan_verifications");
	if (lastCheck && lastCheck.outcome !== "passed") reasons.push("verification_failed");
	if (!reasons.length) return { action: "complete" };
	if ((input.eventContinue || input.pendingMessagesCount > 0) && input.canContinue) return { action: "defer_to_other_extension" };
	if (runContinuationCount > 0 && input.lastProgressFingerprint === currentFingerprint) return { action: "stop", reason: "no_progress" };
	if (runContinuationCount >= 3) return { action: "stop", reason: "budget_exhausted" };
	return { action: "continue", reasons, nextAttempt: runContinuationCount + 1, progressFingerprint: currentFingerprint };
}

