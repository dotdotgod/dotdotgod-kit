# Cross-Agent Support

## Purpose

Dotdotgod provides the same project memory workflow across multiple AI coding agents while respecting each agent's native extension model.

The shared contract is the documentation scaffold and workflow, not identical slash command behavior.

## Supported Agent Families

### Pi

Current first-class support.

- Package entrypoint: npm package with `package.json#pi` manifest.
- Initialization: `project-initializer` skill.
- Runtime workflow: `plan-mode` and `load-project` extensions.
- Commands: `/plan`, `/todos`, `/load`, `/dd:load`.

### Claude Code

Current adapter support.

- Package entrypoint: Claude Code plugin manifest under `.claude-plugin/plugin.json`.
- Initialization: `project-initializer` skill and `/dd:init` command.
- Project loading: `project-load` skill and `/dd:load` command.
- Planning workflow: `doc-first-planning` skill and `/dd:plan` command.
- Optional lifecycle hook guidance for advisory project-memory reminders, validation, and narrowly scoped plan-safety patterns.
- `CLAUDE.md` remains a thin project entrypoint that imports or points to `AGENTS.md`.

### Codex

Current adapter support.

- Package entrypoint: Codex plugin manifest under `.codex-plugin/plugin.json`.
- Skills: `project-initializer`, `project-load`, and `doc-first-planning`.
- Codex reads `AGENTS.md` as a primary project instruction source.
- `dd:init`, `dd:load`, and `dd:plan` are command-like trigger phrases unless the active Codex runtime provides direct command registration.
- Optional lifecycle hook guidance for trusted Codex configuration layers.
- `CODEX.md` remains a thin project entrypoint that points to `AGENTS.md`.

## Shared Contract

All supported agents should share these conventions:

- `AGENTS.md` is the canonical long-lived project instruction file.
- `CLAUDE.md` and `CODEX.md` stay thin and point to `AGENTS.md`.
- `docs/spec/`, `docs/test/`, `docs/arch/`, `docs/plan/`, and `docs/archive/` keep the same meanings.
- Active task plans use `docs/plan/<task-slug>/README.md`.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports and investigations move to `docs/archive/report/<report-slug>/`.
- Docs naming, README indexes, size guidelines, and domain-directory promotion rules remain agent-neutral.

## Workflow Parity

Adapters should provide workflow parity across each agent's native capabilities.

Required workflows:

- initialize or normalize project memory scaffold
- load project memory in a read-only context
- plan safely before source/config changes
- preserve completed plans and temporary reports in the archive structure

Optional workflows:

- slash commands matching `dd:*` names
- keyboard shortcuts
- tool filtering or permission hooks
- lifecycle hooks for advisory load/plan reminders, validation, and narrowly scoped plan-safety checks
- project memory indexing/search
- CLI-backed load snapshots where shell or package execution is available

## Packaging Contract

Cross-agent support is distributed as npm workspace packages:

- `@dotdotgod/pi`: Pi adapter with skills and extensions.
- `@dotdotgod/cli`: validation, project memory snapshot, and graph indexing CLI.
- `@dotdotgod/claude-code`: Claude Code adapter with plugin commands and skills.
- `@dotdotgod/codex`: Codex adapter with project memory skills.

Versions are fixed across packages initially. The root workspace package is private and is not published.

New package, command, and tool names should use dotdotgod and `dd` prefixes.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/shared/workflows/init.md",
    "packages/shared/workflows/load.md",
    "packages/shared/workflows/plan.md",
    "packages/claude-code/commands/dd/load.md",
    "packages/claude-code/skills/project-load/SKILL.md",
    "packages/codex/skills/project-load/SKILL.md",
    "packages/claude-code/hooks/README.md",
    "packages/codex/hooks/README.md",
    "packages/claude-code/.claude-plugin/plugin.json",
    "packages/codex/.codex-plugin/plugin.json",
    "scripts/generate-adapters.mjs"
  ],
  "verifiedBy": [
    "packages/cli/test/core.test.mjs",
    "docs/test/README.md"
  ],
  "relatedDocs": [
    "docs/arch/CROSS_AGENT_ARCHITECTURE.md",
    "docs/arch/DOCS_STRUCTURE.md"
  ],
  "verificationCommands": [
    "pnpm run verify:generated",
    "pnpm run verify"
  ]
}
```
