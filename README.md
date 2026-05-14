# dotdotgod

Dotdotgod gives AI coding agents a shared project memory layer: canonical instructions, doc-first planning, local plan/archive memory, and cross-agent adapters so Pi, Claude Code, and Codex can work from the same project context instead of rediscovering rules every session.

Repository: <https://github.com/dotdotgod/dotdotgod>

## What Gets Better?

- **Faster onboarding:** agents start from `AGENTS.md`, README indexes, specs, tests, and architecture docs.
- **Safer implementation:** work is planned in `docs/plan/` before source/config changes, then archived when complete.
- **Less instruction drift:** `AGENTS.md` is canonical while `CLAUDE.md` and `CODEX.md` stay thin.
- **Cross-agent continuity:** Pi, Claude Code, and Codex share the same docs scaffold and workflow vocabulary.
- **Cleaner local memory:** active plans, completed plans, and temporary reports have predictable locations and are ignored by git by default.
- **Verifiable docs hygiene:** the validator catches naming, README index, link, anchor, and local-memory shape regressions.

## Install the Adapter You Need

| Package | Use it for |
| --- | --- |
| [`@dotdotgod/pi`](packages/pi/README.md) | Pi project initializer skill, plan mode, and project loading extensions. |
| [`@dotdotgod/docs-validator`](packages/docs-validator/README.md) | Zero-dependency validation for the dotdotgod docs scaffold. |
| [`@dotdotgod/claude-code`](packages/claude-code/README.md) | Claude Code `dd:*` commands and project memory skills. |
| [`@dotdotgod/codex`](packages/codex/README.md) | Codex project memory skills and `dd:*` trigger phrases. |

Current first public package version: `0.1.0`.

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
