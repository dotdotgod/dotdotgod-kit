# Cross-Agent Support

## Purpose

Dotdotgod shares project memory workflows across six agent adapters while respecting native extensions. The shared contract is the documentation scaffold and workflow, not identical slash command behavior.

## Supported Agent Families

### Pi

Current first-class support.

- Package entrypoint: npm package with `package.json#pi` manifest and runtime dependencies for `@dotdotgod/cli` and `@dotdotgod/context`.
- Initialization: `project-initializer` skill; `document-clarify` is installed separately from `@dotdotgod/skills`.
- Runtime workflow: `plan-mode`, `load-project`, and `project-memory` extensions.
- Commands and tools: `/dd:plan`, `/load`, `/dd:load`, `project_memory_load` (active while unloaded in initialized repositories), `/impact-check`, and host-managed shared MCP tools without forwarding aliases. Pi retains plan/UI integration; pending impact is advisory and never blocks commands.

### OpenCode

`@dotdotgod/opencode` registers three commands, four skills, and shared MCP. Native plan automatically saves project plans; observed edits create advisory impact records without blocking tools. No `dd:plan` or `OPENCODE.md` is added. See [versioned contract](OPENCODE_ADAPTER.md).

### Claude Code

Current adapter support.

- Package entrypoint: Claude Code plugin manifest under `.claude-plugin/plugin.json`.
- Skills and commands: `project-initializer` (`/dd:init`), `project-load` (`/dd:load`), `doc-first-planning` (`/dd:plan`), and `impact-review` (`/dd:impact`). Install `document-clarify` separately from `@dotdotgod/skills`.
- Bundled local stdio MCP tools for generic execution/retrieval and project load/impact/initialize operations.
- Bundled non-blocking lifecycle hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`) backed by `.dotdotgod/context/impact.sqlite` v3 for load completion and advisory impact; no `PreToolUse` blocking gate.
- `CLAUDE.md` remains a thin project entrypoint that imports or points to `AGENTS.md`.

### Codex

Current adapter support.

- Package entrypoint: Codex plugin manifest under `.codex-plugin/plugin.json`.
- Skills: `project-initializer`, `project-load`, `doc-first-planning`, and `impact-review`; `dd:init`/`dd:load`/`dd:plan`/`dd:impact` act as trigger phrases. Install `document-clarify` separately from `@dotdotgod/skills`.
- Bundled local stdio MCP tools and non-blocking lifecycle hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`), subject to Codex enablement/trust review, for optional Load advice and advisory impact reminders/clearance; no `PreToolUse` blocking gate.
- Codex reads `AGENTS.md` primarily; `CODEX.md` remains a thin entrypoint pointing to `AGENTS.md`.

### Antigravity

Native plugin for Antigravity CLI, App, and IDE; see [ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md).

- Package: `@dotdotgod/antigravity` with root `plugin.json`, `mcp_config.json` (`dotdotgod_context`), root `hooks.json` (`PostToolUse` + `PreInvocation` only), `rules/AGENTS.md` (scoped to initialized repos), pastel yellow-green `assets/logo.svg`, and three short `/dd-*` skills (`dd-init`, `dd-load`, `dd-impact`, `dd:*` triggers, no `commands/` folder or separate planning skill). Install `document-clarify` separately from `@dotdotgod/skills`.
- Non-blocking advisory impact via `.dotdotgod/context/impact.sqlite` v3 (`claimUnnotified` one-time `PreInvocation` notice, `PostToolUse` `clearPaths` on successful `project_impact`).
- Option C-2 native `/plan` integration: read-only observation of `implementation_plan.md` triggers a one-time save advisory with zero hook workspace writes; `AGENTS.md` remains canonical (no `ANTIGRAVITY.md`/`GEMINI.md`).

### Hermes

Native CLI and messaging-gateway adapter without Plan Mode; see [HERMES_ADAPTER.md](HERMES_ADAPTER.md).

- Package: `@dotdotgod/hermes` with native `plugin.yaml`, three registered canonical skills (`project-initializer`, `project-load`, `impact-review`; `document-clarify` separate in `@dotdotgod/skills`), and 20 native tools.
- Per-session adapter-owned stdio MCP client/server routing, operator-controlled root labels, optional load guidance and explicit map/query loading, reference expansion, and Path 1 advisory impact via `post_tool_call` and `impact.sqlite` v3 (zero blocking gates).
- Native Hermes `delegate_task`, no planning wizard/compaction, canonical `AGENTS.md`.

## Shared Contract

All supported agents share these conventions:

- `AGENTS.md` is the canonical long-lived project instruction file with the stable dotdotgod purpose and `dotdotgod --help` route; `CLAUDE.md` and `CODEX.md` stay thin pointers.
- `docs/spec/`, `docs/test/`, `docs/arch/`, `docs/plan/`, and `docs/archive/` keep the same meanings; active task plans use `docs/plan/<task-slug>/README.md`, completed plans move to `docs/archive/plan/<task-slug>/`, and temporary reports move to `docs/archive/report/<report-slug>/`.
- Docs naming, README indexes, size guidelines, and domain-directory promotion rules remain agent-neutral.

## Instruction Surface Matrix

Dotdotgod treats agent-specific instruction files as routing surfaces over one shared project-memory contract.

| Surface | Tool or owner | Role | Expected content | Support status |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | Shared agents, Codex, OpenCode, Antigravity, Hermes | Canonical instructions | Purpose, commands, docs map, coding and verification rules | Required |
| `CLAUDE.md` | Claude Code | Thin entrypoint | Import `AGENTS.md`; avoid duplicated rules | Required pointer |
| `CODEX.md` | Codex | Thin project entrypoint | Point to `AGENTS.md`; minimal Codex bootstrap details | Required thin pointer |
| Plugin `rules/AGENTS.md` | Antigravity plugin | Scoped always-on router | Activate only when `dotdotgod.config.json` or `.dotdotgod/` exists | Bundled in `@dotdotgod/antigravity` |
| `.github/copilot-instructions.md` | GitHub Copilot | Optional repo surface | Route to `AGENTS.md`, `docs/README.md`, and commands | Optional, not generated |
| `.cursor/rules/*.md` | Cursor | Optional path-scoped rules | Route durable project rules to `AGENTS.md` and docs indexes | Optional, not generated |
| `llms.txt` or docs index | Web docs/tools | Optional discovery surface | Point to README indexes rather than embedding bodies | Optional, not generated |

Agent-specific surfaces must not copy the full canonical rules body; they route to the shared docs scaffold.

## Workflow Parity

Adapters provide behavioral parity across native mechanics:

- Initialize or normalize the project memory scaffold and editable default config.
- Load project memory without editing source, docs, or config. Retain the documentation map, optional focused query with visible degradation, and `Help: dotdotgod --help`.
- Use zero-config, non-forcing `advisory` in initialized repositories. Hosts deliver it through lifecycle context or Antigravity's static rule. `mode: "always"` preserves Pi's forced-load prompt; other hosts offer a load hint. `manual` suppresses automatic guidance and `model` opts into triage; see [Decision Config](DECISION_CONFIG.md).
- Where planning is supported, plan safely before source/config changes (Hermes excludes Plan Mode; OpenCode, Claude Code, Codex, and Antigravity preserve native planning gates).
- Track observed edits as non-blocking advisory impact in `.dotdotgod/context/impact.sqlite` v3 without denying tools or bypassing host permissions.
- Preserve completed plans and temporary reports in the archive structure.

Optional workflows include `dd:*` slash commands, keyboard shortcuts, lifecycle hooks for advisory reminders/sync, project memory indexing/search, and CLI-backed focused query/impact checks.

## Packaging Contract

`@dotdotgod/skills` alone supplies `document-clarify`; see [migration](../../packages/skills/MIGRATION.md). Workspace packages:

- `@dotdotgod/cli`: validation, local documentation query, and graph indexing CLI.
- `@dotdotgod/context`: shared local execution, FTS5 retrieval, hooks, project workflow services, and stdio MCP runtime.
- `@dotdotgod/pi`: Pi adapter with skills, extensions, and local `@dotdotgod/cli` + `@dotdotgod/context` dependencies.
- `@dotdotgod/opencode`: V2 plugin, generated commands/skills, bundled MCP, native plan integration, and advisory impact.
- `@dotdotgod/claude-code`: Claude Code plugin with commands, skills, bundled MCP, and advisory hooks.
- `@dotdotgod/codex`: Codex plugin with skills, bundled MCP, advisory hooks, and opt-in native plan setup.
- `@dotdotgod/antigravity`: Antigravity plugin with manifest, `mcp_config.json`, advisory/plan-sync `hooks.json`, `rules/AGENTS.md`, `assets/logo.svg`, and three short skills (`dd-init`, `dd-load`, `dd-impact`).
- `@dotdotgod/hermes`: native Hermes plugin resources with per-session MCP routing and Path 1 advisory impact (no Plan Mode).

Extracted or cached Claude Code, Codex, and Antigravity adapters must satisfy the mandatory project-load map contract without ancestor `node_modules`; unavailable optional embeddings degrade only focused enrichment. Versions are aligned across packages; the root workspace package is private. New package, command, and tool names use `dotdotgod` and `dd` prefixes.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/shared/workflows/init.md](../../packages/shared/workflows/init.md)
  - [packages/shared/workflows/load.md](../../packages/shared/workflows/load.md)
  - [packages/shared/workflows/plan.md](../../packages/shared/workflows/plan.md)
  - [packages/shared/workflows/impact.md](../../packages/shared/workflows/impact.md)
  - [packages/shared/workflows/doc-clarify.md](../../packages/shared/workflows/doc-clarify.md)
  - [packages/shared/initializer/references/agent-docs.md](../../packages/shared/initializer/references/agent-docs.md)
  - [packages/claude-code/commands/dd/load.md](../../packages/claude-code/commands/dd/load.md)
  - [packages/claude-code/commands/dd/plan.md](../../packages/claude-code/commands/dd/plan.md)
  - [packages/claude-code/commands/dd/init.md](../../packages/claude-code/commands/dd/init.md)
  - [packages/claude-code/commands/dd/impact.md](../../packages/claude-code/commands/dd/impact.md)
  - [packages/claude-code/skills/project-load/SKILL.md](../../packages/claude-code/skills/project-load/SKILL.md)
  - [packages/claude-code/skills/doc-first-planning/SKILL.md](../../packages/claude-code/skills/doc-first-planning/SKILL.md)
  - [packages/claude-code/skills/project-initializer/SKILL.md](../../packages/claude-code/skills/project-initializer/SKILL.md)
  - [packages/claude-code/skills/impact-review/SKILL.md](../../packages/claude-code/skills/impact-review/SKILL.md)
  - [packages/codex/skills/project-load/SKILL.md](../../packages/codex/skills/project-load/SKILL.md)
  - [packages/codex/skills/doc-first-planning/SKILL.md](../../packages/codex/skills/doc-first-planning/SKILL.md)
  - [packages/codex/skills/project-initializer/SKILL.md](../../packages/codex/skills/project-initializer/SKILL.md)
  - [packages/codex/skills/impact-review/SKILL.md](../../packages/codex/skills/impact-review/SKILL.md)
  - [packages/claude-code/hooks/README.md](../../packages/claude-code/hooks/README.md)
  - [packages/codex/hooks/README.md](../../packages/codex/hooks/README.md)
  - [packages/claude-code/.claude-plugin/plugin.json](../../packages/claude-code/.claude-plugin/plugin.json)
  - [packages/codex/.codex-plugin/plugin.json](../../packages/codex/.codex-plugin/plugin.json)
  - [packages/antigravity/plugin.json](../../packages/antigravity/plugin.json)
  - [packages/antigravity/hooks.json](../../packages/antigravity/hooks.json)
  - [packages/antigravity/rules/AGENTS.md](../../packages/antigravity/rules/AGENTS.md)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
  - [packages/skills/skills/document-clarify/SKILL.md](../../packages/skills/skills/document-clarify/SKILL.md)
  - [packages/pi/extensions/project-memory/index.ts](../../packages/pi/extensions/project-memory/index.ts)
  - [packages/context/src/hooks.mjs](../../packages/context/src/hooks.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [docs/test/README.md](../test/README.md)
  - [packages/cli/test/document-clarify.test.mjs](../../packages/cli/test/document-clarify.test.mjs)
  - [packages/antigravity/test/resources.test.mjs](../../packages/antigravity/test/resources.test.mjs)
  - [packages/pi/test/project-memory-extension.test.ts](../../packages/pi/test/project-memory-extension.test.ts)
  - [packages/context/test/hooks.test.mjs](../../packages/context/test/hooks.test.mjs)
- Related docs:
  - [docs/spec/ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md)
  - [docs/spec/ADVISORY_IMPACT.md](ADVISORY_IMPACT.md)
  - [docs/spec/DECISION_CONFIG.md](DECISION_CONFIG.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/arch/DOCS_STRUCTURE.md](../arch/DOCS_STRUCTURE.md)
- Contracts:
  - `CROSS-AGENT-SHARED-001` — Shared docs scaffold and workflow contract stays agent-neutral (sections: 1, implementedBy: 6, verifiedBy: 1, designDecisions: 2)
  - `CROSS-AGENT-PI-001` — Pi adapter provides first-class package, skills, extensions, commands, and tools (sections: 1, implementedBy: 3, verifiedBy: 2, relatedDocs: 1, designDecisions: 1)
  - `CROSS-AGENT-CLAUDE-001` — Claude Code adapter provides plugin commands, skills, hooks guidance, and thin CLAUDE.md routing (sections: 1, implementedBy: 6, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-CODEX-001` — Codex adapter provides skills, trigger phrases, hooks guidance, and CODEX.md routing (sections: 1, implementedBy: 6, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-ANTIGRAVITY-001` — Antigravity adapter provides native plugin manifest, MCP, scoped rules, advisory hooks, and Option C-2 plan sync (sections: 1, implementedBy: 4, verifiedBy: 2, relatedDocs: 1, designDecisions: 1)
  - `CROSS-AGENT-INSTRUCTIONS-001` — Agent-specific instruction surfaces route to the shared project-memory contract (sections: 1, implementedBy: 2, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-PARITY-001` — Adapters preserve behavior parity across native runtime mechanics (sections: 1, implementedBy: 5, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-PACKAGING-001` — Cross-agent support ships as aligned npm workspace packages and manifests (sections: 1, implementedBy: 4, verifiedBy: 2, designDecisions: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/shared/workflows/init.md","packages/shared/workflows/load.md","packages/shared/workflows/plan.md","packages/shared/workflows/impact.md","packages/shared/workflows/doc-clarify.md","packages/shared/initializer/references/agent-docs.md","packages/claude-code/commands/dd/load.md","packages/claude-code/commands/dd/plan.md","packages/claude-code/commands/dd/init.md","packages/claude-code/commands/dd/impact.md","packages/claude-code/skills/project-load/SKILL.md","packages/claude-code/skills/doc-first-planning/SKILL.md","packages/claude-code/skills/project-initializer/SKILL.md","packages/claude-code/skills/impact-review/SKILL.md","packages/codex/skills/project-load/SKILL.md","packages/codex/skills/doc-first-planning/SKILL.md","packages/codex/skills/project-initializer/SKILL.md","packages/codex/skills/impact-review/SKILL.md","packages/claude-code/hooks/README.md","packages/codex/hooks/README.md","packages/claude-code/.claude-plugin/plugin.json","packages/codex/.codex-plugin/plugin.json","packages/antigravity/plugin.json","packages/antigravity/hooks.json","packages/antigravity/rules/AGENTS.md","scripts/generate-adapters.mjs","packages/skills/skills/document-clarify/SKILL.md","packages/pi/extensions/project-memory/index.ts","packages/context/src/hooks.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","docs/test/README.md","packages/cli/test/document-clarify.test.mjs","packages/antigravity/test/resources.test.mjs","packages/pi/test/project-memory-extension.test.ts","packages/context/test/hooks.test.mjs"],"relatedDocs":["docs/spec/ANTIGRAVITY_ADAPTER.md","docs/spec/ADVISORY_IMPACT.md","docs/spec/DECISION_CONFIG.md"],"contracts":[{"id":"CROSS-AGENT-SHARED-001","title":"Shared docs scaffold and workflow contract stays agent-neutral","sections":["Shared Contract"],"implementedBy":["packages/shared/workflows/init.md","packages/shared/workflows/load.md","packages/shared/workflows/plan.md","packages/shared/workflows/impact.md","packages/shared/workflows/doc-clarify.md","packages/shared/initializer/references/agent-docs.md"],"verifiedBy":["packages/cli/test/core.test.mjs"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md"]},{"id":"CROSS-AGENT-PI-001","title":"Pi adapter provides first-class package, skills, extensions, commands, and tools","sections":["Pi"],"implementedBy":["packages/pi/package.json","packages/pi/README.md","packages/pi/extensions/project-memory/index.ts"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/pi/test/project-memory-extension.test.ts"],"relatedDocs":["docs/spec/DECISION_CONFIG.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-CLAUDE-001","title":"Claude Code adapter provides plugin commands, skills, hooks guidance, and thin CLAUDE.md routing","sections":["Claude Code"],"implementedBy":["packages/claude-code/.claude-plugin/plugin.json","packages/claude-code/commands/dd/load.md","packages/claude-code/commands/dd/plan.md","packages/claude-code/commands/dd/init.md","packages/claude-code/commands/dd/impact.md","packages/claude-code/hooks/README.md"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-CODEX-001","title":"Codex adapter provides skills, trigger phrases, hooks guidance, and CODEX.md routing","sections":["Codex"],"implementedBy":["packages/codex/.codex-plugin/plugin.json","packages/codex/skills/project-load/SKILL.md","packages/codex/skills/doc-first-planning/SKILL.md","packages/codex/skills/project-initializer/SKILL.md","packages/codex/skills/impact-review/SKILL.md","packages/codex/hooks/README.md"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-ANTIGRAVITY-001","title":"Antigravity adapter provides native plugin manifest, MCP, scoped rules, advisory hooks, and Option C-2 plan sync","sections":["Antigravity"],"implementedBy":["packages/antigravity/plugin.json","packages/antigravity/mcp_config.json","packages/antigravity/hooks.json","packages/antigravity/rules/AGENTS.md"],"verifiedBy":["packages/antigravity/test/resources.test.mjs","packages/context/test/hooks-antigravity.test.mjs"],"relatedDocs":["docs/spec/ANTIGRAVITY_ADAPTER.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-INSTRUCTIONS-001","title":"Agent-specific instruction surfaces route to the shared project-memory contract","sections":["Instruction Surface Matrix"],"implementedBy":["packages/shared/initializer/references/agent-docs.md","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs"],"relatedDocs":[],"designDecisions":["docs/arch/DOCS_STRUCTURE.md"]},{"id":"CROSS-AGENT-PARITY-001","title":"Adapters preserve behavior parity across native runtime mechanics","sections":["Workflow Parity"],"implementedBy":["packages/shared/workflows/init.md","packages/shared/workflows/load.md","packages/shared/workflows/plan.md","packages/shared/workflows/impact.md","packages/shared/workflows/doc-clarify.md"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-PACKAGING-001","title":"Cross-agent support ships as aligned npm workspace packages and manifests","sections":["Packaging Contract"],"implementedBy":["packages/claude-code/.claude-plugin/plugin.json","packages/codex/.codex-plugin/plugin.json","packages/antigravity/plugin.json","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/context/test/adapter-packaging.test.mjs"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md"]}
```
