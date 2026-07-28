# Hook Guidance Tests

These checks cover optional Claude Code and Codex hook documentation. Hooks are opt-in examples, so current coverage is documentation and package-resource smoke testing. Runtime hook execution is outside this coverage.

## Automated Checks

- `pnpm --filter @dotdotgod/cli test` parses hook README JSON examples, checks Codex TOML example shape, enforces hook safety policy constraints, and confirms Claude Code/Codex package dry-runs include `hooks/README.md`.
- `pnpm --filter @dotdotgod/claude-code run verify` confirms `packages/claude-code/hooks/README.md` is a required adapter resource.
- `pnpm --filter @dotdotgod/codex run verify` confirms `packages/codex/hooks/README.md` is a required adapter resource.
- `pnpm run verify:generated` confirms generated commands and skills did not drift when hook docs are updated manually, including `/dd:impact` and `impact-review` resources generated from `packages/shared/workflows/impact.md`.
- `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index` confirms hook-related docs, links, traceability, and markdown index freshness stay valid after indexing.

## Manual Smoke Checks

For Claude Code hook examples:

- confirm examples are documented as optional and not auto-enabled by the plugin package
- confirm examples use Claude settings-style `hooks` JSON
- confirm advisory examples use fast commands and avoid full workspace verification
- confirm `UserPromptSubmit` examples do not rely on matcher filtering and inspect the submitted `prompt` field when they need prompt-specific behavior
- confirm prompt reminder examples stay advisory and non-mutating, mention `dotdotgod expand` only for explicit `[[...]]` project-memory refs, collect the complete target set into one repeated-`--changed` multi-seed command for up to 20 unique paths, split only larger sets, and point post-edit review to `/dd:impact`
- confirm validation examples use `dotdotgod validate . --include-local-memory --check-index`
- confirm current lifecycle notes distinguish success `Stop` hooks from API-error `StopFailure` hooks and optional `SessionEnd` cleanup
- confirm `PostToolBatch` is described as batch-level guidance, not as a default validation hook
- confirm SDLC framing maps plan, implement, impact-review, verify, review, and archive without enabling automatic archive moves
- confirm examples prefer command exec form with `args` when referencing project-local hook scripts
- confirm docs do not present unavailable plan-mode transition hooks such as `PrePlanMode`, `PostPlanMode`, plan accept, or plan reject as available
- confirm strict plan-safety examples require a local tested mode signal before blocking writes
- confirm docs state that the package intentionally does not ship default Claude Code hook config unless a future release adds a safe advisory default

For Codex hook examples:

- confirm examples are documented as optional trusted configuration-layer hooks
- confirm examples include `hooks.json` and inline `config.toml` shapes
- confirm prompt reminder examples stay advisory and non-mutating, mention `dotdotgod expand` only for explicit `[[...]]` project-memory refs, collect the complete target set into one repeated-`--changed` multi-seed command for up to 20 unique paths, split only larger sets, and point post-edit review to `dd:impact`
- confirm validation examples use `dotdotgod validate . --include-local-memory --check-index`
- confirm docs tell users to open `/hooks` and approve trusted hooks when Codex reports that a hook needs review
- confirm docs do not imply Codex has Claude/Pi slash-command parity
- confirm strict plan-safety docs note Codex tool-interception limitations
- confirm docs state that plugin-bundled Codex hooks require `plugin_hooks` and trust review before running

For both adapters:

- `dotdotgod status` may be shown as read-only cache reporting, but Codex Stop examples must not return raw status JSON as hook output
- `dotdotgod validate . --include-local-memory --check-index` may be shown as explicit opt-in validation and index-freshness checking
- `dotdotgod query` and `dotdotgod graph` must be labeled cache-aware because they can refresh `.dotdotgod/` caches
- `/dd:impact`, `dd:impact`, and `impact-review` should be documented as the default cross-agent counterpart to Pi's `/impact-check` reminders
- `dotdotgod index`, `pnpm run verify:cache`, full `pnpm run verify`, and archive moves must not be default automatic hook actions
