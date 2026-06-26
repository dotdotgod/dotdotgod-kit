import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { parseJsonWithRepair } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { buildDotdotgodCliCandidates } from "../shared/dotdotgod-cli.ts";
import {
  PLAN_GOAL_STAGE_ENVIRONMENTS,
  STAGE_01_ID,
  type PlanGoalStageCheckpointContext,
  type PlanGoalStageEnvironment,
  type PlanGoalStageId,
} from "./stage-contract.ts";
import { authCreate, createTextUserMessage, isValidPlanSlug, toKebabCase } from "./utils.ts";

export interface PlanGoalTaskPath {
  taskSlug: string;
  taskDir: string;
  readmePath: string;
}

export interface ExistingPlanGoalResumeTarget {
  currentPlan: string;
  taskSlug: string;
  stageId: PlanGoalStageId;
  hasCheckpoint: boolean;
  completed: boolean;
  message?: string | undefined;
}

export interface PlanGoalSlugProposal {
  slug: string;
}

const SLUG_PROPOSAL_SYSTEM_PROMPT = `You propose short filesystem-safe slugs for durable plan requests.
Return only JSON shaped as {"slug":"kebab-case-slug"}.
Rules:
- Use lowercase ASCII kebab-case.
- Keep the slug concise, ideally 3-8 words.
- Do not include docs/plan, README.md, punctuation, quotes, or explanations.`;

export async function createSlugProposal(
  ctx: ExtensionCommandContext,
  request: string,
): Promise<string | undefined> {
  const jsonText = await authCreate(ctx, {
    systemPrompt: SLUG_PROPOSAL_SYSTEM_PROMPT,
    messages: [createTextUserMessage(request)],
  });
  if (!jsonText) return undefined;

  const proposal = parseJsonWithRepair<PlanGoalSlugProposal>(jsonText);
  return typeof proposal?.slug === "string" ? proposal.slug : undefined;
}

type SlugProposalFactory = (
  ctx: ExtensionCommandContext,
  request: string,
) => Promise<string | undefined>;

function safePlanSlug(value: string | undefined): string | undefined {
  const slug = toKebabCase(value ?? "").split("-").slice(0, 8).join("-");
  return isValidPlanSlug(slug) ? slug : undefined;
}

export async function resolveCollisionFreeTaskPath(
  ctx: ExtensionCommandContext,
  request: string,
  createProposal: SlugProposalFactory = createSlugProposal,
): Promise<PlanGoalTaskPath> {
  const safeBaseSlug =
    safePlanSlug(await createProposal(ctx, request)) ??
    safePlanSlug(request) ??
    "new-plan";
  let taskSlug = safeBaseSlug;
  let suffix = 2;
  while (existsSync(path.join(ctx.cwd, "docs", "plan", taskSlug))) {
    taskSlug = `${safeBaseSlug}-${suffix}`;
    suffix += 1;
  }
  const taskDir = path.join(ctx.cwd, "docs", "plan", taskSlug);
  return { taskSlug, taskDir, readmePath: path.join(taskDir, "README.md") };
}

export function createReadmeScaffold(
  title: string,
  requestSummary = "",
): string {
  return `# ${title}

Status: active

## Request Summary

${requestSummary.trim()}

## Goal

## Plan:
`;
}

export function ensureInitialReadme(
  task: PlanGoalTaskPath,
  requestSummary = "",
): void {
  const title = task.taskSlug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  if (existsSync(task.readmePath)) return;
  mkdirSync(task.taskDir, { recursive: true });
  writeFileSync(task.readmePath, createReadmeScaffold(title, requestSummary));
}

export interface PlanGoalStageValidationEvidence {
  stage: PlanGoalStageId;
  ok: boolean;
  blockers: readonly string[];
  requiredSections: {
    total: number;
    present: number;
    valid: number;
  };
  nextStage?: PlanGoalStageId | undefined;
}

export interface PlanGoalStageCheckpointResult {
  ok: boolean;
  duplicate?: boolean | undefined;
  path?: string | undefined;
  error?: string | undefined;
}

function parseCheckpointResult(stdout: string): PlanGoalStageCheckpointResult {
  const parsed = JSON.parse(stdout.trim()) as { ok?: unknown; path?: unknown };
  return {
    ok: parsed.ok === true,
    path: typeof parsed.path === "string" ? parsed.path : undefined,
  };
}

export function createPlanStageCheckpointViaCli(
  cwd: string,
  stage: PlanGoalStageId,
  planPath: string,
  timeoutMs = 10_000,
): PlanGoalStageCheckpointResult {
  const args = ["plan", "stage", "create", stage, planPath, "--json"];
  const candidates = buildDotdotgodCliCandidates(cwd, args);
  const errors: string[] = [];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    if (result.status === 0) return parseCheckpointResult(result.stdout ?? "{}");
    if (/Plan stage checkpoint already exists/i.test(output) || /already exists/i.test(output)) {
      return { ok: true, duplicate: true };
    }
    const message = output || result.error?.message || `exit ${result.status ?? "unknown"}`;
    errors.push(`${candidate.label}: ${message}`);
  }
  return { ok: false, error: errors.join("; ") || "dotdotgod plan stage create failed" };
}

function stageStatePath(taskDir: string, stage: PlanGoalStageEnvironment): string {
  return path.join(taskDir, ".dotdotgod-plan", stage.checkpointFileName);
}

function stageOrder(): PlanGoalStageEnvironment[] {
  return Object.values(PLAN_GOAL_STAGE_ENVIRONMENTS);
}

function parseCheckpointStatus(content: string): string | undefined {
  const match = /^Status:\s*([a-z-]+)\s*$/im.exec(content);
  return match?.[1]?.toLowerCase();
}

function managedPlanReadmeFromInput(cwd: string, input: string): { absolutePath: string; currentPlan: string; taskSlug: string } | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const absolutePath = path.resolve(cwd, trimmed);
  const relative = relativeMarkdownPath(cwd, absolutePath);
  const parts = relative.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "docs" ||
    parts[1] !== "plan" ||
    parts[3] !== "README.md" ||
    !isValidPlanSlug(parts[2] ?? "")
  ) {
    return undefined;
  }
  return { absolutePath, currentPlan: relative, taskSlug: parts[2] ?? "" };
}

export function resolveExistingPlanGoalResumeTarget(
  cwd: string,
  input: string,
): ExistingPlanGoalResumeTarget | undefined {
  const readme = managedPlanReadmeFromInput(cwd, input);
  if (!readme) return undefined;
  if (!existsSync(readme.absolutePath)) {
    return {
      currentPlan: readme.currentPlan,
      taskSlug: readme.taskSlug,
      stageId: STAGE_01_ID,
      hasCheckpoint: false,
      completed: false,
      message: `Plan README does not exist: ${readme.currentPlan}`,
    };
  }

  const taskDir = path.dirname(readme.absolutePath);
  const discovered = stageOrder()
    .map((stage, index) => {
      const checkpointPath = stageStatePath(taskDir, stage);
      if (!existsSync(checkpointPath)) return undefined;
      let status: string | undefined;
      try {
        status = parseCheckpointStatus(readFileSync(checkpointPath, "utf8"));
      } catch {
        status = undefined;
      }
      return { stage, index, status };
    })
    .filter((value): value is { stage: PlanGoalStageEnvironment; index: number; status: string | undefined } => Boolean(value));

  if (discovered.length === 0) {
    return {
      currentPlan: readme.currentPlan,
      taskSlug: readme.taskSlug,
      stageId: STAGE_01_ID,
      hasCheckpoint: false,
      completed: false,
    };
  }

  const latestIncomplete = [...discovered]
    .reverse()
    .find((entry) => entry.status !== "completed");
  const selected = latestIncomplete ?? discovered.at(-1);
  if (!selected) {
    return {
      currentPlan: readme.currentPlan,
      taskSlug: readme.taskSlug,
      stageId: STAGE_01_ID,
      hasCheckpoint: false,
      completed: false,
    };
  }
  const finalStage = stageOrder().at(-1);
  const completed = !latestIncomplete && selected.stage.id === finalStage?.id && selected.status === "completed";
  return {
    currentPlan: readme.currentPlan,
    taskSlug: readme.taskSlug,
    stageId: selected.stage.id,
    hasCheckpoint: true,
    completed,
  };
}

function relativeMarkdownPath(cwd: string, absolutePath: string): string {
  return path.relative(cwd, absolutePath).split(path.sep).join("/");
}

function truncateUtf8(value: string, maxBytes: number): { content: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return { content: value, truncated: false };
  }
  let end = Math.max(0, maxBytes);
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) end -= 1;
  return { content: value.slice(0, end), truncated: true };
}

export function readStageCheckpointContext(options: {
  cwd: string;
  currentPlan: string;
  stage: PlanGoalStageEnvironment;
  maxBytes?: number | undefined;
}): PlanGoalStageCheckpointContext {
  const planPath = path.isAbsolute(options.currentPlan)
    ? options.currentPlan
    : path.join(options.cwd, options.currentPlan);
  const checkpointPath = stageStatePath(path.dirname(planPath), options.stage);
  const promptPath = relativeMarkdownPath(options.cwd, checkpointPath);
  if (!existsSync(checkpointPath)) {
    return { path: promptPath, unavailable: "checkpoint file does not exist" };
  }
  try {
    const { content, truncated } = truncateUtf8(
      readFileSync(checkpointPath, "utf8"),
      options.maxBytes ?? 8_000,
    );
    return { path: promptPath, content, truncated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not read checkpoint file";
    return { path: promptPath, unavailable: message };
  }
}

function discoverDurableMarkdownFiles(taskDir: string): string[] {
  const results: string[] = [];
  const walk = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".dotdotgod-plan" || entry.isSymbolicLink()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".md")) results.push(entryPath);
    }
  };
  walk(taskDir);
  return results.sort((left, right) => {
    if (path.basename(left) === "README.md" && path.dirname(left) === taskDir) return -1;
    if (path.basename(right) === "README.md" && path.dirname(right) === taskDir) return 1;
    return left.localeCompare(right);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMarkdownSection(files: string[], heading: string): string | undefined {
  const pattern = new RegExp(
    `^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`,
    "m",
  );
  for (const file of files) {
    const match = pattern.exec(readFileSync(file, "utf8"));
    if (match?.[1] !== undefined) return match[1];
  }
  return undefined;
}

function contentHasValue(content: string): boolean {
  return content.replace(/<!--[^]*?-->/g, "").trim().length > 0;
}

function constructionChecklistHeader(stageId: PlanGoalStageId): string {
  return `Stage ${stageId.slice(0, 2)} Construction Checklist`;
}

function checklistStatusChecked(value: string): boolean {
  return /\[[xX]\]/.test(value) || /\bcompleted\b/i.test(value);
}

function parseChecklistEvidenceLine(line: string): { checked: boolean; category: string; evidence: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  if (/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return undefined;

  const canonical = /^\s*[-*+]\s*\[([^\]])\]\s*([^:]+):\s*(.*?)\s*$/.exec(line);
  if (canonical) return { checked: canonical[1]?.trim().toLowerCase() === "x", category: canonical[2]?.trim() ?? "", evidence: canonical[3]?.trim() ?? "" };

  const checkedDash = /^\s*[-*+]\s*\[([^\]])\]\s*(.+?)\s*[—–-]\s*(.*?)\s*$/.exec(line);
  if (checkedDash) return { checked: checkedDash[1]?.trim().toLowerCase() === "x", category: checkedDash[2]?.trim() ?? "", evidence: checkedDash[3]?.trim() ?? "" };

  const completedPrefix = /^\s*[-*+]\s*completed\s*[—–-]\s*\[([xX])\]\s*(.+?)(?::\s*(.*?))?\s*$/.exec(line);
  if (completedPrefix) return { checked: true, category: completedPrefix[2]?.trim() ?? "", evidence: (completedPrefix[3] ?? "completed").trim() };

  const table = /^\s*\|(.+)\|\s*$/.exec(line);
  if (table) {
    const cells = (table[1] ?? "").split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length >= 2 && !/^item$/i.test(cells[0] ?? "") && !/^category$/i.test(cells[0] ?? "")) {
      const evidence = cells.slice(1).join(" | ");
      return { checked: checklistStatusChecked(evidence), category: cells[0] ?? "", evidence };
    }
  }

  const colonStatus = /^\s*([^:|]+):\s*(completed\s*[—–-]\s*\[[xX]\]|\[[xX]\]|completed)(?:\s*[—–:\-]\s*(.*?))?\s*$/.exec(line);
  if (colonStatus) return { checked: checklistStatusChecked(colonStatus[2] ?? ""), category: colonStatus[1]?.trim() ?? "", evidence: (colonStatus[3] ?? colonStatus[2] ?? "").trim() };

  return undefined;
}

function checkedChecklistHas(content: string, category: string): boolean {
  const normalizedCategory = category.toLowerCase();
  return content.split(/\r?\n/).some((line) => {
    const row = parseChecklistEvidenceLine(line);
    return Boolean(
      row &&
        row.checked &&
        row.category.trim().toLowerCase() === normalizedCategory &&
        contentHasValue(row.evidence),
    );
  });
}

function structuredFieldValue(line: string, field: string): string | undefined {
  const match = new RegExp(`^\\s*(?:[-*+]\\s*)?${escapeRegExp(field)}\\s*:\\s*(\\S.*)$`, "i").exec(line);
  return match?.[1]?.trim().toLowerCase();
}

function lineHasStructuredUserDecisionBlocker(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  const decisionState = structuredFieldValue(line, "DecisionState") ?? structuredFieldValue(line, "Decision State");
  const status = structuredFieldValue(line, "Status");
  const blockerType = structuredFieldValue(line, "BlockerType") ?? structuredFieldValue(line, "Blocker Type");
  const ownerWindow = lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 4));
  const hasUserOwner = ownerWindow.some((candidate) => structuredFieldValue(candidate, "DecisionOwner") === "user" || structuredFieldValue(candidate, "Decision Owner") === "user");
  if (hasUserOwner && ["unresolved", "pending", "blocked"].includes(decisionState ?? "")) return true;
  return blockerType === "user-decision" && ["blocked", "unresolved", "pending"].includes(status ?? "");
}

function findUnresolvedUserDecisionBlockers(options: {
  cwd: string;
  files: string[];
}): string[] {
  const blockers: string[] = [];
  for (const file of options.files) {
    const relativePath = path.relative(options.cwd, file);
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!lineHasStructuredUserDecisionBlocker(lines, index)) return;
      const excerpt = line.trim().replace(/\s+/g, " ").slice(0, 180);
      blockers.push(`Unresolved user decision in ${relativePath}:${index + 1}: ${excerpt}`);
    });
  }
  return blockers;
}

export function hasUnresolvedUserDecisionBlocker(
  evidence: PlanGoalStageValidationEvidence | undefined,
): boolean {
  return Boolean(evidence?.blockers.some((blocker) => blocker.startsWith("Unresolved user decision in ")));
}

export function createStageValidationEvidence(options: {
  cwd: string;
  currentPlan: string;
  stage: PlanGoalStageEnvironment;
}): PlanGoalStageValidationEvidence {
  const planPath = path.isAbsolute(options.currentPlan)
    ? options.currentPlan
    : path.join(options.cwd, options.currentPlan);
  const taskDir = path.dirname(planPath);
  const blockers: string[] = [];
  const durableFiles = discoverDurableMarkdownFiles(taskDir);
  blockers.push(...findUnresolvedUserDecisionBlockers({ cwd: options.cwd, files: durableFiles }));
  const statePath = stageStatePath(taskDir, options.stage);
  const stateFiles = existsSync(statePath) ? [statePath] : [];
  if (stateFiles.length > 0) {
    blockers.push(...findUnresolvedUserDecisionBlockers({ cwd: options.cwd, files: stateFiles }));
  }
  const requiredSections = {
    total: options.stage.requiredSections.length,
    present: 0,
    valid: 0,
  };

  if (!existsSync(statePath)) {
    blockers.push(`Missing internal stage checkpoint: ${path.relative(options.cwd, statePath)}`);
  } else {
    const stateContent = readFileSync(statePath, "utf8");
    if (!new RegExp(`^Stage:\\s*${escapeRegExp(options.stage.id)}\\s*$`, "m").test(stateContent)) {
      blockers.push(`Internal stage file has missing or wrong Stage: ${path.relative(options.cwd, statePath)}`);
    }
    const status = /^Status:\s*(created|blocked|completed)\s*$/m.exec(stateContent)?.[1];
    if (!status) {
      blockers.push(`Internal stage file has missing or invalid Status: ${path.relative(options.cwd, statePath)}`);
    } else if (status !== "completed") {
      blockers.push(`Internal stage checkpoint is not completed: ${path.relative(options.cwd, statePath)}`);
    }
    if (!/^Updated:\s*\S+\s*$/m.test(stateContent)) {
      blockers.push(`Internal stage file is missing Updated: ${path.relative(options.cwd, statePath)}`);
    }
  }

  for (const section of options.stage.requiredSections) {
    const content = stateFiles.length > 0 ? findMarkdownSection(stateFiles, section) : undefined;
    if (content === undefined) {
      blockers.push(`Missing required checkpoint section: ## ${section}`);
      continue;
    }
    requiredSections.present += 1;
    if (!contentHasValue(content)) {
      blockers.push(`Required checkpoint section is empty or placeholder: ## ${section}`);
      continue;
    }
    requiredSections.valid += 1;
  }

  const checklist = stateFiles.length > 0 ? findMarkdownSection(stateFiles, constructionChecklistHeader(options.stage.id)) : undefined;
  if (options.stage.constructionChecklist.length > 0 && checklist === undefined) {
    blockers.push(`Missing checkpoint construction checklist: ## ${constructionChecklistHeader(options.stage.id)}`);
  } else if (checklist !== undefined) {
    for (const item of options.stage.constructionChecklist) {
      if (!checkedChecklistHas(checklist, item)) {
        blockers.push(`Missing completed checkpoint construction checklist item: ${item}`);
      }
    }
  }

  return {
    stage: options.stage.id,
    ok: blockers.length === 0,
    blockers,
    requiredSections,
    nextStage: options.stage.nextStage,
  };
}

export function formatStageValidationEvidence(
  evidence: PlanGoalStageValidationEvidence,
): string {
  return [
    `stage: ${evidence.stage}`,
    `ok: ${String(evidence.ok)}`,
    `requiredSections: ${evidence.requiredSections.valid}/${evidence.requiredSections.total} valid (${evidence.requiredSections.present} present)`,
    evidence.nextStage ? `nextStage: ${evidence.nextStage}` : undefined,
    evidence.blockers.length > 0 ? `blockers:\n${evidence.blockers.map((blocker) => `- ${blocker}`).join("\n")}` : "blockers: none",
  ].filter(Boolean).join("\n");
}
