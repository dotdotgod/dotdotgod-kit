import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const DOTDOTGOD_WORKFLOW_CUSTOM_TYPE = "dotdotgod-workflow";

export interface DotdotgodWorkflowState {
  activeWorkflow?: "plan-goal" | undefined;
  status: "active" | "stopped";
  updatedAt: string;
}

function inactiveState(): DotdotgodWorkflowState {
  return {
    activeWorkflow: undefined,
    status: "stopped",
    updatedAt: new Date().toISOString(),
  };
}

let workflowState: DotdotgodWorkflowState = inactiveState();

export function getDotdotgodWorkflowState(): DotdotgodWorkflowState {
  return { ...workflowState };
}

export function isPlanGoalWorkflowActive(): boolean {
  return workflowState.activeWorkflow === "plan-goal" && workflowState.status === "active";
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
): DotdotgodWorkflowState {
  return setDotdotgodWorkflowState(pi, {
    activeWorkflow: "plan-goal",
    status: "active",
  });
}

export function clearDotdotgodWorkflowState(
  pi: Pick<ExtensionAPI, "appendEntry"> | undefined,
): DotdotgodWorkflowState {
  return setDotdotgodWorkflowState(pi, inactiveState());
}

export function restoreDotdotgodWorkflowState(entries: readonly unknown[]): DotdotgodWorkflowState {
  workflowState = inactiveState();
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
    const state = value as Partial<DotdotgodWorkflowState> & { status?: unknown };
    const rawStatus = state.status;
    // normalize legacy "completed"/"blocked" statuses to "stopped"
    const status: "active" | "stopped" = rawStatus === "active" ? "active" : "stopped";
    workflowState = {
      activeWorkflow: state.activeWorkflow === "plan-goal" ? "plan-goal" : undefined,
      status,
      updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date().toISOString(),
    };
  }
  return getDotdotgodWorkflowState();
}
