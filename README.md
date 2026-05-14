# dotdotgod

dotdotgod is a context curation kit for AI coding agents.

It is not primarily about saving tokens. It is about giving agents the right project memory: rules, decisions, current intent, architecture, verification history, and completed work, organized so agents can continue without rediscovering the project.

Repository: <https://github.com/dotdotgod/dotdotgod>

## Core Idea

Agents work better from shaped project memory than from raw conversation history. dotdotgod turns scattered repo knowledge into a reusable context system:

- `AGENTS.md` for canonical working rules.
- `docs/spec/` for product truth and expected behavior.
- `docs/arch/` for engineering constraints and boundaries.
- `docs/test/` for verification knowledge.
- `docs/plan/` for active task intent and executable plans.
- `docs/archive/` for completed decisions, reports, and reusable historical memory.

## What Context Curation Improves

- **Less context noise:** important constraints are not buried under chat history and repeated tool output.
- **Better continuity:** active plans and archived outcomes survive across sessions, compaction, and agent handoff.
- **Fewer repeated explanations:** canonical instructions and docs become reusable project memory.
- **Less speculative work:** agents start from specs, architecture, tests, and project rules before changing code.
- **Safer execution:** planning happens before source changes, and execution follows explicit steps.
- **Reusable history:** completed plans and reports become future context instead of disappearing into chat logs.

## Install the Adapter You Need

| Package | Use it for |
| --- | --- |
| [`@dotdotgod/pi`](packages/pi/README.md) | Pi project initializer skill, plan mode, and project loading extensions. |
| [`@dotdotgod/docs-validator`](packages/docs-validator/README.md) | Zero-dependency validation for the dotdotgod docs scaffold. |
| [`@dotdotgod/claude-code`](packages/claude-code/README.md) | Claude Code `dd:*` commands and project memory skills. |
| [`@dotdotgod/codex`](packages/codex/README.md) | Codex project memory skills and `dd:*` trigger phrases. |

Current public package version: `0.1.1`.

## Quick Start

Pi adapter:

```bash
pi install npm:@dotdotgod/pi
```

Docs validator:

```bash
npx @dotdotgod/docs-validator .
```

Local workspace checks:

```bash
pnpm install
pnpm run verify
pnpm run pack:dry-run
.husky/pre-push
```

Local Pi adapter install:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
```

## Documentation

- [Context curation concept](docs/concept/CONTEXT_CURATION.md)
- [Project initializer spec](docs/spec/PROJECT_INITIALIZER.md)
- [Plan mode spec](docs/spec/PLAN_MODE.md)
- [Load project spec](docs/spec/LOAD_PROJECT.md)
- [Cross-agent support](docs/spec/CROSS_AGENT_SUPPORT.md)
- [Docs structure architecture](docs/arch/DOCS_STRUCTURE.md)
- [Cross-agent architecture](docs/arch/CROSS_AGENT_ARCHITECTURE.md)
- [Validation architecture](docs/arch/VALIDATION_ARCHITECTURE.md)
- [Extension architecture](docs/arch/EXTENSION_ARCHITECTURE.md)

## Publishing

The root workspace package is private. Publish public workspace packages individually or with:

```bash
pnpm run publish:all
```
