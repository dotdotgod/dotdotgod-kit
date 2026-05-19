# Initializer And Publishing Smoke Tests

## Initializer Parity

```bash
node packages/cli/bin/dotdotgod.mjs init <fixture-root> --dry-run --project-name fixture-name
sh packages/pi/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/claude-code/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/codex/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
```

Confirm each initializer path reports `docs/plan`, `docs/archive`, and `.dotdotgod` `.gitignore` entries. With `--dotdot-setting`, confirm `docs/arch/DOCS_STRUCTURE.md`, `docs/arch/CODE_CONVENTIONS.md`, and their `AGENTS.md` references are generated. Also confirm adapter guidance does not stop when `dotdotgod` is absent; it should use the bundled shell fallback and still create README indexes needed for manual project-memory loading.

## Published Pi Adapter Install

```bash
pi install npm:@dotdotgod/pi
pi uninstall npm:@dotdotgod/pi
```

The first public `0.1.0` publish confirmed install and uninstall worked.

## README Landing Review

Root and package READMEs should lead with dotdotgod value and avoid implying Pi-style runtime enforcement for Claude Code or Codex adapters.
