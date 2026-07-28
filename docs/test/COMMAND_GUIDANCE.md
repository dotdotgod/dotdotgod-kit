# Command Guidance

## Scope

Verify environment-aware `dotdotgod query` guidance and Pi documentation-map prompt formatting.

## Cases

- dotdotgod workspace source returns `commandGuidance.source: "local-source"` and local commands such as `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory`.
- A project that declares `@dotdotgod/cli` returns `source: "project-install"` and `npx dotdotgod` commands.
- A project without the CLI returns `source: "missing-install"`, `install: "npm install -D @dotdotgod/cli"`, and `npx dotdotgod` commands.
- Package manager detection prefers `package.json.packageManager`, then lockfiles, then `npm`.
- Pi `/dd:load` renders snapshot-provided command guidance when available and keeps the lightweight fallback usable when unavailable.

## Verification Commands

```bash
pnpm --filter @dotdotgod/cli test
pnpm --filter @dotdotgod/pi test
node packages/cli/bin/dotdotgod.mjs query . "project documentation" --limit 5 --json
```
