import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PLAN_DIRECTORY, isActivePlanPath, planPathExists } from "../runtime/paths.ts";
import {
	getCurrentPlanReadmePath,
	resolvePlanExecutionTarget,
	type PlanExecutionTargetResolution,
} from "../plans.ts";

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

	setActivePlan(path: string | undefined): void {
		this.currentPlanPath = path;
		this.pendingReviewPath = path;
	}

	setActivePlanFromMarkdownPath(path: string): void {
		this.setActivePlan(getCurrentPlanReadmePath(path) ?? this.currentPlanPath);
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
				.filter((path) => planPathExists(cwd, path));
		} catch {
			return [];
		}
	}

	loadExistingPlanPath(cwd: string, requestOrPath: string): string | undefined {
		const normalized = requestOrPath.trim().replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "");
		const planPrefix = `${PLAN_DIRECTORY}/`;
		const directoryMatch = normalized.startsWith(planPrefix) ? normalized.slice(planPrefix.length).match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/) : null;
		const planPath = directoryMatch?.[1]
			? `${PLAN_DIRECTORY}/${directoryMatch[1]}/README.md`
			: getCurrentPlanReadmePath(normalized) ?? normalized;
		if (!planPath.startsWith(`${PLAN_DIRECTORY}/`) || !planPath.endsWith("/README.md")) return undefined;
		if (!existsSync(resolve(cwd, planPath))) return undefined;
		this.setActivePlan(planPath);
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
			pathExists: (path) => planPathExists(cwd, path),
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
