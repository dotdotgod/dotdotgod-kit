export function detectPlanExecutionIntent(text: string): boolean {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return false;
	return /^Execute the plan in docs\/plan\/[a-z0-9]+(?:-[a-z0-9]+)*\/README\.md\b/i.test(normalized);
}

import { PLAN_DIRECTORY } from "./runtime/paths.ts";

export type PlanModeRequestKind = "advisory" | "explicit_execution";

export interface LatestPlanningRequestSelectionInput {
	currentRequest?: string | undefined;
	latestUserText?: string | undefined;
	pendingInlineRequest?: string | undefined;
}

export interface LatestPlanningRequestSelection {
	request?: string | undefined;
	pendingInlineRequest?: string | undefined;
	changed: boolean;
}

export function isPlanModeRuntimeRequest(text: string | undefined): boolean {
	const normalized = (text ?? "").trim();
	return (
		!normalized ||
		normalized.includes("[PLAN MODE ACTIVE]") ||
		normalized.startsWith("Continue the latest Plan Mode request after planning-focused compaction.") ||
		normalized.startsWith("Continue the following Plan Mode request after planning-focused compaction.")
	);
}

export function selectLatestPlanningRequest(input: LatestPlanningRequestSelectionInput): LatestPlanningRequestSelection {
	const currentRequest = input.currentRequest;
	const latestUserText = input.latestUserText?.trim();
	const pendingInlineRequest = input.pendingInlineRequest?.trim();

	if (pendingInlineRequest) {
		if (latestUserText === pendingInlineRequest && !isPlanModeRuntimeRequest(latestUserText)) {
			return {
				request: latestUserText,
				pendingInlineRequest: undefined,
				changed: currentRequest !== latestUserText || input.pendingInlineRequest !== undefined,
			};
		}
		return { request: currentRequest, pendingInlineRequest, changed: false };
	}

	if (!isPlanModeRuntimeRequest(latestUserText)) {
		return {
			request: latestUserText,
			pendingInlineRequest: undefined,
			changed: currentRequest !== latestUserText,
		};
	}

	return { request: currentRequest, pendingInlineRequest: undefined, changed: false };
}

export function classifyPlanModeRequest(text: string | undefined): PlanModeRequestKind {
	const normalized = (text ?? "").replace(/\s+/g, " ").trim();
	if (!normalized) return "advisory";
	if (detectPlanExecutionIntent(normalized)) return "explicit_execution";
	return "advisory";
}

export function buildPlanModeRequestFraming(latestRequest: string | undefined): string {
	const kind = classifyPlanModeRequest(latestRequest);
	if (kind === "explicit_execution") {
		return `Plan Mode request framing: the latest user request appears to explicitly execute an active plan. Resolve the referenced ${PLAN_DIRECTORY}/<task-slug>/README.md through the existing Plan Mode execution path before making source/code/config changes.`;
	}
	return `Plan Mode request framing: treat the latest user request as advisory or planning work. Answer without source/code/config changes. Create or update a ${PLAN_DIRECTORY}/<task-slug>/README.md file only when durable implementation steps are needed.`;
}

