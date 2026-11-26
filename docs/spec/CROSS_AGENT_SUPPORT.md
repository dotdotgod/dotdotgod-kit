# Cross-Agent Support

## Purpose

Dotdotgod shares project memory workflows across five CLI-installed host integrations and the native Pi adapter while respecting host-specific permissions and discovery. The shared contract is the documentation scaffold and workflow, not identical slash command behavior.

## Supported Agent Families

### Pi

Current first-class support.

- Package entrypoint: `pi install npm:@dotdotgod/pi`; the `package.json#pi` manifest declares skills and extensions, and `@dotdotgod/cli` is the sole runtime dependency.
- Initialization: `project-initializer` skill; `dotdotgod adapter install pi --with-skills` adds only the two optional skills, not the Pi adapter.
- Runtime workflow: `plan-mode`, `load-project`, and `project-memory` extensions.
- Commands and tools: `/dd:plan`, `/load`, `/dd:load`, `project_memory_load` (active while unloaded in initialized repositories), `/impact-check`, and host-managed shared MCP tools without forwarding aliases. Pi retains plan/UI integration; pending impact is advisory and never blocks commands.

### OpenCode

The CLI-installed V2 plugin registers three commands, four skills, and shared MCP. Native plan automatically saves project plans; observed edits create advisory impact records without blocking tools. No `dd:plan` or `OPENCODE.md` is added. See [versioned contract](OPENCODE_ADAPTER.md).

### Claude Code

Current adapter support.

- Package entrypoint: Claude Code plugin manifest under `.claude-plugin/plugin.json`.
- Skills and commands: `project-initializer` (`/dd:init`), `project-load` (`/dd:load`), `doc-first-planning` (`/dd:plan`), and `impact-review` (`/dd:impact`).
- Shared CLI-backed local stdio MCP tools for generic execution/retrieval and project load/impact/initialize operations.
- Non-blocking lifecycle hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`) backed by `.dotdotgod/context/impact.sqlite` v3 for load completion and advisory impact; no `PreToolUse` blocking gate.
- `CLAUDE.md` remains a thin project entrypoint that imports or points to `AGENTS.md`.

### Codex

Current adapter support.

- Package entrypoint: Codex plugin manifest under `.codex-plugin/plugin.json`.
- Skills: `project-initializer`, `project-load`, `doc-first-planning`, and `impact-review`; `dd:init`/`dd:load`/`dd:plan`/`dd:impact` act as trigger phrases.
- Shared CLI-backed local stdio MCP tools and non-blocking lifecycle hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`), subject to Codex enablement/trust review, for optional Load advice and advisory impact reminders/clearance; no `PreToolUse` blocking gate.
- Codex reads `AGENTS.md` primarily; `CODEX.md` remains a thin entrypoint pointing to `AGENTS.md`.

### Antigravity

Native plugin for Antigravity CLI, App, and IDE; see [ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md).

- CLI-installed plugin with root `plugin.json`, `mcp_config.json` (`dotdotgod_context`), root `hooks.json` (`PostToolUse` + `PreInvocation` only), `rules/AGENTS.md` (scoped to initialized repos), pastel yellow-green `assets/logo.svg`, and three short `/dd-*` skills (`dd-init`, `dd-load`, `dd-impact`, `dd:*` triggers, no `commands/` folder or separate planning skill).
- Non-blocking advisory impact via `.dotdotgod/context/impact.sqlite` v3 (`claimUnnotified` one-time `PreInvocation` notice, `PostToolUse` `clearPaths` on successful `project_impact`).
- Option C-2 native `/plan` integration: read-only observation of `implementation_plan.md` triggers a one-time save advisory with zero hook workspace writes; `AGENTS.md` remains canonical (no `ANTIGRAVITY.md`/`GEMINI.md`).

### Hermes

Native CLI and messaging-gateway adapter without Plan Mode; see [HERMES_ADAPTER.md](HERMES_ADAPTER.md).

- CLI-installed native plugin with `plugin.yaml`, three registered canonical skills (`project-initializer`, `project-load`, `impact-review`), and 20 native tools.
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
| Plugin `rules/AGENTS.md` | Antigravity plugin | Scoped always-on router | Activate only when `dotdotgod.config.json` or `.dotdotgod/` exists | Installed by `dotdotgod adapter install antigravity` |
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

The workspace has three packages: public `@dotdotgod/cli` (the CLI, MCP,
hooks, adapter installer and assets), public `@dotdotgod/pi` (the native Pi
package), and private `@dotdotgod/obsidian` (community plugin build source).
The five other host integrations use `dotdotgod adapter`, not separate npm
packages. The CLI also ships `ddg-planning` and `document-clarify` as opt-in
assets, including for Pi. See the [installer contract](cli/ADAPTER.md) and
[0.12.0 migration guide](ADAPTER_MIGRATION.md).

Host files delegate to one persistent CLI installation; they are not
standalone runtime bundles. Mandatory map Load does not require an embedding
runtime; unavailable optional embeddings degrade only focused enrichment.
The root workspace is private. New package, command, and tool names use
`dotdotgod` and `dd` prefixes.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/assets/workflows/init.md](../../packages/cli/assets/workflows/init.md)
  - [packages/cli/assets/workflows/load.md](../../packages/cli/assets/workflows/load.md)
  - [packages/cli/assets/workflows/plan.md](../../packages/cli/assets/workflows/plan.md)
  - [packages/cli/assets/workflows/impact.md](../../packages/cli/assets/workflows/impact.md)
  - [packages/cli/assets/workflows/doc-clarify.md](../../packages/cli/assets/workflows/doc-clarify.md)
  - [packages/cli/assets/initializer/references/agent-docs.md](../../packages/cli/assets/initializer/references/agent-docs.md)
  - [packages/cli/src/adapters/hosts/claude-code.mjs](../../packages/cli/src/adapters/hosts/claude-code.mjs)
  - [packages/cli/src/adapters/hosts/codex.mjs](../../packages/cli/src/adapters/hosts/codex.mjs)
  - [docs/test/HOOKS.md](../test/HOOKS.md)
  - [packages/cli/assets/adapters/codex/plugin.json](../../packages/cli/assets/adapters/codex/plugin.json)
  - [packages/cli/assets/adapters/antigravity/plugin.json](../../packages/cli/assets/adapters/antigravity/plugin.json)
  - [packages/cli/assets/adapters/antigravity/hooks.json](../../packages/cli/assets/adapters/antigravity/hooks.json)
  - [packages/cli/assets/adapters/antigravity/rules/AGENTS.md](../../packages/cli/assets/adapters/antigravity/rules/AGENTS.md)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
  - [packages/cli/assets/optional-skills/document-clarify/SKILL.md](../../packages/cli/assets/optional-skills/document-clarify/SKILL.md)
  - [packages/pi/extensions/project-memory/index.ts](../../packages/pi/extensions/project-memory/index.ts)
  - [packages/cli/src/context/hooks.mjs](../../packages/cli/src/context/hooks.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [docs/test/README.md](../test/README.md)
  - [packages/cli/test/document-clarify.test.mjs](../../packages/cli/test/document-clarify.test.mjs)
  - [packages/cli/test/adapters/antigravity-resources.test.mjs](../../packages/cli/test/adapters/antigravity-resources.test.mjs)
  - [packages/pi/test/project-memory-extension.test.ts](../../packages/pi/test/project-memory-extension.test.ts)
  - [packages/cli/test/context/hooks.test.mjs](../../packages/cli/test/context/hooks.test.mjs)
  - [packages/cli/test/adapters/packaging-contract.test.mjs](../../packages/cli/test/adapters/packaging-contract.test.mjs)
  - [packages/cli/test/adapters/installer-lifecycle.test.mjs](../../packages/cli/test/adapters/installer-lifecycle.test.mjs)
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
  - `CROSS-AGENT-CLAUDE-001` — Claude Code adapter provides plugin commands, skills, hooks guidance, and thin CLAUDE.md routing (sections: 1, implementedBy: 2, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-CODEX-001` — Codex adapter provides skills, trigger phrases, hooks guidance, and CODEX.md routing (sections: 1, implementedBy: 7, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-ANTIGRAVITY-001` — Antigravity adapter provides native plugin manifest, MCP, scoped rules, advisory hooks, and Option C-2 plan sync (sections: 1, implementedBy: 4, verifiedBy: 2, relatedDocs: 1, designDecisions: 1)
  - `CROSS-AGENT-INSTRUCTIONS-001` — Agent-specific instruction surfaces route to the shared project-memory contract (sections: 1, implementedBy: 2, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-PARITY-001` — Adapters preserve behavior parity across native runtime mechanics (sections: 1, implementedBy: 5, verifiedBy: 1, designDecisions: 1)
  - `CROSS-AGENT-PACKAGING-001` — One CLI runtime, two public tarballs, and thin native host installations (sections: 1, implementedBy: 8, verifiedBy: 4, designDecisions: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/assets/workflows/init.md","packages/cli/assets/workflows/load.md","packages/cli/assets/workflows/plan.md","packages/cli/assets/workflows/impact.md","packages/cli/assets/workflows/doc-clarify.md","packages/cli/assets/initializer/references/agent-docs.md","packages/cli/src/adapters/hosts/claude-code.mjs","packages/cli/src/adapters/hosts/codex.mjs","docs/test/HOOKS.md","packages/cli/assets/adapters/codex/plugin.json","packages/cli/assets/adapters/antigravity/plugin.json","packages/cli/assets/adapters/antigravity/hooks.json","packages/cli/assets/adapters/antigravity/rules/AGENTS.md","scripts/generate-adapters.mjs","packages/cli/assets/optional-skills/document-clarify/SKILL.md","packages/pi/extensions/project-memory/index.ts","packages/cli/src/context/hooks.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","docs/test/README.md","packages/cli/test/document-clarify.test.mjs","packages/cli/test/adapters/antigravity-resources.test.mjs","packages/pi/test/project-memory-extension.test.ts","packages/cli/test/context/hooks.test.mjs","packages/cli/test/adapters/packaging-contract.test.mjs","packages/cli/test/adapters/installer-lifecycle.test.mjs"],"relatedDocs":["docs/spec/ANTIGRAVITY_ADAPTER.md","docs/spec/ADVISORY_IMPACT.md","docs/spec/DECISION_CONFIG.md"],"contracts":[{"id":"CROSS-AGENT-SHARED-001","title":"Shared docs scaffold and workflow contract stays agent-neutral","sections":["Shared Contract"],"implementedBy":["packages/cli/assets/workflows/init.md","packages/cli/assets/workflows/load.md","packages/cli/assets/workflows/plan.md","packages/cli/assets/workflows/impact.md","packages/cli/assets/workflows/doc-clarify.md","packages/cli/assets/initializer/references/agent-docs.md"],"verifiedBy":["packages/cli/test/core.test.mjs"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md"]},{"id":"CROSS-AGENT-PI-001","title":"Pi adapter provides first-class package, skills, extensions, commands, and tools","sections":["Pi"],"implementedBy":["packages/pi/package.json","packages/pi/README.md","packages/pi/extensions/project-memory/index.ts"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/pi/test/project-memory-extension.test.ts"],"relatedDocs":["docs/spec/DECISION_CONFIG.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-CLAUDE-001","title":"Claude Code adapter provides plugin commands, skills, hooks guidance, and thin CLAUDE.md routing","sections":["Claude Code"],"implementedBy":["packages/cli/src/adapters/hosts/claude-code.mjs","docs/test/HOOKS.md"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-CODEX-001","title":"Codex adapter provides skills, trigger phrases, hooks guidance, and CODEX.md routing","sections":["Codex"],"implementedBy":["packages/cli/assets/adapters/codex/plugin.json","packages/cli/src/adapters/hosts/codex.mjs","packages/cli/assets/workflows/load.md","packages/cli/assets/workflows/plan.md","packages/cli/assets/workflows/init.md","packages/cli/assets/workflows/impact.md","docs/test/HOOKS.md"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-ANTIGRAVITY-001","title":"Antigravity adapter provides native plugin manifest, MCP, scoped rules, advisory hooks, and Option C-2 plan sync","sections":["Antigravity"],"implementedBy":["packages/cli/assets/adapters/antigravity/plugin.json","packages/cli/src/adapters/hosts/antigravity.mjs","packages/cli/assets/adapters/antigravity/hooks.json","packages/cli/assets/adapters/antigravity/rules/AGENTS.md"],"verifiedBy":["packages/cli/test/adapters/antigravity-resources.test.mjs","packages/cli/test/context/hooks-antigravity.test.mjs"],"relatedDocs":["docs/spec/ANTIGRAVITY_ADAPTER.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-INSTRUCTIONS-001","title":"Agent-specific instruction surfaces route to the shared project-memory contract","sections":["Instruction Surface Matrix"],"implementedBy":["packages/cli/assets/initializer/references/agent-docs.md","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs"],"relatedDocs":[],"designDecisions":["docs/arch/DOCS_STRUCTURE.md"]},{"id":"CROSS-AGENT-PARITY-001","title":"Adapters preserve behavior parity across native runtime mechanics","sections":["Workflow Parity"],"implementedBy":["packages/cli/assets/workflows/init.md","packages/cli/assets/workflows/load.md","packages/cli/assets/workflows/plan.md","packages/cli/assets/workflows/impact.md","packages/cli/assets/workflows/doc-clarify.md"],"verifiedBy":["docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]},{"id":"CROSS-AGENT-PACKAGING-001","title":"One CLI runtime, two public tarballs, and thin native host installations","sections":["Packaging Contract"],"implementedBy":["packages/cli/src/adapters/hosts/claude-code.mjs","packages/cli/assets/adapters/codex/plugin.json","packages/cli/assets/adapters/antigravity/plugin.json","scripts/generate-adapters.mjs","packages/cli/package.json","packages/pi/package.json","packages/obsidian/package.json","packages/cli/src/adapters/index.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/adapters/runtime-smoke.test.mjs","packages/cli/test/adapters/packaging-contract.test.mjs","packages/cli/test/adapters/installer-lifecycle.test.mjs"],"relatedDocs":[],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md"]}
```
