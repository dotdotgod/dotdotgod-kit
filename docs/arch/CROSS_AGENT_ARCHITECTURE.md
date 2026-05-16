# Cross-Agent Architecture

## Purpose

This document defines how dotdotgod provides a cross-agent project memory kit for Pi, Claude Code, and Codex.

## Architectural Direction

Use shared source resources with thin generated agent adapters.

```text
dotdotgod
├── packages/shared/           # private shared source resources for generated adapters
├── packages/cli/              # shared CLI for validation, snapshots, and graph indexing
├── packages/pi/               # generated Pi skills plus Pi extensions
├── packages/claude-code/      # generated Claude Code plugin commands and skills
├── packages/codex/            # generated Codex plugin skills
└── scripts/generate-adapters.mjs
```

`packages/shared` is the source of truth for common workflow text and initializer resources. Adapter packages keep generated concrete files checked in so local installs and npm tarballs work without a build step.

## Shared Source Responsibilities

`packages/shared` owns agent-neutral assets and contracts:

- `workflows/load.md`: common project memory loading guidance, including snapshot-first CLI guidance with manual README-index fallback.
- `workflows/plan.md`: common doc-first planning guidance.
- `workflows/init.md`: common project initializer guidance that uses `dotdotgod init` when available and provides platform-specific fallback script command placeholders when the CLI is absent.
- `initializer/scripts/init_project.sh`: deterministic fallback scaffold generator mirroring `dotdotgod init`.
- `initializer/references/agent-docs.md`: shared agent-doc naming reference.

Shared guidance must not depend on one agent's tool names, shortcuts, or extension APIs. Platform wrappers, frontmatter, command names, and runtime enforcement stay in generated adapter resources or adapter code.

## Adapter Responsibilities

### Pi Adapter

Package: `packages/pi/`

Current implementation:

- `package.json#pi`
- `skills/project-initializer/`
- `extensions/plan-mode/`
- `extensions/load-project/`

Pi-specific behavior remains here:

- slash command registration
- shortcut registration
- tool filtering
- session state
- active plan-file touch tracking and concise execute/stay/refine review prompts

Commands:

- `/plan`
- `/todos`
- `/load`
- `/dd:load`

### Claude Code Adapter

Package: `packages/claude-code/`

Current implementation:

- `.claude-plugin/plugin.json`
- `commands/dd/load.md`
- `commands/dd/plan.md`
- `commands/dd/init.md`
- `skills/project-load/`
- `skills/doc-first-planning/`
- `skills/project-initializer/`

Responsibilities:

- Claude plugin manifest and installable resources
- project-memory initialization skill and `/dd:init` command
- project loading skill and `/dd:load` command
- planning workflow guidance using Claude-native command and skill components
- generated load guidance that prefers `dotdotgod load-snapshot` when available and falls back to README-index reads
- optional hooks later if they safely enforce docs-plan restrictions

### Codex Adapter

Package: `packages/codex/`

Current implementation:

- `.codex-plugin/plugin.json`
- `skills/project-load/`
- `skills/doc-first-planning/`
- `skills/project-initializer/`

Responsibilities:

- Codex plugin manifest and package resources
- reusable skills for initialization, loading, and planning workflows
- generated load guidance that prefers `dotdotgod load-snapshot` when available and falls back to README-index reads
- `AGENTS.md`-first instruction flow
- command-like trigger phrases: `dd:init`, `dd:load`, and `dd:plan`
- optional MCP/tooling integration when useful

Codex adapter design should not depend on Pi-style command parity.

## Packaging Strategy

Use a pnpm workspace monorepo:

```text
packages/cli/
packages/pi/
packages/claude-code/
packages/codex/
```

Published package names:

- `@dotdotgod/cli`
- `@dotdotgod/pi`
- `@dotdotgod/claude-code`
- `@dotdotgod/codex`

The root package is private and only orchestrates workspace verification and publishing.

Use fixed versions initially. Independent versions are only worth the overhead when adapter release cadences diverge.

## Migration Rules

- Keep current Pi behavior compatible after resources live under `packages/pi/`.
- Use `dd` for new namespaces and command prefixes.
- Edit common workflow text in `packages/shared`, then run `pnpm run generate`.
- Keep generated adapter files checked in for zero-build local installs.
- Use `pnpm run verify:generated` to catch drift when generated files are edited directly.
- Keep `AGENTS.md` and docs scaffold stable across adapters.
- Keep platform-specific enforcement in adapter code, not in shared docs.

## Verification Strategy

Generation and package verification:

```bash
pnpm run generate
pnpm run verify:generated
pnpm run verify
pnpm run pack:dry-run
```

Pi verification:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
pi install npm:@dotdotgod/pi
```

Claude Code verification should add:

- Claude Code plugin schema/load test
- local plugin smoke test for `/dd:load`, `/dd:plan`, and `/dd:init`

Codex verification should add:

- Codex plugin discovery/load test
- Codex skill trigger smoke tests for project loading, planning, and initialization
- `dotdotgod init` dry-run and fallback initializer dry-run parity across adapters
