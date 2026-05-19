# Plan Mode Tool Policy

## Allowed Planning Work

While plan mode is active:

- Reading files and searching the project are allowed.
- The default active tool list is conservative; see [`../PLAN_MODE_TOOL_SETTINGS.md`](../PLAN_MODE_TOOL_SETTINGS.md) for optional extra installed tools.
- Read-only bash commands are allowed through an allowlist.
- `edit` and `write` are allowed only for markdown files under `docs/plan/` and `docs/archive/`.
- Conservative plan/archive housekeeping bash commands are allowed only when every affected path stays under `docs/plan/` or `docs/archive/`.
- Product/source/config changes outside those directories are blocked.

## Dotdotgod Commands

Bounded dotdotgod context/status commands are auto-allowed when invoked directly as `dotdotgod ...` or through `node packages/cli/bin/dotdotgod.mjs ...`:

- `status`
- `load-snapshot`
- `resolve`
- `expand`
- `graph impact`
- `graph communities`
- read-only `config`
- `index`

Other CLI commands, including `init`, `config init`, unknown commands, shell chaining, redirects, pipes, command substitution, and package-runner wrappers, require explicit one-command user approval or remain blocked.

## Pending Impact Checks

During execution and normal mode, successful source/config `edit` and `write` tool results create pending impact checks. Pi injects a hidden reminder, shows an impact status/widget, and requires `/impact-check`, `dotdotgod_graph_impact`, or successful manual `dotdotgod graph impact ... --changed <path>` before commit-like actions.

`/impact-check` checks the union of tool-tracked pending paths and current git unstaged, staged, and untracked source/config paths. A successful impact check clears the matching pending path for the checked current file, including stale pending records whose stored fingerprint no longer matches the file. Long `dotdotgod_graph_impact` tool results stay complete for the agent and render compactly in Pi's TUI until expanded. Pending checks ignore plan/archive markdown, cache, vendor, build, and coverage paths. Broad verification may ask for confirmation; commit/push/publish commands are blocked until pending paths are checked.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/pi/extensions/plan-mode/index.ts",
    "packages/pi/extensions/plan-mode/utils.ts"
  ],
  "verifiedBy": [
    "packages/pi/test/plan-mode-utils.test.ts",
    "docs/test/README.md"
  ],
  "relatedDocs": [
    "docs/spec/plan-mode/README.md",
    "docs/spec/PLAN_MODE_TOOL_SETTINGS.md",
    "docs/arch/EXTENSION_ARCHITECTURE.md",
    "docs/arch/CODE_CONVENTIONS.md",
    "docs/spec/IMPACT_RANKING_CONFIG.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/pi test",
    "pnpm --filter @dotdotgod/pi run typecheck",
    "node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml"
  ]
}
```
