import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const DOTDOTGOD_WORKFLOW_CUSTOM_TYPE = "dotdotgod-workflow";

export type DotdotgodWorkflowName = "plan-goal";
export type DotdotgodWorkflowStatus = "active" | "stopped" | "completed" | "blocked";

export interface DotdotgodWorkflowState {
  activeWorkflow?: DotdotgodWorkflowName | undefined;
  suppressPlanModeExecutionPrompt: boolean;
  planPath?: string | undefined;
  stage?: string | undefined;
  status: DotdotgodWorkflowStatus;
  reason?: string | undefined;
  updatedAt: string;
}

function inactiveState(status: Exclude<DotdotgodWorkflowStatus, "active">, reason?: string): DotdotgodWorkflowState {
  return {
    activeWorkflow: undefined,
    suppressPlanModeExecutionPrompt: false,
    status,
    reason,
    updatedAt: new Date().toISOString(),
  };
}

let workflowState: DotdotgodWorkflowState = inactiveState("stopped");

export function getDotdotgodWorkflowState(): DotdotgodWorkflowState {
  return { ...workflowState };
}

export function isPlanGoalWorkflowActive(): boolean {
  return (
    workflowState.activeWorkflow === "plan-goal" &&
    workflowState.status === "active" &&
    workflowState.suppressPlanModeExecutionPrompt
  );
}

export function restorePlanGoalWorkflowActive(entries: readonly unknown[]): boolean {
  restoreDotdotgodWorkflowState(entries);
  return isPlanGoalWorkflowActive();
}

export function setDotdotgodWorkflowState(
  pi: Pick<ExtensionAPI, "appendEntry"> | undefined,
  state: Omit<DotdotgodWorkflowState, "updatedAt"> & { updatedAt?: string },
): DotdotgodWorkflowState {
  workflowState = {
    ...state,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
  pi?.appendEntry(DOTDOTGOD_WORKFLOW_CUSTOM_TYPE, workflowState);
  return getDotdotgodWorkflowState();
}

export function activatePlanGoalWorkflow(
  pi: Pick<ExtensionAPI, "appendEntry"> | undefined,
  state: { planPath?: string | undefined; stage?: string | undefined; reason?: string | undefined },
): DotdotgodWorkflowState {
  return setDotdotgodWorkflowState(pi, {
    activeWorkflow: "plan-goal",
    suppressPlanModeExecutionPrompt: true,
    status: "active",
    planPath: state.planPath,
    stage: state.stage,
    reason: state.reason,
  });
}

export function clearDotdotgodWorkflowState(
  pi: Pick<ExtensionAPI, "appendEntry"> | undefined,
  status: Exclude<DotdotgodWorkflowStatus, "active"> = "stopped",
  reason?: string,
): DotdotgodWorkflowState {
  return setDotdotgodWorkflowState(pi, inactiveState(status, reason));
}

export function restoreDotdotgodWorkflowState(entries: readonly unknown[]): DotdotgodWorkflowState {
  workflowState = inactiveState("stopped");
  for (const entry of entries) {
    const candidate = entry as {
      type?: unknown;
      customType?: unknown;
      data?: unknown;
      message?: { role?: unknown; customType?: unknown; details?: unknown };
    };
    const value = candidate.type === "custom" && candidate.customType === DOTDOTGOD_WORKFLOW_CUSTOM_TYPE
      ? candidate.data
      : candidate.type === "message" &&
          candidate.message?.role === "custom" &&
          candidate.message.customType === DOTDOTGOD_WORKFLOW_CUSTOM_TYPE
        ? candidate.message.details
        : undefined;
    if (!value || typeof value !== "object") continue;
    const state = value as Partial<DotdotgodWorkflowState>;
    const status = state.status;
    if (!["active", "stopped", "completed", "blocked"].includes(status ?? "")) continue;
    workflowState = {
      activeWorkflow: state.activeWorkflow === "plan-goal" ? "plan-goal" : undefined,
      suppressPlanModeExecutionPrompt: state.suppressPlanModeExecutionPrompt === true,
      planPath: typeof state.planPath === "string" ? state.planPath : undefined,
      stage: typeof state.stage === "string" ? state.stage : undefined,
      status: status as DotdotgodWorkflowStatus,
      reason: typeof state.reason === "string" ? state.reason : undefined,
      updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date().toISOString(),
    };
  }
  return getDotdotgodWorkflowState();
}
