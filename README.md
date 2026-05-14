# dotdotgod

Dotdotgod project memory kit for AI coding agents. This repository is an npm workspace containing adapters and utilities for shared project memory workflows.

## Packages

- [`@dotdotgod/pi`](packages/pi/README.md): Pi adapter with project initializer skill, plan mode, and project loading extensions.
- [`@dotdotgod/docs-validator`](packages/docs-validator/README.md): zero-dependency docs scaffold validator and `dd-docs-validate` CLI.
- [`@dotdotgod/claude-code`](packages/claude-code/README.md): Claude Code adapter with `dd:*` commands and project memory skills.
- [`@dotdotgod/codex`](packages/codex/README.md): Codex adapter with project memory skills.

## Install Pi Adapter

```bash
pi install npm:@dotdotgod/pi
```

## Local Development

```bash
npm run verify
npm run pack:dry-run
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

The root package is private. Publish workspace packages individually or with:

```bash
npm run publish:all
```
