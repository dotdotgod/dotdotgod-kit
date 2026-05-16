#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const changed = [];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function ensureNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function write(relativePath, content) {
  const target = join(root, relativePath);
  const next = ensureNewline(content);
  const current = existsSync(target) ? readFileSync(target, "utf8") : undefined;
  if (current === next) return;
  changed.push(relativePath);
  if (!check) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, next);
  }
}

function copyFile(sourceRelativePath, targetRelativePath) {
  write(targetRelativePath, read(sourceRelativePath));
}

function copyDirectory(sourceRelativeDir, targetRelativeDir) {
  const source = join(root, sourceRelativeDir);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourceChild = `${sourceRelativeDir}/${entry.name}`;
    const targetChild = `${targetRelativeDir}/${entry.name}`;
    if (entry.isDirectory()) copyDirectory(sourceChild, targetChild);
    else if (entry.isFile()) copyFile(sourceChild, targetChild);
  }
}

const loadBody = read("packages/shared/workflows/load.md");
const planBody = read("packages/shared/workflows/plan.md");
const initBody = read("packages/shared/workflows/init.md");

const initCommands = {
  pi: "sh scripts/init_project.sh <project-root>",
  claude: 'sh "${CLAUDE_PLUGIN_ROOT}/skills/project-initializer/scripts/init_project.sh" <project-root>',
  codex: "sh scripts/init_project.sh <project-root>",
};

function renderInitBody(platform) {
  return initBody.replace("{{INIT_SCRIPT_COMMAND}}", initCommands[platform]);
}

function skill(frontmatter, title, body) {
  return `---\n${frontmatter.trim()}\n---\n\n# ${title}\n\n${body.trim()}\n`;
}

function command(frontmatter, title, intro, body) {
  return `---\n${frontmatter.trim()}\n---\n\n# ${title}\n\n${intro.trim()}\n\n${body.trim()}\n`;
}

const yaml = {
  load: `interface:\n  display_name: "Project Load"\n  short_description: "Load dotdotgod project memory."\n  default_prompt: "Load this project's dotdotgod memory and summarize rules, docs, commands, active plans, and open questions."\n`,
  plan: `interface:\n  display_name: "Doc-First Planning"\n  short_description: "Plan work from dotdotgod docs first."\n  default_prompt: "Plan this change from AGENTS.md, docs/spec, docs/test, docs/arch, and docs/plan before implementation."\n`,
  init: `interface:\n  display_name: "Project Initializer"\n  short_description: "Initialize agent docs and local docs folders."\n  default_prompt: "Initialize this project with dotdotgod init when available, otherwise use the bundled fallback; include AGENTS.md, CLAUDE.md, CODEX.md, docs folders, and local memory gitignore entries."\n`,
};

write(
  "packages/pi/skills/project-initializer/SKILL.md",
  skill(
    `name: project-initializer\ndescription: Initialize a new software project with shared AI agent instructions and a documentation scaffold. Use when asked to set up a new project, create or normalize AGENTS.md/CLAUDE.md/CODEX.md, create docs/spec docs/test docs/arch docs/plan docs/archive, or establish a doc-first project baseline for multiple AI agents.`,
    "Project Initializer",
    renderInitBody("pi"),
  ),
);
write("packages/pi/skills/project-initializer/agents/openai.yaml", yaml.init);
copyDirectory("packages/shared/initializer/scripts", "packages/pi/skills/project-initializer/scripts");
copyDirectory("packages/shared/initializer/references", "packages/pi/skills/project-initializer/references");

write(
  "packages/claude-code/commands/dd/load.md",
  command(
    `description: Load dotdotgod project memory for the current repository\nargument-hint: [optional focus]\nallowed-tools: [Read, Glob, Grep, Bash]`,
    "/dd:load - Load Project Memory",
    "Load the current repository's dotdotgod project memory in a read-only pass.\n\nUser focus, if provided: `$ARGUMENTS`",
    loadBody,
  ),
);
write(
  "packages/claude-code/commands/dd/plan.md",
  command(
    `description: Plan a change using dotdotgod doc-first planning conventions\nargument-hint: <task or change request>\nallowed-tools: [Read, Glob, Grep, Bash, Write, Edit]`,
    "/dd:plan - Doc-First Planning",
    "Create or update a dotdotgod implementation plan before changing source/config files.\n\nTask request: `$ARGUMENTS`",
    `${planBody.trim()}\n\n## Execution Rule\n\nDo not implement source/config changes until the plan is clear and the user asks to proceed.`,
  ),
);
write(
  "packages/claude-code/commands/dd/init.md",
  command(
    `description: Initialize dotdotgod shared agent docs and documentation scaffold\nargument-hint: [project-root] [--project-name NAME] [--dotdot-setting] [--force] [--dry-run]\nallowed-tools: [Read, Glob, Grep, Bash]`,
    "/dd:init - Initialize Project Memory",
    "Initialize or normalize a repository with dotdotgod shared agent docs and docs folders.\n\nArguments: `$ARGUMENTS`",
    renderInitBody("claude"),
  ),
);
write(
  "packages/claude-code/skills/project-load/SKILL.md",
  skill(
    `name: project-load\ndescription: Use this skill when the user asks Claude Code to load, refresh, inspect, summarize, or resume a repository's dotdotgod project memory; when starting unfamiliar work; or when a dd:load style project context pass is requested.\nversion: 1.0.0`,
    "Project Load",
    loadBody,
  ),
);
write(
  "packages/claude-code/skills/doc-first-planning/SKILL.md",
  skill(
    `name: doc-first-planning\ndescription: Use this skill when the user asks Claude Code to plan a feature, refactor, migration, architecture change, test strategy, or multi-step task using dotdotgod docs before implementation; when docs/spec, docs/test, docs/arch, docs/plan, or dd:plan are mentioned.\nversion: 1.0.0`,
    "Doc-First Planning",
    planBody,
  ),
);
write(
  "packages/claude-code/skills/project-initializer/SKILL.md",
  skill(
    `name: project-initializer\ndescription: Use this skill when Claude Code is asked to initialize or normalize a project with dotdotgod shared agent instructions, AGENTS.md/CLAUDE.md/CODEX.md, docs/spec docs/test docs/arch docs/plan docs/archive, or a doc-first project baseline.\nversion: 1.0.0`,
    "Project Initializer",
    renderInitBody("claude"),
  ),
);
write("packages/claude-code/skills/project-load/agents/openai.yaml", yaml.load);
write("packages/claude-code/skills/doc-first-planning/agents/openai.yaml", yaml.plan);
write("packages/claude-code/skills/project-initializer/agents/openai.yaml", yaml.init);
copyDirectory("packages/shared/initializer/scripts", "packages/claude-code/skills/project-initializer/scripts");
copyDirectory("packages/shared/initializer/references", "packages/claude-code/skills/project-initializer/references");

write(
  "packages/codex/skills/project-load/SKILL.md",
  skill(
    `name: project-load\ndescription: Load and summarize the current repository's dotdotgod project memory. Use when the user asks Codex to load, refresh, inspect, summarize, or resume project context; when switching repositories; when starting unfamiliar work; or when a dd:load style project memory pass is requested.`,
    "Project Load",
    loadBody,
  ),
);
write(
  "packages/codex/skills/doc-first-planning/SKILL.md",
  skill(
    `name: doc-first-planning\ndescription: Plan implementation work from dotdotgod project docs before source changes. Use when starting a feature, refactor, migration, architecture change, test strategy, or multi-step task; when docs/spec, docs/test, docs/arch, docs/plan, or dd:plan are mentioned; or when implementation should wait for a written plan.`,
    "Doc-First Planning",
    planBody,
  ),
);
write(
  "packages/codex/skills/project-initializer/SKILL.md",
  skill(
    `name: project-initializer\ndescription: Initialize a project with dotdotgod shared agent instructions and documentation scaffold. Use when Codex is asked to set up or normalize AGENTS.md/CLAUDE.md/CODEX.md, create docs/spec docs/test docs/arch docs/plan docs/archive, run dd:init, or establish a doc-first project baseline for multiple AI agents.`,
    "Project Initializer",
    renderInitBody("codex"),
  ),
);
write("packages/codex/skills/project-load/agents/openai.yaml", yaml.load);
write("packages/codex/skills/doc-first-planning/agents/openai.yaml", yaml.plan);
write("packages/codex/skills/project-initializer/agents/openai.yaml", yaml.init);
copyDirectory("packages/shared/initializer/scripts", "packages/codex/skills/project-initializer/scripts");
copyDirectory("packages/shared/initializer/references", "packages/codex/skills/project-initializer/references");

if (check && changed.length > 0) {
  console.error("Generated adapter resources are out of date:");
  for (const file of changed) console.error(`- ${file}`);
  console.error("Run `pnpm run generate` to update them.");
  process.exit(1);
}

if (changed.length > 0) {
  console.log(`Generated ${changed.length} adapter resource(s).`);
} else {
  console.log("Generated adapter resources are up to date.");
}
