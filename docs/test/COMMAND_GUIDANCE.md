# Command Guidance

## Scope

Verify environment-aware `dotdotgod query` guidance and Pi documentation-map prompt formatting.

## Cases

- dotdotgod workspace source returns `commandGuidance.source: "local-source"` and local commands such as `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory`.
- A project that declares `@dotdotgod/cli` returns `source: "project-install"` and `npx dotdotgod` commands.
- A project without the CLI returns `source: "missing-install"`, `install: "npm install -D @dotdotgod/cli"`, and `npx dotdotgod` commands.
- Package manager detection prefers `package.json.packageManager`, then lockfiles, then `npm`.
- Pi full and compact Load expose `Help: dotdotgod --help` without `CLI status:` output or an installation probe solely for Help guidance.
- Claude Code generated Load command/skill and the Codex generated Load skill expose the same Help route.
- Load keeps documentation-map and README fallback usable when CLI query or shell execution is unavailable; the Help hint is not a mandatory execution step.

## Verification Commands

```bash
pnpm --filter @dotdotgod/cli test
pnpm --filter @dotdotgod/pi test
node packages/cli/bin/dotdotgod.mjs query . "project documentation" --limit 5 --json
```
