# dotdotgod

Dotdotgod is a pnpm workspace for shared AI-agent project memory workflows. It provides adapters for Pi, Claude Code, and Codex plus a docs scaffold validator.

Repository: <https://github.com/dotdotgod/dotdotgod>

## Published Packages

- [`@dotdotgod/pi`](packages/pi/README.md): Pi package with project initializer skill, plan mode, and project loading extensions.
- [`@dotdotgod/docs-validator`](packages/docs-validator/README.md): zero-dependency docs scaffold validator and `dd-docs-validate` CLI.
- [`@dotdotgod/claude-code`](packages/claude-code/README.md): Claude Code plugin resources with `dd:*` commands and project memory skills.
- [`@dotdotgod/codex`](packages/codex/README.md): Codex plugin resources with project memory skills.

Current first public package version: `0.1.0`.

## Install

Pi adapter:

```bash
pi install npm:@dotdotgod/pi
```

Docs validator:

```bash
npx @dotdotgod/docs-validator .
```

## Local Development

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
