# Hook Guidance Tests

These checks cover optional Claude Code and Codex hook documentation. Hooks are opt-in examples, so current coverage is documentation and package-resource smoke testing rather than runtime hook execution.

## Automated Checks

- `pnpm --filter @dotdotgod/claude-code run verify` confirms `packages/claude-code/hooks/README.md` is packaged as a required adapter resource.
- `pnpm --filter @dotdotgod/codex run verify` confirms `packages/codex/hooks/README.md` is packaged as a required adapter resource.
- `pnpm run verify:generated` confirms generated commands and skills did not drift when hook docs are updated manually.
- `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory` confirms hook-related docs, links, and traceability stay valid.

## Manual Smoke Checks

For Claude Code hook examples:

- confirm examples are documented as optional and not auto-enabled by the plugin package
- confirm examples use Claude settings-style `hooks` JSON
- confirm advisory examples use fast commands and avoid full workspace verification
- confirm strict plan-safety examples require a local tested mode signal before blocking writes

For Codex hook examples:

- confirm examples are documented as optional trusted configuration-layer hooks
- confirm examples include `hooks.json` and inline `config.toml` shapes
- confirm docs do not imply Codex has Claude/Pi slash-command parity
- confirm strict plan-safety docs note Codex tool-interception limitations

For both adapters:

- `dotdotgod status` may be shown as read-only cache reporting, but Codex Stop examples must not return raw status JSON as hook output
- `dotdotgod validate` may be shown as explicit opt-in validation
- `dotdotgod load-snapshot` and `dotdotgod graph` must be labeled cache-aware because they can lazily refresh `.dotdotgod/`
- `dotdotgod index`, `pnpm run verify:cache`, full `pnpm run verify`, and archive moves must not be default automatic hook actions
