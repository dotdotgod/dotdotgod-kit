# Release 0.6.6

## Scope

Patch release with compatibility changes: host-managed Pi MCP, shared advisory
impact for Pi/OpenCode, OpenCode V2 adapter, unprefixed tool names, fixed 24-hour
context retention, explicit embedding opt-in, TS/TSX import-type parsing, and
opt-in Claude/Codex native project-plan storage. Hermes retains its existing
no-Plan-Mode and impact-gate behavior.

## Upgrade Notes

- Reload/restart agent sessions to discover the new MCP catalog. Individual
  names have no `dotdotgod_` prefix. Use `project_load`, `project_impact`,
  `project_initialize`, `impact_status`, `embedding_status`, `embedding_install`.
  Hosts still qualify names with a server namespace; inspect the actual catalog.
  Removed names are not aliases. Pi's lifecycle-owned automatic Load remains
  `project_memory_load`; use MCP for generic execution/retrieval.
- MCP returns envelopes: inspect `isError` and `structuredContent`, then each
  execution result's `ok`, `code`, `timedOut`, `aborted`, capture limit and source ID.
- Pending impact does not block Pi/OpenCode tools. It is not a complete change
  audit: shell/external edits may need explicit paths. Existing Claude/Codex and
  Hermes lifecycle gates remain; local plan Markdown does not create source gates.
- Context SQLite sources/chunks, ingestion input/result/error/status and pending
  impact expire 24 hours after storage. Reads/restarts do not renew them. Legacy
  dated rows use original creation time; undated impact gets one migration day.
  Removed `ttlMs` is rejected. Expiry is not review approval or secure erasure.
  Original files, CLI caches, JSON hooks, schema metadata and backups are excluded.
- Without explicit project/global `embedding`, query/Load use keywords and
  impact skips vectors. No model is downloaded automatically. Vector-only requests
  require configuration. A remote profile authorizes documentation and code
  metadata/comments, queries and changed-file profiles; `--allow-code-embedding`
  is removed. Implementation bodies are not embedding passages.
- Reindex consumer projects after upgrading the TS/TSX parser. Import types parse
  normally; actual syntax errors remain partial. Cache identity invalidates old
  outlines. The original consumer's nineteen files still require direct acceptance;
  equivalent nineteen-file fixtures and extracted parser assets are covered.

## Native Planning

- Claude Code: `dotdotgod init . --claude-plans --dry-run`, then opt into writes.
  Adds project `plansDirectory`, preserves existing values and permissions. Native
  filenames are host-owned; this does not force task README naming. No Mods.
- Codex: explicit `scripts/setup-plan.mjs` dry-run/confirmation creates a named
  launch profile and copied full catalog for exactly 0.163.0. `docs/plan` is writable;
  other project files are read-only. Native plan guidance auto-saves task READMEs.
  Existing conflicting permissions/custom plan instructions require manual
  integration. Enter `/plan` after launch; leaving it does not expand permissions.
  MCP/hooks are separate execution boundaries, not confined by this native policy.

## Verification And Publication Gate

Use the final release commit's `pnpm run verify`, `pnpm run pack:dry-run`,
traceability, index and documentation validation. Pack the seven public packages
and inspect the exact tarballs before publishing. Publish dependency-first:
CLI, context, Pi, Claude Code, Codex, Hermes, OpenCode. Root/shared are private.

Host acceptance uses isolated HOME and loopback scripted responses, not paid
models: Claude Code 2.1.308 native storage, Codex 0.163.0 native patch and sandbox
scope/restart/resume, and OpenCode 2.1.2 native plan/MCP/advisory integration.
This proves tested host integration, not live-model plan quality or all platforms.

Pre-publication handoff stops before remote push, Git tags, npm publish or dist-tag
changes. Registry version availability is time-sensitive and must be rechecked.
After separate publication approval, publish verified tarballs under `next`, run
registry-install smoke, promote `latest`, then tag the approved release commit.
