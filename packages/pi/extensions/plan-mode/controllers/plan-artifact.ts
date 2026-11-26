import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { canonicalPath } from "../policy/markdown.ts";
import { PLAN_DIRECTORY, isActivePlanPath, isActivePlanMarkdownPath } from "../runtime/paths.ts";
import {
	getCurrentPlanReadmePath,
	resolvePlanExecutionTarget,
	type PlanExecutionTargetResolution,
} from "../plans.ts";

function strictlyInside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

export function resolveValidatedPlanPath(cwd: string, candidate?: string): { planPath: string; target: string } | undefined {
	if (!candidate || /[\x00-\x1f\x7f-\x9f]/.test(candidate)) return undefined;
	const planPath = candidate.trim().replace(/^@/, "").replaceAll("\\", "/").replace(/^\.\//, "");
	const prefix = `${PLAN_DIRECTORY}/`;
	if (!planPath.startsWith(prefix) || !/^[a-z0-9]+(?:-[a-z0-9]+)*\/README\.md$/.test(planPath.slice(prefix.length))) return undefined;
	try {
		const workspace = canonicalPath(cwd, ".");
		const plans = canonicalPath(cwd, PLAN_DIRECTORY);
		const target = canonicalPath(cwd, planPath);
		if (strictlyInside(workspace, plans) && strictlyInside(plans, target)) return { planPath, target };
	} catch { /* An unresolved path is not reviewable. */ }
	return undefined;
}

export function validatePlanPath(cwd: string, candidate?: string): string | undefined {
	return resolveValidatedPlanPath(cwd, candidate)?.planPath;
}

export function isValidTouchedPlanPath(cwd: string, path: string): boolean {
	if (isAbsolute(path) || /[\\\x00-\x1f\x7f-\x9f]/.test(path) || path.split("/").includes("..") || !isActivePlanMarkdownPath(cwd, path)) return false;
	try {
		const root = canonicalPath(cwd, PLAN_DIRECTORY);
		return strictlyInside(canonicalPath(cwd, "."), root) && strictlyInside(root, canonicalPath(cwd, path));
	} catch { return false; }
}

function existingPlanPath(cwd: string, candidate?: string): string | undefined {
	const file = resolveValidatedPlanPath(cwd, candidate);
	return file && existsSync(file.target) ? file.planPath : undefined;
}

export interface PlanArtifactSnapshot {
	currentPlanPath?: string;
	pendingReviewPath?: string;
	suppressChoiceForInlineRequest: boolean;
	lastPlanningRequest?: string;
	pendingInlinePlanningRequest?: string;
	touchedPlanPaths: string[];
}

export class PlanArtifactController {
	currentPlanPath: string | undefined;
	pendingReviewPath: string | undefined;
	suppressChoiceForInlineRequest = false;
	lastPlanningRequest: string | undefined;
	pendingInlinePlanningRequest: string | undefined;
	touchedPlanPaths: string[] = [];

	resetForPlanningRequest(request?: string): void {
		this.lastPlanningRequest = request;
		this.pendingInlinePlanningRequest = request;
		this.pendingReviewPath = undefined;
		this.suppressChoiceForInlineRequest = true;
	}

	resetForFreshPlanning(): void {
		this.currentPlanPath = undefined;
		this.pendingReviewPath = undefined;
		this.suppressChoiceForInlineRequest = false;
		this.pendingInlinePlanningRequest = undefined;
	}

	markTouched(path: string): void {
		if (!this.touchedPlanPaths.includes(path)) {
			this.touchedPlanPaths = [...this.touchedPlanPaths, path].slice(-12);
		}
	}

	setActivePlan(path: string | undefined, preserveApproved = false): void {
		if (!preserveApproved) this.currentPlanPath = path;
		this.pendingReviewPath = path;
	}

	setActivePlanFromMarkdownPath(path: string, preserveApproved = false): void {
		this.setActivePlan(getCurrentPlanReadmePath(path) ?? this.currentPlanPath, preserveApproved);
	}

	inferPlanPath(): string | undefined {
		return (
			this.pendingReviewPath ??
			this.currentPlanPath ??
			getCurrentPlanReadmePath(
				this.touchedPlanPaths.find(isActivePlanPath) ?? "",
			)
		);
	}

	listActivePlanReadmes(cwd: string): string[] {
		try {
			return readdirSync(resolve(cwd, PLAN_DIRECTORY), { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
				.map((entry) => `${PLAN_DIRECTORY}/${entry.name}/README.md`)
				.filter((path) => existingPlanPath(cwd, path));
		} catch {
			return [];
		}
	}

	loadExistingPlanPath(cwd: string, requestOrPath: string, preserveApproved = false): string | undefined {
		if (/[\x00-\x1f\x7f-\x9f]/.test(requestOrPath)) return undefined;
		const normalized = requestOrPath.trim().replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "");
		const planPrefix = `${PLAN_DIRECTORY}/`;
		const directoryMatch = normalized.startsWith(planPrefix) ? normalized.slice(planPrefix.length).match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/) : null;
		const planPath = existingPlanPath(cwd, directoryMatch?.[1]
			? `${PLAN_DIRECTORY}/${directoryMatch[1]}/README.md`
			: getCurrentPlanReadmePath(normalized));
		if (!planPath) return undefined;
		this.setActivePlan(planPath, preserveApproved);
		this.suppressChoiceForInlineRequest = false;
		return planPath;
	}

	resolveExecutionTarget(cwd: string, request: string): PlanExecutionTargetResolution {
		return resolvePlanExecutionTarget({
			request,
			currentPlanPath: this.currentPlanPath,
			pendingPlanChoicePath: this.pendingReviewPath,
			touchedPaths: this.touchedPlanPaths,
			activePlanPaths: this.listActivePlanReadmes(cwd),
			allowActivePlanFallback: true,
			pathExists: (path) => existingPlanPath(cwd, path) !== undefined,
		});
	}

	snapshot(): PlanArtifactSnapshot {
		return {
			...(this.currentPlanPath ? { currentPlanPath: this.currentPlanPath } : {}),
			...(this.pendingReviewPath ? { pendingReviewPath: this.pendingReviewPath } : {}),
			suppressChoiceForInlineRequest: this.suppressChoiceForInlineRequest,
			...(this.lastPlanningRequest ? { lastPlanningRequest: this.lastPlanningRequest } : {}),
			...(this.pendingInlinePlanningRequest ? { pendingInlinePlanningRequest: this.pendingInlinePlanningRequest } : {}),
			touchedPlanPaths: [...this.touchedPlanPaths],
		};
	}

	restore(snapshot: PlanArtifactSnapshot | undefined): void {
		if (!snapshot) return;
		this.currentPlanPath = snapshot.currentPlanPath;
		this.pendingReviewPath = snapshot.pendingReviewPath;
		this.suppressChoiceForInlineRequest = snapshot.suppressChoiceForInlineRequest;
		this.lastPlanningRequest = snapshot.lastPlanningRequest;
		this.pendingInlinePlanningRequest = snapshot.pendingInlinePlanningRequest;
		this.touchedPlanPaths = [...snapshot.touchedPlanPaths];
	}
}
