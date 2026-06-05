import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  clearPlanGeneratorModeStatus,
  handlePlanGeneratorAgentEnd,
  latestAssistantText,
  pausePlanGeneratorTask,
  restorePlanGeneratorWorkflowFromStore,
  resumePlanGeneratorFromUserInput,
  runPlanGeneratorCommand,
  setPlanGeneratorModeStatus,
  startNewGeneratorTask,
} from "../extensions/plan-generator/index.ts";
import {
  createReadmeScaffold,
  createStageValidationEvidence,
  resolveCollisionFreeTaskPath,
} from "../extensions/plan-generator/plan-files.ts";
import {
  buildStageAuthoringMessage,
  buildStageHandoffMessage,
  buildStageResumeMessage,
  buildStageRetryMessage,
  PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION,
  PLAN_GENERATOR_STAGE_ENVIRONMENTS,
  STAGE_02_ID,
  STAGE_05_CONSTRUCTION_CHECKLIST,
  STAGE_05_REQUIRED_SECTIONS,
} from "../extensions/plan-generator/stage-contract.ts";
import { createPlanGeneratorStore } from "../extensions/plan-generator/store.ts";
import {
  activatePlanGeneratorWorkflow,
  getDotdotgodWorkflowState,
  isPlanGeneratorWorkflowActive,
  restoreDotdotgodWorkflowState,
} from "../extensions/shared/workflow-coordination.ts";
import {
  extractPlanGeneratorBlocks,
  stableBlockerSetKey,
  toKebabCase,
} from "../extensions/plan-generator/utils.ts";

function checkpointCreator(cwd: string) {
  return async (_ctx: unknown, stage: { id: string; checkpointFileName: string }, planPath: string) => {
    const checkpointDir = join(cwd, dirname(planPath), ".dotdotgod-plan");
    mkdirSync(checkpointDir, { recursive: true });
    const checkpointPath = join(checkpointDir, stage.checkpointFileName);
    if (!existsSync(checkpointPath)) {
      writeFileSync(
        checkpointPath,
        `# checkpoint for ${stage.id}\n\nStage: ${stage.id}\nStatus: created\nUpdated: 2026-05-29T00:00:00.000Z\n\nDistinct checkpoint context for ${stage.checkpointFileName}.\n`,
      );
    }
    return { ok: true, path: checkpointPath };
  };
}

function fakeRuntime(cwd: string, options: { idle?: boolean; editorValue?: string; hasUI?: boolean; sessionBranch?: unknown[] } = {}) {
  restoreDotdotgodWorkflowState([]);
  const sent: Array<{ message: string; options?: unknown }> = [];
  const notifications: Array<{ message: string; level?: string | undefined }> = [];
  const statuses: Array<{ key: string; value: string | undefined }> = [];
  const customMessages: unknown[] = [];
  const customEntries: Array<{ customType: string; data: unknown }> = [];
  const pi = {
    sendUserMessage(message: string, messageOptions?: unknown) {
      sent.push({ message, options: messageOptions });
    },
    sendMessage(message: unknown) {
      customMessages.push(message);
    },
    appendEntry(customType: string, data: unknown) {
      customEntries.push({ customType, data });
    },
  };
  const ctx = {
    cwd,
    hasUI: options.hasUI ?? options.editorValue !== undefined,
    isIdle: () => options.idle ?? false,
    sessionManager: {
      getBranch: () => options.sessionBranch ?? [],
    },
    ui: {
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
      setStatus(key: string, value: string | undefined) {
        statuses.push({ key, value });
      },
      theme: {
        fg: (_name: string, value: string) => value,
      },
      editor: async () => options.editorValue,
    },
  };
  return { pi, ctx, sent, notifications, statuses, customMessages, customEntries };
}

describe("plan-generator command helpers", () => {
  it("creates README scaffolds", () => {
    assert.equal(toKebabCase("Add Plan Generator!"), "add-plan-generator");
    const scaffold = createReadmeScaffold("Task Title", "Initial request");
    assert.match(scaffold, /^# Task Title/m);
    assert.match(scaffold, /^Status: active/m);
    assert.match(scaffold, /^## Plan:/m);
  });

  it("prefers LLM slug proposals before request-derived fallback", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const task = await resolveCollisionFreeTaskPath(
      { cwd } as never,
      "Add Plan Generator",
      async () => "AI Suggested Slug!",
    );
    assert.equal(task.taskSlug, "ai-suggested-slug");
  });

  it("creates collision-free task paths from LLM proposals", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    mkdirSync(join(cwd, "docs", "plan", "ai-suggested-slug"), { recursive: true });
    const task = await resolveCollisionFreeTaskPath(
      { cwd } as never,
      "Add Plan Generator",
      async () => "AI Suggested Slug!",
    );
    assert.equal(task.taskSlug, "ai-suggested-slug-2");
    assert.equal(
      task.readmePath,
      join(cwd, "docs", "plan", "ai-suggested-slug-2", "README.md"),
    );
  });

  it("falls back to request text when LLM slug proposals are unusable", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    mkdirSync(join(cwd, "docs", "plan", "add-plan-generator"), { recursive: true });
    const task = await resolveCollisionFreeTaskPath(
      { cwd } as never,
      "Add Plan Generator",
      async () => "!!!",
    );
    assert.equal(task.taskSlug, "add-plan-generator-2");
  });

  it("falls back to new-plan for unusable proposal and request text", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const task = await resolveCollisionFreeTaskPath(
      { cwd } as never,
      "!!!",
      async () => undefined,
    );
    assert.equal(task.taskSlug, "new-plan");
  });

  it("defines a complete simplified stage progression with runnable prompts", () => {
    const stageIds = [
      "01-intake",
      "02-context-load",
      "03-discovery",
      "04-plan",
      "05-workstream-handoff",
    ] as const;

    for (const [index, stageId] of stageIds.entries()) {
      const stage = PLAN_GENERATOR_STAGE_ENVIRONMENTS[stageId];
      assert.equal(stage.authoringPrompt.length > 0, true);
      assert.equal(stage.retryPrompt.length > 0, true);
      assert.equal(stage.evaluationPrompt.length > 0, true);
      assert.equal(stage.nextStage, stageIds[index + 1]);
    }
  });

  it("validates Stage 02 durable sections and internal stage state metadata", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const taskDir = join(cwd, "docs", "plan", "stage-two");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(
      join(taskDir, "README.md"),
      `# Stage Two

Status: active

## Memory Reads

Project memory reviewed.

## Impact Candidates

packages/pi/extensions/plan-generator/index.ts

## Related Files

packages/pi/extensions/plan-generator/stage-contract.ts

## Stage 02 Construction Checklist

- [x] Memory reads: Project memory reviewed.
- [x] Impact candidates: Plan-generator files identified.
- [x] Related files: Stage contract and tests identified.
- [x] Boundary risk: Plan Mode boundary preserved.
`,
    );
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "02_CONTEXT_LOAD.md"),
      `Stage: 02-context-load
Status: completed
Updated: 2026-05-28
`,
    );

    const evidence = createStageValidationEvidence({
      cwd,
      currentPlan: "docs/plan/stage-two/README.md",
      stage: PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_02_ID],
    });

    assert.equal(evidence.ok, true);
    assert.equal(evidence.requiredSections.valid, 3);
    assert.equal(evidence.nextStage, "03-discovery");
  });

  it("reports Stage 02 validation blockers", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const taskDir = join(cwd, "docs", "plan", "stage-two");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(join(taskDir, "README.md"), "# Stage Two\n");
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "02_CONTEXT_LOAD.md"),
      `Stage: wrong-stage
Status: maybe
`,
    );

    const evidence = createStageValidationEvidence({
      cwd,
      currentPlan: "docs/plan/stage-two/README.md",
      stage: PLAN_GENERATOR_STAGE_ENVIRONMENTS[STAGE_02_ID],
    });

    assert.equal(evidence.ok, false);
    assert.match(evidence.blockers.join("\n"), /Missing required section: ## Memory Reads/);
    assert.match(evidence.blockers.join("\n"), /wrong Stage/);
  });

  it("extracts dotdotgod plan-generator fenced block contents", () => {
    const blocks = extractPlanGeneratorBlocks(
      'before\n```json dotdotgod-plan-generator\n{"first":"value"}\n```\nbetween\n```json dotdotgod-plan-generator\n{}\n```\nafter',
    );
    assert.deepEqual(blocks, ['{"first":"value"}\n', "{}\n"]);
  });

  it("builds stable blocker keys", () => {
    assert.equal(stableBlockerSetKey(["b", "a", "a"]), "a\nb");
  });

  it("includes next checkpoint context in stage handoff messages", () => {
    const message = buildStageHandoffMessage({
      stage: PLAN_GENERATOR_STAGE_ENVIRONMENTS["01-intake"],
      planPath: "docs/plan/add-staged-authoring-smoke/README.md",
      stageContext: "completed intake context",
      nextContext: "next context",
      nextCheckpointContext: {
        path: "docs/plan/add-staged-authoring-smoke/.dotdotgod-plan/02_CONTEXT_LOAD.md",
        content: "Distinct checkpoint context for 02_CONTEXT_LOAD.md.",
      },
    });

    assert.match(message, /Next stage checkpoint context/);
    assert.match(message, /docs\/plan\/add-staged-authoring-smoke\/\.dotdotgod-plan\/02_CONTEXT_LOAD\.md/);
    assert.match(message, /Distinct checkpoint context for 02_CONTEXT_LOAD\.md/);
  });

  it("keeps the plan split instruction in generated stage messages", () => {
    const stage = PLAN_GENERATOR_STAGE_ENVIRONMENTS["03-discovery"];
    const checkpointContext = {
      path: "docs/plan/example/.dotdotgod-plan/03_DISCOVERY.md",
      content: "checkpoint",
    };

    for (const message of [
      buildStageAuthoringMessage(stage, "request", checkpointContext),
      buildStageRetryMessage(stage, "request", "retry", checkpointContext),
      buildStageResumeMessage(stage, "request", "waiting", "latest input", checkpointContext),
      buildStageHandoffMessage({
        stage,
        planPath: "docs/plan/example/README.md",
        stageContext: "stage context",
        nextContext: "next context",
      }),
    ]) {
      assert.match(message, /split the durable plan into task-local support markdown files/);
      assert.match(message, /Keep README\.md as the overview\/index/);
    }
    assert.match(PLAN_GENERATOR_PLAN_SPLIT_INSTRUCTION, /Do not put final user-facing plan content only in \.dotdotgod-plan\//);
  });

  it("requires Stage 04 to produce concrete implementation design", () => {
    const stage = PLAN_GENERATOR_STAGE_ENVIRONMENTS["04-plan"];
    const message = buildStageAuthoringMessage(stage, "request");

    assert.deepEqual(stage.requiredSections, [
      "Implementation Design",
      "Code Touchpoints",
      "Data/State Flow",
      "Edge Cases",
      "Atomic Tasks",
      "Test Design",
      "Validation Plan",
      "Resume Point",
    ]);
    assert.match(message, /implementation design, not a generic project plan/i);
    assert.match(message, /files, functions\/types\/classes\/commands/);
    assert.match(message, /a different agent should be able to implement the same work/);
    assert.match(message, /Do not silently carry unresolved user decisions forward/);
    assert.match(PLAN_GENERATOR_STAGE_ENVIRONMENTS["03-discovery"].authoringPrompt, /Separate agent-resolvable research questions from user decisions/);
    assert.match(stage.evaluationPrompt, /Atomic Tasks must be specific enough to assign immediately/);
    assert.match(stage.evaluationPrompt, /Edge Cases must cover failure paths/);
    assert.match(stage.evaluationPrompt, /Mark retry when Atomic Tasks or Edge Cases are too generic/);
    assert.match(stage.evaluationPrompt, /unresolved choices about scope, behavior, risk acceptance, or implementation direction as blocked user input/);
    assert.match(stage.evaluationPrompt, /atomic tasks to name concrete code touchpoints/);
  });

  it("requires Stage 05 to produce phase-based workstream handoff contracts", () => {
    const stage = PLAN_GENERATOR_STAGE_ENVIRONMENTS["05-workstream-handoff"];
    const message = buildStageAuthoringMessage(stage, "request");

    assert.equal(stage.title, "Stage 05: workstream handoff");
    assert.deepEqual(stage.requiredSections, [...STAGE_05_REQUIRED_SECTIONS]);
    assert.deepEqual(stage.constructionChecklist, [...STAGE_05_CONSTRUCTION_CHECKLIST]);
    assert.match(message, /split decision with rationale/i);
    assert.match(message, /no-split exception/i);
    assert.match(message, /Workstream Map/);
    assert.match(message, /execution phase map/i);
    assert.match(message, /dependency gates/i);
    assert.match(message, /parallelization notes/i);
    assert.match(message, /Shared Context/);
    assert.match(message, /one self-contained handoff packet file per downstream agent\/workstream/i);
    assert.match(message, /exactly one primary handoff file/i);
    assert.match(message, /role, phase, dependency gates, summarized context, exact target files\/functions/i);
    assert.match(message, /allowed edits, forbidden edits, tasks, validation, expected handoff output, dependencies, and integration notes/i);
    assert.match(message, /Integration Sequence/);
    assert.match(message, /aggregated Todo Contract/i);
    assert.match(message, /Stage 05 construction checklist evidence/i);
    assert.match(message, /README\/support files hold final user-facing handoff instructions/i);
    assert.match(message, /\.dotdotgod-plan\/05_WORKSTREAM_HANDOFF\.md file holds only compact routing\/status metadata/i);
    assert.match(message, /Keep Plan Mode separate from \/plan-generator/i);
    assert.match(stage.evaluationPrompt, /lacks a split decision/i);
    assert.match(stage.evaluationPrompt, /split is needed but the Workstream Map, execution phase map, dependency gates, parallelization notes, per-workstream contracts/i);
    assert.match(stage.evaluationPrompt, /implementation agents must infer chat history/i);
    assert.match(stage.evaluationPrompt, /more than one primary handoff file/i);
    assert.match(stage.evaluationPrompt, /final user-facing handoff instructions are written only to \.dotdotgod-plan\/05_WORKSTREAM_HANDOFF\.md/i);
  });

  it("validates Stage 05 required sections and construction checklist evidence", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const taskDir = join(cwd, "docs", "plan", "stage-five");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(
      join(taskDir, "README.md"),
      `# Stage Five

Status: active

## Workstream Handoff

Split decision: yes. Split implementation into independent prompt, validation, and test workstreams.

## Workstream Map

- Phase 1: prompt contract workstream, primary handoff file PROMPT_CONTRACT.md, can run before tests.

## Shared Context

All subagents use the Stage 04 implementation design and existing plan-generator files.

## Workstreams

- Prompt contract: allowed edits in stage-contract.ts; forbidden edits in Plan Mode; validation via Pi tests; output summary required.

## Integration Sequence

1. Merge prompt contract.
2. Run focused Pi tests.

## Todo Contract

- [ ] Update Stage 05 prompt contract.
- [ ] Verify prompt and validation evidence tests.

## Stage 05 Construction Checklist

- [x] Handoffs: Split decision, phase map, workstream map, and primary handoff file are recorded.
- [x] Do-not rules: Plan Mode and unrelated files are forbidden for this workstream.
- [x] Focused verification: Focused Pi tests are listed.
- [x] Chat-independent context: Durable content remains in README/support files, not only .dotdotgod-plan.
`,
    );
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "05_WORKSTREAM_HANDOFF.md"),
      "Stage: 05-workstream-handoff\nStatus: completed\nUpdated: 2026-06-05\n",
    );

    const evidence = createStageValidationEvidence({
      cwd,
      currentPlan: "docs/plan/stage-five/README.md",
      stage: PLAN_GENERATOR_STAGE_ENVIRONMENTS["05-workstream-handoff"],
    });

    assert.equal(evidence.ok, true);
    assert.equal(evidence.requiredSections.valid, STAGE_05_REQUIRED_SECTIONS.length);
  });

  it("detects unresolved user decisions in durable plan validation evidence", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const taskDir = join(cwd, "docs", "plan", "decision-blocker");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(
      join(taskDir, "README.md"),
      `# Decision Blocker

Status: active

## Implementation Design

Use the existing extension flow.

## Code Touchpoints

packages/pi/extensions/plan-generator/index.ts

## Data/State Flow

Store remains active until the user answers.

## Edge Cases

- 미정: 사용자가 strict mode 여부를 결정해야 함.

## Atomic Tasks

- Update blocker detection in plan-generator runtime.

## Test Design

- Add runtime regression tests.

## Validation Plan

- pnpm --filter @dotdotgod/pi test -- plan-generator-utils.test.ts

## Resume Point

Resume after the user chooses strict mode.

## Stage 04 Construction Checklist

- [x] Implementation design: Existing flow with decision blocker.
- [x] Code touchpoints: packages/pi/extensions/plan-generator/index.ts.
- [x] Data/state flow: input-waiting state.
- [x] Edge cases: user decision blocker.
- [x] Atomic tasks: runtime detection.
- [x] Test design: regression test.
- [x] Validation plan: targeted pi test.
- [x] Resume point: same stage after user input.
`,
    );
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "04_PLAN.md"),
      "Stage: 04-plan\nStatus: completed\nUpdated: 2026-06-03\n",
    );

    const evidence = createStageValidationEvidence({
      cwd,
      currentPlan: "docs/plan/decision-blocker/README.md",
      stage: PLAN_GENERATOR_STAGE_ENVIRONMENTS["04-plan"],
    });

    assert.equal(evidence.ok, false);
    assert.match(evidence.blockers.join("\n"), /Unresolved user decision/);
    assert.match(evidence.blockers.join("\n"), /미정/);
  });

  it("extracts latest assistant text", () => {
    assert.equal(
      latestAssistantText([
        { role: "assistant", content: [{ type: "text", text: "first" }] },
        { role: "user", content: [{ type: "text", text: "ignore" }] },
        { role: "assistant", content: [{ type: "text", text: "last" }] },
      ]),
      "last",
    );
  });

  it("sets and clears the generator-owned plan-mode status label", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });

    setPlanGeneratorModeStatus(runtime.ctx as never);
    clearPlanGeneratorModeStatus(runtime.ctx as never);

    assert.deepEqual(runtime.statuses, [
      { key: "plan-mode", value: "⏸ generate plan" },
      { key: "plan-mode", value: undefined },
    ]);
  });
});

describe("plan-generator command runtime", () => {
  it("shows help without creating plan files", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    await runPlanGeneratorCommand(runtime.pi as never, runtime.ctx as never, "--help");
    assert.equal(existsSync(join(cwd, "docs", "plan")), false);
    assert.equal(runtime.notifications.length, 0);
    assert.equal(runtime.sent.length, 0);
  });

  it("does not send loop-driving messages for empty invocation without a request", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    await runPlanGeneratorCommand(runtime.pi as never, runtime.ctx as never, "");
    assert.equal(runtime.sent.length, 0);
  });

  it("creates a durable README and immediately queues Stage 01 authoring", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    await runPlanGeneratorCommand(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      undefined,
      checkpointCreator(cwd) as never,
    );
    const taskDir = join(cwd, "docs", "plan", "add-staged-authoring-smoke");
    assert.match(
      readFileSync(join(taskDir, "README.md"), "utf8"),
      /Add staged authoring smoke/,
    );
    assert.match(
      readFileSync(join(taskDir, ".dotdotgod-plan", "01_INTAKE.md"), "utf8"),
      /Stage: 01-intake/,
    );
    assert.equal(runtime.sent.length, 1);
    assert.match(runtime.sent[0]?.message ?? "", /Stage 01: intake/);
    assert.match(runtime.sent[0]?.message ?? "", /Current stage checkpoint context/);
    assert.match(runtime.sent[0]?.message ?? "", /docs\/plan\/add-staged-authoring-smoke\/\.dotdotgod-plan\/01_INTAKE\.md/);
    assert.match(runtime.sent[0]?.message ?? "", /Distinct checkpoint context for 01_INTAKE\.md/);
    assert.deepEqual(runtime.statuses.slice(0, 4), [
      { key: "plan-mode", value: "⏳ generating plan slug" },
      { key: "plan-mode", value: "⏳ creating plan files" },
      { key: "plan-mode", value: "⏳ creating stage checkpoint" },
      { key: "plan-mode", value: "⏸ generate plan" },
    ]);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
    assert.equal(getDotdotgodWorkflowState().planPath, "docs/plan/add-staged-authoring-smoke/README.md");
    assert.equal(runtime.customEntries[0]?.customType, "dotdotgod-workflow");
    assert.equal((runtime.customEntries[0]?.data as { planPath?: string }).planPath, undefined);
    assert.equal(runtime.customEntries.at(-1)?.customType, "dotdotgod-workflow");
    const startupDetails = (runtime.customMessages[0] as { details?: { currentPlan?: string; currentStage?: string; status?: string } }).details;
    assert.equal(startupDetails?.currentPlan, undefined);
    assert.equal(startupDetails?.currentStage, undefined);
    assert.equal(startupDetails?.status, "active");
    const details = (runtime.customMessages.at(-1) as { details?: { currentPlan?: string; currentStage?: string; status?: string } }).details;
    assert.equal(details?.currentPlan, "docs/plan/add-staged-authoring-smoke/README.md");
    assert.equal(details?.currentStage, "01-intake");
    assert.equal(details?.status, "active");
  });

  it("does not duplicate Stage 01 authoring on agent_end after command bootstrap", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    const store = createPlanGeneratorStore(runtime.pi as never);
    await startNewGeneratorTask(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      store,
      checkpointCreator(cwd) as never,
    );

    assert.equal(runtime.sent.length, 1);
    await handlePlanGeneratorAgentEnd(
      runtime.pi as never,
      runtime.ctx as never,
      [],
      store,
    );

    assert.equal(runtime.sent.length, 2);
    assert.match(runtime.sent[0]?.message ?? "", /Stage 01: intake/);
    assert.match(runtime.sent[1]?.message ?? "", /needs repair/);
    assert.match(runtime.sent[1]?.message ?? "", /Current stage checkpoint context/);
    assert.match(runtime.sent[1]?.message ?? "", /Distinct checkpoint context for 01_INTAKE\.md/);
  });

  it("restores shared workflow state from active generator store state", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    const store = createPlanGeneratorStore(runtime.pi as never);
    store.updateState({
      currentPlan: "docs/plan/resume-handoff-followup-work/README.md",
      currentStage: "02-context-load",
      status: "active",
      breaker: 0,
    });

    restoreDotdotgodWorkflowState([]);
    assert.equal(isPlanGeneratorWorkflowActive(), false);
    assert.equal(restorePlanGeneratorWorkflowFromStore(runtime.pi as never, store), true);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
    assert.equal(getDotdotgodWorkflowState().planPath, "docs/plan/resume-handoff-followup-work/README.md");
    assert.equal(getDotdotgodWorkflowState().stage, "02-context-load");
  });

  it("restores shared workflow state from input-waiting generator store state", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    const store = createPlanGeneratorStore(runtime.pi as never);
    store.updateState({
      currentPlan: "docs/plan/resume-handoff-followup-work/README.md",
      currentStage: "03-discovery",
      status: "input-waiting",
      breaker: 0,
      waitingMessage: "Need user input.",
    });

    restoreDotdotgodWorkflowState([]);
    assert.equal(restorePlanGeneratorWorkflowFromStore(runtime.pi as never, store), true);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
    assert.equal(getDotdotgodWorkflowState().planPath, "docs/plan/resume-handoff-followup-work/README.md");
    assert.equal(getDotdotgodWorkflowState().stage, "03-discovery");
  });

  it("resumes an input-waiting stage from follow-up user input", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    const taskDir = join(cwd, "docs", "plan", "resume-input");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(join(taskDir, "README.md"), "# Resume Input\n");
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "03_DISCOVERY.md"),
      "Stage: 03-discovery\nStatus: blocked\n\nCheckpoint details for resume.\n",
    );
    store.updateState({
      currentPlan: "docs/plan/resume-input/README.md",
      currentStage: "03-discovery",
      status: "input-waiting",
      breaker: 3,
      message: "Need migration target.",
      originalRequest: "Plan the resume behavior.",
      waitingMessage: "Need migration target.",
    });

    const resumed = await resumePlanGeneratorFromUserInput(
      runtime.pi as never,
      runtime.ctx as never,
      store,
      "Use before_agent_start for the resume hook.",
    );

    assert.equal(resumed, true);
    assert.equal(store.getState().status, "active");
    assert.equal(store.getState().breaker, 0);
    assert.equal(store.getState().lastResumedUserInput, "Use before_agent_start for the resume hook.");
    assert.equal(runtime.sent.length, 1);
    assert.match(runtime.sent[0]?.message ?? "", /Resume the same \/plan-generator stage/);
    assert.match(runtime.sent[0]?.message ?? "", /Need migration target/);
    assert.match(runtime.sent[0]?.message ?? "", /Use before_agent_start for the resume hook/);
    assert.match(runtime.sent[0]?.message ?? "", /Checkpoint details for resume/);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
  });

  it("does not resume stopped or terminal blocked generator states", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    const store = createPlanGeneratorStore(runtime.pi as never);
    store.updateState({
      currentPlan: "docs/plan/resume-input/README.md",
      currentStage: "03-discovery",
      status: "stopped",
      breaker: 0,
    });

    assert.equal(
      await resumePlanGeneratorFromUserInput(runtime.pi as never, runtime.ctx as never, store, "continue"),
      false,
    );
    store.updateState({
      currentPlan: "docs/plan/resume-input/README.md",
      currentStage: undefined,
      status: "blocked",
      breaker: 0,
    });
    assert.equal(
      await resumePlanGeneratorFromUserInput(runtime.pi as never, runtime.ctx as never, store, "continue"),
      false,
    );
    assert.equal(runtime.sent.length, 0);
  });

  it("stops an input-waiting generator when follow-up input is a stop request", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    const store = createPlanGeneratorStore(runtime.pi as never);
    store.updateState({
      currentPlan: "docs/plan/resume-input/README.md",
      currentStage: "03-discovery",
      status: "input-waiting",
      breaker: 0,
    });

    assert.equal(
      await resumePlanGeneratorFromUserInput(runtime.pi as never, runtime.ctx as never, store, "stop"),
      false,
    );
    assert.equal(store.getState().status, "stopped");
    assert.equal(store.getState().currentStage, undefined);
    assert.equal(runtime.sent.length, 0);
  });

  it("keeps active bootstrap state when session_tree restore has no persisted generator entry yet", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    const store = createPlanGeneratorStore(runtime.pi as never);
    await startNewGeneratorTask(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      store,
      checkpointCreator(cwd) as never,
    );

    store.restore({ sessionManager: { getBranch: () => [] } } as never);
    assert.equal(store.getState().status, "active");
    assert.equal(store.getState().currentStage, "01-intake");

    await handlePlanGeneratorAgentEnd(
      runtime.pi as never,
      runtime.ctx as never,
      [],
      store,
    );

    assert.equal(runtime.sent.length, 2);
    assert.match(runtime.sent[1]?.message ?? "", /needs repair/);
  });

  it("waits for user input instead of retrying when the assistant asks the user to decide", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    await startNewGeneratorTask(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      store,
      checkpointCreator(cwd) as never,
    );
    const taskDir = join(cwd, "docs", "plan", "add-staged-authoring-smoke");
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "02_CONTEXT_LOAD.md"),
      "Stage: 02-context-load\nStatus: created\nUpdated: 2026-06-01\n",
    );
    store.updateState({
      currentPlan: "docs/plan/add-staged-authoring-smoke/README.md",
      currentStage: "02-context-load",
      status: "active",
      breaker: 4,
      originalRequest: "Add staged authoring smoke",
    });

    await handlePlanGeneratorAgentEnd(
      runtime.pi as never,
      runtime.ctx as never,
      [
        {
          role: "assistant",
          content: "Stage 02 cannot continue without a user decision. 어느 쪽으로 진행할지 판단해 주세요.",
        },
      ],
      store,
    );

    assert.equal(store.getState().status, "input-waiting");
    assert.equal(store.getState().breaker, 4);
    assert.equal(runtime.sent.length, 1);
    assert.match(store.getState().waitingMessage ?? "", /판단해 주세요/);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
  });

  it("asks the user instead of advancing when durable plan carries an unresolved decision", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    const taskDir = join(cwd, "docs", "plan", "decision-blocker");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(
      join(taskDir, "README.md"),
      `# Decision Blocker

Status: active

## Implementation Design

Use the generator store path.

## Code Touchpoints

packages/pi/extensions/plan-generator/index.ts

## Data/State Flow

Stay input-waiting until the user answers.

## Edge Cases

- User decision needed: choose whether strict mode blocks Stage 03 or only Stage 04.

## Atomic Tasks

- Add deterministic unresolved-decision blocker handling.

## Test Design

- Runtime test for input-waiting.

## Validation Plan

- pnpm --filter @dotdotgod/pi test -- plan-generator-utils.test.ts

## Resume Point

Resume this stage after the user chooses.

## Stage 04 Construction Checklist

- [x] Implementation design: generator store path.
- [x] Code touchpoints: packages/pi/extensions/plan-generator/index.ts.
- [x] Data/state flow: input-waiting.
- [x] Edge cases: unresolved user decision.
- [x] Atomic tasks: blocker handling.
- [x] Test design: runtime test.
- [x] Validation plan: targeted test.
- [x] Resume point: same stage.
`,
    );
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "04_PLAN.md"),
      "Stage: 04-plan\nStatus: completed\nUpdated: 2026-06-03\n",
    );
    store.updateState({
      currentPlan: "docs/plan/decision-blocker/README.md",
      currentStage: "04-plan",
      status: "active",
      breaker: 0,
      originalRequest: "Plan decision blocker handling.",
    });
    activatePlanGeneratorWorkflow(runtime.pi as never, {
      planPath: "docs/plan/decision-blocker/README.md",
      stage: "04-plan",
    });

    await handlePlanGeneratorAgentEnd(
      runtime.pi as never,
      runtime.ctx as never,
      [{ role: "assistant", content: "Stage 04 updated with a pending user decision." }],
      store,
    );

    assert.equal(store.getState().status, "input-waiting");
    assert.equal(store.getState().breaker, 0);
    assert.match(store.getState().waitingMessage ?? "", /Unresolved user decision/);
    assert.equal(runtime.sent.length, 1);
    assert.match(runtime.sent[0]?.message ?? "", /Ask the user a concrete question with clear options/);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
  });

  it("restores the underlying Plan Mode status when clearing the generator overlay", () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, {
      hasUI: true,
      sessionBranch: [{
        type: "custom",
        customType: "plan-mode",
        data: { mode: { mode: "planning" }, execution: { todos: [] } },
      }],
    });

    setPlanGeneratorModeStatus(runtime.ctx as never);
    clearPlanGeneratorModeStatus(runtime.ctx as never);

    assert.deepEqual(runtime.statuses.at(-1), {
      key: "plan-mode",
      value: "⏸ plan",
    });
  });

  it("stops the active generator and clears the shared workflow flag", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    await startNewGeneratorTask(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      store,
      checkpointCreator(cwd) as never,
    );
    assert.equal(isPlanGeneratorWorkflowActive(), true);

    await runPlanGeneratorCommand(runtime.pi as never, runtime.ctx as never, "--stop", store);

    assert.equal(isPlanGeneratorWorkflowActive(), false);
    assert.equal(store.getState().status, "stopped");
    assert.deepEqual(runtime.statuses.at(-1), {
      key: "plan-mode",
      value: undefined,
    });
    await handlePlanGeneratorAgentEnd(runtime.pi as never, runtime.ctx as never, [], store);
    assert.equal(runtime.sent.length, 1);
  });

  it("pauses the active generator as resumable input-waiting state", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    await startNewGeneratorTask(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      store,
      checkpointCreator(cwd) as never,
    );

    assert.equal(
      await pausePlanGeneratorTask(runtime.pi as never, runtime.ctx as never, store, "Paused by interrupt."),
      true,
    );

    assert.equal(store.getState().status, "input-waiting");
    assert.equal(store.getState().currentPlan, "docs/plan/add-staged-authoring-smoke/README.md");
    assert.equal(store.getState().currentStage, "01-intake");
    assert.equal(store.getState().waitingMessage, "Paused by interrupt.");
    assert.equal(isPlanGeneratorWorkflowActive(), true);
    assert.equal(runtime.sent.length, 1);
  });

  it("toggles an active generator into resumable pause for no-arg /plan-generator", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    await startNewGeneratorTask(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      store,
      checkpointCreator(cwd) as never,
    );

    await runPlanGeneratorCommand(runtime.pi as never, runtime.ctx as never, "", store);

    assert.equal(store.getState().status, "input-waiting");
    assert.equal(store.getState().currentStage, "01-intake");
    assert.match(store.getState().waitingMessage ?? "", /Paused \/plan-generator/);
    assert.equal(runtime.sent.length, 1);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
  });

  it("resumes a generator paused by interrupt from the next user message", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    await startNewGeneratorTask(
      runtime.pi as never,
      runtime.ctx as never,
      "Add staged authoring smoke",
      store,
      checkpointCreator(cwd) as never,
    );
    await pausePlanGeneratorTask(runtime.pi as never, runtime.ctx as never, store, "Paused by interrupt.");

    assert.equal(
      await resumePlanGeneratorFromUserInput(runtime.pi as never, runtime.ctx as never, store, "Continue with Stage 01 details."),
      true,
    );

    assert.equal(store.getState().status, "active");
    assert.equal(store.getState().currentStage, "01-intake");
    assert.equal(store.getState().lastResumedUserInput, "Continue with Stage 01 details.");
    assert.equal(runtime.sent.length, 2);
    assert.match(runtime.sent[1]?.message ?? "", /Paused by interrupt/);
    assert.match(runtime.sent[1]?.message ?? "", /Continue with Stage 01 details/);
  });

  it("starts Stage 01 in an existing plan README path with no checkpoints", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    const taskDir = join(cwd, "docs", "plan", "existing-plan");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "README.md"), "# Existing Plan\n");

    await runPlanGeneratorCommand(
      runtime.pi as never,
      runtime.ctx as never,
      "docs/plan/existing-plan/README.md",
      store,
      checkpointCreator(cwd) as never,
    );

    assert.equal(store.getState().currentPlan, "docs/plan/existing-plan/README.md");
    assert.equal(store.getState().currentStage, "01-intake");
    assert.equal(store.getState().status, "active");
    assert.equal(existsSync(join(taskDir, ".dotdotgod-plan", "01_INTAKE.md")), true);
    assert.equal(runtime.sent.length, 1);
    assert.match(runtime.sent[0]?.message ?? "", /Stage 01: intake/);
    assert.match(runtime.sent[0]?.message ?? "", /docs\/plan\/existing-plan\/README\.md/);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
  });

  it("resumes an existing plan README path from the latest checkpoint", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    const taskDir = join(cwd, "docs", "plan", "existing-plan");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(join(taskDir, "README.md"), "# Existing Plan\n");
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "02_CONTEXT_LOAD.md"),
      "Stage: 02-context-load\nStatus: blocked\n\nCheckpoint details for path resume.\n",
    );

    await runPlanGeneratorCommand(
      runtime.pi as never,
      runtime.ctx as never,
      "docs/plan/existing-plan/README.md",
      store,
      checkpointCreator(cwd) as never,
    );

    assert.equal(store.getState().currentPlan, "docs/plan/existing-plan/README.md");
    assert.equal(store.getState().currentStage, "02-context-load");
    assert.equal(store.getState().status, "active");
    assert.equal(runtime.sent.length, 1);
    assert.match(runtime.sent[0]?.message ?? "", /Resume the same \/plan-generator stage/);
    assert.match(runtime.sent[0]?.message ?? "", /Checkpoint details for path resume/);
    assert.equal(isPlanGeneratorWorkflowActive(), true);
  });

  it("warns for a missing managed plan README path instead of creating a slug", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);

    await runPlanGeneratorCommand(
      runtime.pi as never,
      runtime.ctx as never,
      "docs/plan/missing-plan/README.md",
      store,
      checkpointCreator(cwd) as never,
    );

    assert.equal(store.getState().status, "blocked");
    assert.equal(runtime.sent.length, 0);
    assert.match(runtime.notifications[0]?.message ?? "", /Plan README does not exist/);
    assert.equal(existsSync(join(cwd, "docs", "plan", "docs-plan-missing-plan-readme-md")), false);
  });

  it("does not queue another stage for a completed final checkpoint", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { hasUI: true });
    const store = createPlanGeneratorStore(runtime.pi as never);
    const taskDir = join(cwd, "docs", "plan", "complete-plan");
    mkdirSync(join(taskDir, ".dotdotgod-plan"), { recursive: true });
    writeFileSync(join(taskDir, "README.md"), "# Complete Plan\n");
    writeFileSync(
      join(taskDir, ".dotdotgod-plan", "05_WORKSTREAM_HANDOFF.md"),
      "Stage: 05-workstream-handoff\nStatus: completed\n",
    );

    await runPlanGeneratorCommand(
      runtime.pi as never,
      runtime.ctx as never,
      "docs/plan/complete-plan/README.md",
      store,
      checkpointCreator(cwd) as never,
    );

    assert.equal(store.getState().status, "pass");
    assert.equal(store.getState().currentStage, undefined);
    assert.equal(runtime.sent.length, 0);
    assert.match(runtime.notifications[0]?.message ?? "", /checkpoints appear complete/);
  });

  it("treats non-README path-like input as a new request instead of resuming", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd);
    await runPlanGeneratorCommand(
      runtime.pi as never,
      runtime.ctx as never,
      "docs/plan/complete-task",
      undefined,
      checkpointCreator(cwd) as never,
    );
    assert.equal(
      existsSync(join(cwd, "docs", "plan", "docs-plan-complete-task", "README.md")),
      true,
    );
    assert.equal(runtime.sent.length, 1);
    assert.match(runtime.sent[0]?.message ?? "", /Stage 01: intake/);
  });

  it("uses UI editor text for empty invocation when available", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
    const runtime = fakeRuntime(cwd, { editorValue: "Editor supplied task" });
    await runPlanGeneratorCommand(
      runtime.pi as never,
      runtime.ctx as never,
      "",
      undefined,
      checkpointCreator(cwd) as never,
    );
    assert.equal(
      existsSync(join(cwd, "docs", "plan", "editor-supplied-task", "README.md")),
      true,
    );
  });
});
