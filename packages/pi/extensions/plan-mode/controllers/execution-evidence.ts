import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import {
	EMPTY_CONTRACT_HASH, classifyEditTrackingPath, extractObservedCommandOutcomes, extractPlanVerificationContract,
	matchVerificationCommand, normalizeRelativeCwd,
	type AllowlistedRunnerId, type CompiledVerificationCheck, type ExecutionPauseState, type ExecutionReplanTrigger,
	type ExecutionSettleGateInput, type ExecutionSignal, type PendingCompletion, type PendingNonUiStatusNotice,
	type PersistedExecutionEvidenceSnapshot, type PersistedLastCheckState, type SafeCheckRef, type SafeExecutionUxSummary,
	type VerificationCheckOutcome,
} from "../execution-evidence.ts";
import { canonicalPath } from "../policy/markdown.ts";
import { ARCHIVE_DIRECTORY, PLAN_DIRECTORY } from "../runtime/paths.ts";
import type { TodoItem } from "../todos.ts";
import type { PlanModeRuntimeMode } from "./mode-lifecycle.ts";
import { resolveValidatedPlanPath } from "./plan-artifact.ts";

const MAX_EDITED_PATHS = 50;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const runnerIds = new Set<unknown>(["test", "lint", "typecheck", "build", "validate", "verify"]);
const outcomes = new Set<unknown>(["passed", "failed", "timed_out", "aborted", "capture_limit_exceeded", "unconfirmed"]);
const strikes = new Set<unknown>(["failed", "timed_out", "capture_limit_exceeded"]);

interface InFlightToolRecord {
	generation: number;
	attemptId: string;
	startEditRevision: number;
	startSeq: number;
}

interface RestoreOptions {
	cwd: string;
	mode: PlanModeRuntimeMode;
	currentPlanPath?: string | undefined;
	entries?: readonly unknown[];
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object"
		&& (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function integer(value: unknown, max = Number.MAX_SAFE_INTEGER, min = 0): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function initialEvidence(attemptId: string, planPath?: string): PersistedExecutionEvidenceSnapshot {
	return {
		attemptId, ...(planPath !== undefined && { planPath }), contractHash: EMPTY_CONTRACT_HASH, requiredCheckCount: 0, editRevision: 0,
		editedPaths: [], editedPathsTruncated: false, passedRequiredRevisions: {}, hasObservedExecutionTurn: false,
	};
}

function parseLastCheck(value: unknown, count: number): PersistedLastCheckState | undefined {
	if (!record(value) || !record(value.ref) || !outcomes.has(value.outcome) || !integer(value.consecutiveFailures)) return;
	const { ref, consecutiveFailures } = value;
	const outcome = value.outcome as VerificationCheckOutcome;
	if ((!strikes.has(outcome) || ref.kind === "unconfirmed") && consecutiveFailures !== 0) return;
	if (ref.kind === "plan" && integer(ref.index, count, 1)) return { ref: { kind: "plan", index: ref.index }, outcome, consecutiveFailures };
	if (ref.kind === "generic" && runnerIds.has(ref.runner)) return { ref: { kind: "generic", runner: ref.runner as AllowlistedRunnerId }, outcome, consecutiveFailures };
	if (ref.kind === "unconfirmed") return { ref: { kind: "unconfirmed" }, outcome, consecutiveFailures };
}

function parseSnapshot(value: unknown, cwd: string): PersistedExecutionEvidenceSnapshot | undefined {
	if (!record(value)) return;
	const { attemptId, planPath, contractHash, requiredCheckCount, editRevision, sourceEditRevision, unverifiedDebt,
		editedPaths, editedPathsTruncated, passedRequiredRevisions, substantivePassedRevision, lastCheck, hasObservedExecutionTurn } = value;
	if (typeof attemptId !== "string" || (attemptId !== "recovery" && !uuid.test(attemptId))
		|| (planPath !== undefined && typeof planPath !== "string")
		|| typeof contractHash !== "string" || !/^[0-9a-f]{64}$/.test(contractHash)
		|| !integer(requiredCheckCount, 100) || (requiredCheckCount === 0 && contractHash !== EMPTY_CONTRACT_HASH)
		|| !integer(editRevision) || (sourceEditRevision !== undefined && !integer(sourceEditRevision, editRevision))
		|| (substantivePassedRevision !== undefined && !integer(substantivePassedRevision, editRevision))
		|| (unverifiedDebt !== undefined && unverifiedDebt !== true)
		|| !Array.isArray(editedPaths) || editedPaths.length > MAX_EDITED_PATHS || new Set(editedPaths).size !== editedPaths.length
		|| typeof editedPathsTruncated !== "boolean" || !record(passedRequiredRevisions) || typeof hasObservedExecutionTurn !== "boolean") return;
	const paths: string[] = [];
	for (const path of editedPaths) {
		if (typeof path !== "string" || path === "." || isAbsolute(path) || /[\\\x00-\x1f\x7f-\x9f]/.test(path)
			|| path.split("/").includes("..") || normalizeRelativeCwd(cwd, path) !== path) return;
		paths.push(path);
	}
	const revisions: Record<string, number> = {};
	for (const [key, revision] of Object.entries(passedRequiredRevisions)) {
		if (!/^V[1-9]\d*$/.test(key) || Number(key.slice(1)) > requiredCheckCount || !integer(revision, editRevision)) return;
		revisions[key] = revision;
	}
	const check = parseLastCheck(lastCheck, requiredCheckCount);
	if (lastCheck !== undefined && !check) return;
	if (attemptId === "recovery" && (requiredCheckCount !== 0 || editRevision !== 0 || unverifiedDebt !== true
		|| sourceEditRevision !== undefined || substantivePassedRevision !== undefined || paths.length !== 0
		|| editedPathsTruncated || check || hasObservedExecutionTurn)) return;
	return {
		attemptId, ...(planPath !== undefined && { planPath }), contractHash, requiredCheckCount, editRevision,
		...(sourceEditRevision !== undefined && { sourceEditRevision }), ...(unverifiedDebt === true && { unverifiedDebt }),
		editedPaths: paths, editedPathsTruncated, passedRequiredRevisions: revisions,
		...(substantivePassedRevision !== undefined && { substantivePassedRevision }),
		...(check && { lastCheck: check }), hasObservedExecutionTurn,
	};
}

function strictlyInside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function readArchivedContract(cwd: string, planPath: string): string | undefined {
	const archive = `${ARCHIVE_DIRECTORY}/plan`;
	const archivedPlan = `${archive}/${planPath.slice(PLAN_DIRECTORY.length + 1)}`;
	const archiveRoot = canonicalPath(cwd, ARCHIVE_DIRECTORY);
	const root = canonicalPath(cwd, archive);
	const target = canonicalPath(cwd, archivedPlan);
	if (strictlyInside(canonicalPath(cwd, "."), archiveRoot) && strictlyInside(archiveRoot, root)
		&& strictlyInside(root, target)) return readFileSync(target, "utf8");
}

export class ExecutionEvidenceController {
	private evidence: PersistedExecutionEvidenceSnapshot | undefined;
	private compiledChecks: readonly CompiledVerificationCheck[] = [];
	private lastFailedGenericUnitsKey: string | undefined;
	private runSequence = 0;
	private toolSeq = 0;
	private readonly inFlightTools = new Map<string, InFlightToolRecord>();
	private lastFailureCompletedAtSeq = 0;
	private readonly lastFailureCompletedAtSeqByRef = new Map<string, number>();
	activeRunId = 0;
	hasDispatchedExecutionHandoff = false;
	runContinuationCount = 0;
	lastProgressFingerprint: string | undefined;
	latestSignal: ExecutionSignal | undefined;
	pauseState: ExecutionPauseState | undefined;
	replanTrigger: ExecutionReplanTrigger | undefined;
	lastBeforeSettleOutcome: ExecutionSettleGateInput["outcome"] | undefined;
	pendingCompletion: PendingCompletion | undefined;
	pendingNonUiStatusNotice: PendingNonUiStatusNotice | undefined;

	get attemptId() { return this.evidence?.attemptId; }
	get hasObservedExecutionTurn() { return this.evidence?.hasObservedExecutionTurn ?? false; }

	get hasSourceDebt(): boolean {
		const evidence = this.evidence;
		return evidence?.sourceEditRevision !== undefined
			&& (evidence.substantivePassedRevision === undefined || evidence.substantivePassedRevision < evidence.sourceEditRevision);
	}

	get hasInheritedDebt(): boolean {
		const evidence = this.evidence;
		return evidence?.unverifiedDebt === true
			&& (evidence.substantivePassedRevision === undefined || evidence.substantivePassedRevision < evidence.editRevision);
	}

	get needsSubstantiveVerification(): boolean {
		return this.hasSourceDebt || this.hasInheritedDebt;
	}

	get missingRequiredCheckIndices(): number[] {
		const evidence = this.evidence;
		const missing: number[] = [];
		if (evidence) for (let i = 1; i <= evidence.requiredCheckCount; i++) {
			if (evidence.passedRequiredRevisions[`V${i}`] !== evidence.editRevision) missing.push(i);
		}
		return missing;
	}

	projectUxSummary(mode: PlanModeRuntimeMode, planPath: string | undefined, todos: readonly TodoItem[]): SafeExecutionUxSummary {
		const evidence = this.evidence;
		const remainingTodoSteps = todos.filter(todo => !todo.completed).map(todo => todo.step);
		const requiredCheckCount = evidence?.requiredCheckCount ?? 0;
		const missingRequiredCheckIndices = this.missingRequiredCheckIndices;
		return {
			mode, ...(planPath !== undefined && { planPath }), todoCompleted: todos.length - remainingTodoSteps.length,
			todoTotal: todos.length, remainingTodoSteps,
			editRevision: evidence?.editRevision ?? 0, requiredCheckCount,
			passedRequiredCheckCount: requiredCheckCount - missingRequiredCheckIndices.length, missingRequiredCheckIndices,
			needsSubstantiveVerification: this.needsSubstantiveVerification,
			...(evidence?.lastCheck && { lastCheck: structuredClone(evidence.lastCheck) }),
			continuationCount: this.runContinuationCount, maxContinuations: 3,
			...(this.pauseState && { pauseState: this.pauseState }), ...(this.replanTrigger && { replanTrigger: this.replanTrigger }),
		};
	}

	snapshot(): PersistedExecutionEvidenceSnapshot | undefined {
		return this.evidence && structuredClone(this.evidence);
	}

	restore(rawSnapshot: unknown, options: RestoreOptions): boolean {
		this.clear();
		const { cwd, mode, currentPlanPath, entries } = options;
		const evidence = parseSnapshot(rawSnapshot, cwd);
		if (!evidence || (evidence.attemptId === "recovery" && mode !== "planning")) return false;
		const path = evidence.planPath;
		const resolved = path === undefined ? undefined : resolveValidatedPlanPath(cwd, path);
		if (path !== undefined && (resolved?.planPath !== path || currentPlanPath !== path)) return false;
		if (mode === "executing") {
			let marker: Record<string, unknown> | undefined;
			for (let i = (entries?.length ?? 0) - 1; i >= 0; i--) {
				const entry = entries?.[i];
				if (record(entry) && entry.type === "custom" && entry.customType === "plan-mode-execute"
					&& record(entry.data) && entry.data.attemptId === evidence.attemptId) {
					marker = entry.data;
					break;
				}
			}
			if (!marker || marker.planPath !== path || currentPlanPath !== path) return false;
			let markdown = "";
			try {
				if (resolved) {
					try { markdown = readFileSync(resolved.target, "utf8"); }
					catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ENOENT" || evidence.requiredCheckCount === 0) return false;
						const archived = readArchivedContract(cwd, resolved.planPath);
						if (archived === undefined) return false;
						markdown = archived;
					}
				}
			} catch { return false; }
			const contract = extractPlanVerificationContract(markdown, cwd);
			if (!contract.ok || contract.contractHash !== evidence.contractHash || contract.checks.length !== evidence.requiredCheckCount) return false;
			this.compiledChecks = contract.checks;
			evidence.passedRequiredRevisions = {};
			delete evidence.substantivePassedRevision;
			if (evidence.lastCheck?.outcome === "passed") delete evidence.lastCheck;
			this.activeRunId = ++this.runSequence;
			this.hasDispatchedExecutionHandoff = evidence.hasObservedExecutionTurn;
		}
		this.evidence = evidence;
		return true;
	}

	clear(): void {
		this.evidence = undefined;
		this.compiledChecks = [];
		this.lastFailedGenericUnitsKey = undefined;
		this.clearVolatileRunState();
	}

	beginRecovery(planPath?: string): void {
		this.clear();
		this.evidence = { ...initialEvidence("recovery", planPath), unverifiedDebt: true };
	}

	beginApprovedExecution({ planPath, checks, contractHash, carryForwardDebt }: {
		planPath?: string;
		checks: readonly CompiledVerificationCheck[];
		contractHash: string;
		carryForwardDebt?: boolean;
	}): string {
		const priorCheck = this.evidence?.lastCheck;
		const retainDebt = carryForwardDebt && this.evidence?.planPath === planPath
			&& (this.needsSubstantiveVerification || (priorCheck !== undefined && priorCheck.outcome !== "passed"));
		this.clear();
		const attemptId = randomUUID();
		this.evidence = {
			...initialEvidence(attemptId, planPath), contractHash, requiredCheckCount: checks.length,
			...(retainDebt && { unverifiedDebt: true }),
		};
		this.compiledChecks = checks;
		this.activeRunId = ++this.runSequence;
		return attemptId;
	}

	beginRun(): void {
		this.clearVolatileRunState();
		this.activeRunId = ++this.runSequence;
		this.markHandoffDispatched();
	}

	clearVolatileRunState(): void {
		this.activeRunId = 0;
		this.hasDispatchedExecutionHandoff = false;
		this.runContinuationCount = 0;
		this.lastProgressFingerprint = undefined;
		this.latestSignal = undefined;
		this.pauseState = undefined;
		this.replanTrigger = undefined;
		this.lastBeforeSettleOutcome = undefined;
		this.pendingCompletion = undefined;
		this.pendingNonUiStatusNotice = undefined;
		this.clearInFlightTools();
		this.lastFailureCompletedAtSeq = 0;
		this.lastFailureCompletedAtSeqByRef.clear();
	}

	markHandoffDispatched(): void { this.hasDispatchedExecutionHandoff = true; }
	markObservedExecutionTurn(): void { if (this.evidence) this.evidence.hasObservedExecutionTurn = true; }
	recordExecutionSignal(signal?: ExecutionSignal): void { this.latestSignal = signal && { kind: signal.kind }; }

	clearInFlightTools(): void { this.inFlightTools.clear(); }

	recordToolStart(toolCallId: string, generation: number): void {
		if (this.evidence) this.inFlightTools.set(toolCallId, {
			generation, attemptId: this.evidence.attemptId, startEditRevision: this.evidence.editRevision, startSeq: ++this.toolSeq,
		});
	}

	consumeToolStart(toolCallId: string): InFlightToolRecord | undefined {
		const start = this.inFlightTools.get(toolCallId);
		this.cleanupToolCall(toolCallId);
		return start;
	}

	cleanupToolCall(toolCallId: string): void { this.inFlightTools.delete(toolCallId); }

	recordObservedEdit(cwd: string, rawPath: string): boolean {
		const evidence = this.evidence;
		if (!evidence) return false;
		const classification = classifyEditTrackingPath(cwd, rawPath);
		if (!classification.invalidatesPlanChecks) return false;
		evidence.editRevision++;
		this.pendingCompletion = undefined;
		if (classification.tracked) {
			evidence.sourceEditRevision = evidence.editRevision;
			if (!evidence.editedPaths.includes(classification.normalizedPath)) {
				if (evidence.editedPaths.length < MAX_EDITED_PATHS) evidence.editedPaths.push(classification.normalizedPath);
				else evidence.editedPathsTruncated = true;
			}
		}
		return true;
	}

	recordObservedCommands(cwd: string, event: Parameters<typeof extractObservedCommandOutcomes>[1], start: InFlightToolRecord): boolean {
		const evidence = this.evidence;
		if (!evidence || evidence.attemptId !== start.attemptId) return false;
		const rows = extractObservedCommandOutcomes(cwd, event).map(row => matchVerificationCommand(this.compiledChecks, row, cwd));
		const observations = rows.flatMap<{
			row: ReturnType<typeof matchVerificationCommand>; key: string; ref: SafeCheckRef; genericUnitsKey?: string;
		}>(row => {
			const { matchedPlanChecks, genericRunner, ambiguousChainFailure, units } = row;
			if (matchedPlanChecks.length) return matchedPlanChecks.map(check => ({
				row, key: check.key, ref: { kind: "plan" as const, index: check.index },
			}));
			if (genericRunner) {
				const genericUnitsKey = JSON.stringify(units);
				return [{ row, key: genericUnitsKey, ref: { kind: "generic", runner: genericRunner }, genericUnitsKey }];
			}
			return ambiguousChainFailure ? [{ row, key: "unconfirmed", ref: { kind: "unconfirmed" } }] : [];
		});
		const parallel = (rows[0]?.batchConcurrency ?? 0) > 1;
		const nonPasses = observations.filter(({ row }) => row.outcome !== "passed");
		const failedKeys = new Set(nonPasses.map(({ key }) => key));
		const strikeKeys = new Set(nonPasses.filter(({ row }) => row.countsAsFailure).map(({ key }) => key));
		const appliedStrikes = new Set<string>();
		const fresh = start.startEditRevision === evidence.editRevision;
		let changed = false;
		for (const { row, key, ref, genericUnitsKey } of parallel
			? [...observations.filter(({ row, key }) => row.outcome === "passed" && !failedKeys.has(key)), ...nonPasses]
			: observations) {
			const afterRefFailure = start.startSeq > (this.lastFailureCompletedAtSeqByRef.get(key) ?? 0);
			if (row.outcome === "passed") {
				if (!fresh || !afterRefFailure) continue;
				if (ref.kind === "plan") {
					evidence.passedRequiredRevisions[key] = evidence.editRevision;
					changed = true;
				}
				if (start.startSeq <= this.lastFailureCompletedAtSeq) continue;
				if (row.satisfiesSubstantive) {
					evidence.substantivePassedRevision = evidence.editRevision;
					delete evidence.unverifiedDebt;
				}
				evidence.lastCheck = { ref, outcome: row.outcome, consecutiveFailures: 0 };
				this.lastFailedGenericUnitsKey = undefined;
			} else {
				if (row.countsAsFailure && appliedStrikes.has(key)) continue;
				if (parallel && !row.countsAsFailure && strikeKeys.has(key)) continue;
				if (row.countsAsFailure) appliedStrikes.add(key);
				const previous = evidence.lastCheck;
				const sameCheck = ref.kind === "plan" ? previous?.ref.kind === "plan" && previous.ref.index === ref.index
					: ref.kind === "generic" && previous?.ref.kind === "generic" && genericUnitsKey === this.lastFailedGenericUnitsKey;
				const consecutiveFailures = row.countsAsFailure
					? (fresh && afterRefFailure && sameCheck ? previous?.consecutiveFailures ?? 0 : 0) + 1 : 0;
				if (ref.kind === "plan") delete evidence.passedRequiredRevisions[key];
				if (evidence.substantivePassedRevision === evidence.editRevision) delete evidence.substantivePassedRevision;
				evidence.lastCheck = { ref, outcome: row.outcome, consecutiveFailures };
				this.lastFailedGenericUnitsKey = row.countsAsFailure ? genericUnitsKey : undefined;
				this.lastFailureCompletedAtSeq = ++this.toolSeq;
				this.lastFailureCompletedAtSeqByRef.set(key, this.lastFailureCompletedAtSeq);
			}
			changed = true;
		}
		if (changed) this.pendingCompletion = undefined;
		return changed;
	}
}
