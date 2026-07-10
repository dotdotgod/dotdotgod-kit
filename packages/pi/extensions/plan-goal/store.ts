import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { PlanGoalStageId } from "./stage-contract.ts";

const PLAN_GOAL_STORE_TYPE = "plan-goal";

export type PlanGoalStatus =
  | "pass"
  | "active"
  | "input-waiting"
  | "blocked"
  | "stopped";

export interface PlanGoalStoreState {
  currentPlan?: string | undefined;
  currentStage?: PlanGoalStageId | undefined;
  breaker: number;
  status: PlanGoalStatus;
  message?: string | undefined;
  originalRequest?: string | undefined;
  waitingMessage?: string | undefined;
  latestUserInput?: string | undefined;
  lastResumedUserInput?: string | undefined;
}

const initialState: PlanGoalStoreState = {
  breaker: 0,
  status: "stopped",
};

export interface PlanGoalStore {
  getState(): PlanGoalStoreState;
  updateState(patch: Partial<PlanGoalStoreState>): void;
  restore(ctx: ExtensionContext): void;
}

function normalizeStoreState(
  value: Partial<PlanGoalStoreState>,
): PlanGoalStoreState {
  return {
    ...initialState,
    ...value,
    breaker:
      typeof value.breaker === "number" && Number.isFinite(value.breaker)
        ? value.breaker
        : initialState.breaker,
    status: value.status ?? initialState.status,
  };
}

function readPlanGoalState(
  details: unknown,
): PlanGoalStoreState | undefined {
  if (!details || typeof details !== "object") return undefined;
  return normalizeStoreState(details as Partial<PlanGoalStoreState>);
}

export function createPlanGoalStore(pi: ExtensionAPI): PlanGoalStore {
  let state: PlanGoalStoreState = { ...initialState };

  const getState = (): PlanGoalStoreState => ({ ...state });

  const persist = (): void => {
    pi.sendMessage(
      {
        customType: PLAN_GOAL_STORE_TYPE,
        content: `Plan goal state: ${state.currentPlan ?? "none"}`,
        display: false,
        details: getState(),
      },
      { deliverAs: "nextTurn" },
    );
  };

  const updateState = (patch: Partial<PlanGoalStoreState>): void => {
    state = normalizeStoreState({ ...state, ...patch });
    persist();
  };

  const restore = (ctx: ExtensionContext): void => {
    let restoredState: PlanGoalStoreState | undefined;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;

      const msg = entry.message;
      let restored: PlanGoalStoreState | undefined;
      if (
        msg.role === "toolResult" &&
        msg.toolName === PLAN_GOAL_STORE_TYPE
      ) {
        restored = readPlanGoalState(msg.details);
      } else if (
        msg.role === "custom" &&
        msg.customType === PLAN_GOAL_STORE_TYPE
      ) {
        restored = readPlanGoalState(msg.details);
      }
      if (restored) restoredState = restored;
    }

    if (restoredState) state = restoredState;
  };

  return {
    getState,
    updateState,
    restore,
  };
}

export function initPlanGoalStore(
  pi: ExtensionAPI,
  store: PlanGoalStore,
): void {
  pi.on("session_start", async (_event, ctx) => {
    store.restore(ctx);
  });
  pi.on("session_tree", async (_event, ctx) => {
    store.restore(ctx);
  });
}
