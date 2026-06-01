import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { PlanGeneratorStageId } from "./stage-contract.ts";

const PLAN_GENERATOR_STORE_TYPE = "plan-generator";

export type PlanGeneratorStatus =
  | "pass"
  | "idle"
  | "active"
  | "input-waiting"
  | "blocked"
  | "stopped";

export interface PlanGeneratorStoreState {
  currentPlan?: string | undefined;
  currentStage?: PlanGeneratorStageId | undefined;
  breaker: number;
  status: PlanGeneratorStatus;
  message?: string | undefined;
  originalRequest?: string | undefined;
  waitingMessage?: string | undefined;
  latestUserInput?: string | undefined;
  lastResumedUserInput?: string | undefined;
}

const initialState: PlanGeneratorStoreState = {
  breaker: 0,
  status: "idle",
};

export interface PlanGeneratorStore {
  getState(): PlanGeneratorStoreState;
  setCurrentPlan(currentPlan: string | undefined): void;
  setCurrentStage(currentStage: PlanGeneratorStageId | undefined): void;
  setStatus(status: PlanGeneratorStatus, message?: string): void;
  updateState(patch: Partial<PlanGeneratorStoreState>): void;
  addBreaker(): void;
  resetBreaker(): void;
  restore(ctx: ExtensionContext): void;
}

function normalizeStoreState(
  value: Partial<PlanGeneratorStoreState>,
): PlanGeneratorStoreState {
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

function readPlanGeneratorState(
  details: unknown,
): PlanGeneratorStoreState | undefined {
  if (!details || typeof details !== "object") return undefined;
  return normalizeStoreState(details as Partial<PlanGeneratorStoreState>);
}

export function createPlanGeneratorStore(pi: ExtensionAPI): PlanGeneratorStore {
  let state: PlanGeneratorStoreState = { ...initialState };

  const getState = (): PlanGeneratorStoreState => ({ ...state });

  const persist = (): void => {
    pi.sendMessage(
      {
        customType: PLAN_GENERATOR_STORE_TYPE,
        content: `Plan generator state: ${state.currentPlan ?? "none"}`,
        display: false,
        details: getState(),
      },
      { deliverAs: "nextTurn" },
    );
  };

  const updateState = (patch: Partial<PlanGeneratorStoreState>): void => {
    state = normalizeStoreState({ ...state, ...patch });
    persist();
  };

  const setCurrentPlan = (currentPlan: string | undefined): void => {
    updateState({ currentPlan });
  };

  const setCurrentStage = (
    currentStage: PlanGeneratorStageId | undefined,
  ): void => {
    updateState({ currentStage });
  };

  const setStatus = (status: PlanGeneratorStatus, message?: string): void => {
    updateState({ status, message });
  };

  const addBreaker = (): void => {
    updateState({ breaker: state.breaker + 1 });
  };

  const resetBreaker = (): void => {
    updateState({ breaker: 0 });
  };

  const restore = (ctx: ExtensionContext): void => {
    let restoredState: PlanGeneratorStoreState | undefined;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;

      const msg = entry.message;
      let restored: PlanGeneratorStoreState | undefined;
      if (
        msg.role === "toolResult" &&
        msg.toolName === PLAN_GENERATOR_STORE_TYPE
      ) {
        restored = readPlanGeneratorState(msg.details);
      } else if (
        msg.role === "custom" &&
        msg.customType === PLAN_GENERATOR_STORE_TYPE
      ) {
        restored = readPlanGeneratorState(msg.details);
      }
      if (restored) restoredState = restored;
    }

    if (restoredState) state = restoredState;
  };

  return {
    getState,
    setCurrentPlan,
    setCurrentStage,
    setStatus,
    updateState,
    addBreaker,
    resetBreaker,
    restore,
  };
}

export function initPlanGeneratorStore(
  pi: ExtensionAPI,
  store: PlanGeneratorStore,
): void {
  pi.on("session_start", async (_event, ctx) => {
    store.restore(ctx);
  });
  pi.on("session_tree", async (_event, ctx) => {
    store.restore(ctx);
  });
}
