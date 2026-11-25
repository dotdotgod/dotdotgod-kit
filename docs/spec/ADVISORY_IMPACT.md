# Advisory Impact State

All six adapters (Pi, OpenCode, Claude Code, Codex, Hermes, and Antigravity)
share non-blocking advisory impact state in `.dotdotgod/context/impact.sqlite`
(schema v2), keyed by validated host session and canonical project-relative
path. Legacy `.dotdotgod/context/runtime/*.json` files are ignored and neither
read nor migrated.

## Scope And Path Attribution

Only observed successful file edits inside an initialized project are tracked.
Paths outside canonical `realpath(root)`, dependency/cache/build directories
(`node_modules`, `.git`, `.dotdotgod`, `dist`, `build`, `coverage`), and
`<docRoot>/(plan|archive)` are excluded; `<docRoot>/post` remains tracked.
`docRoot` is resolved from `dotdotgod.config.json` `documentation.root` when
safe (non-symlink regular file `<= 256 KiB`, relative path without `.`-prefixed
segments, globs, control/bidi characters, or symlink escape), defaulting to
`docs`.

Hook entrypoints validate `sessionId` / `conversationId` strictly against
`validateSessionId` and fail open (`null` / no-op `{}`) when missing or
invalid; there is no `'default'` fallback or hash substitution.

## Schema v2 And Delivery Cadence

`impact.sqlite` v2 maintains two tables under the fixed 24-hour non-sliding
retention policy (see `CONTEXT_RETENTION.md`):

- `pending(session, path, revision, fingerprint, created_at, expires_at, notified)`:
  records observed edits (`notified = 0` on mark/re-edit).
- `plan_notices(session, fingerprint, notified, created_at, expires_at)`: tracks
  Antigravity native `/plan` artifact hashes for one-time save advisories
  without storing `$HOME` paths.

Pending state is strictly advisory across all six adapters and NEVER blocks
edits, tests, builds, lint, commits, pushes, publishes, or other tools. Host
permissions and planning restrictions remain independent.

- Pi, OpenCode, Claude Code, Codex, and Hermes emit ephemeral per-turn
  `impactReminder` advisories while `count > 0` (Claude Code and Codex
  `PostToolUse` also emit one transition notice when pending moves `0 -> >0`).
- Antigravity `PreInvocation` claims unnotified rows once via atomic
  `claimUnnotified` (`notified: 0 -> 1`) because Antigravity persists
  `injectSteps` in trajectory.
- Display paths are sanitized (post-JSON `\uXXXX` escaping for C1/line-separator/bidi
  controls, 200-char cap, max 8 shown) and framed as untrusted data.

## Review Clearance And Unbound MCP

- Session-bound MCP adapters (Pi, OpenCode, Hermes): `project_impact` receives
  the session identity (`DOTDOTGOD_SESSION_ID`, `contextSessionId`, or
  `session_resume`) and uses optimistic CAS (`withImpactReview`) to clear only
  successfully reviewed, unchanged revisions. Failed, cancelled, or concurrently
  re-edited paths remain pending. `impact_status` reports `{ ok, count, pending,
  truncated, sessionBound: true }` without running a review.
- Hook-cleared adapters (Claude Code, Codex, Antigravity): successful
  `PostToolUse` for allowlisted `dotdotgod_context` `project_impact` clears
  requested paths via `clearPaths`; failed tool results retain pending state.
- Unbound stdio MCP calls (`sessionBound: false`): `impact_status` and
  `project_impact.impactStatus` return `sessionBound: false` with a single-line
  static `guidance` (`<= 120` chars, no path/session leakage) and do not open or
  create `impact.sqlite`. `guidance` is omitted when `sessionBound: true`.
- Pi registers its context MCP connection with the active session working
  directory as both `cwd` and `DOTDOTGOD_PROJECT_ROOT` so a parent executor's
  root cannot redirect another project's store.

Pending records expire after 24 hours; expiry never proves a review succeeded.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/impact-path.mjs](../../packages/context/src/impact-path.mjs)
  - [packages/context/src/impact-state.mjs](../../packages/context/src/impact-state.mjs)
  - [packages/context/src/hook-state.mjs](../../packages/context/src/hook-state.mjs)
  - [packages/context/src/hooks.mjs](../../packages/context/src/hooks.mjs)
  - [packages/context/src/hooks-antigravity.mjs](../../packages/context/src/hooks-antigravity.mjs)
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [packages/hermes/impact.py](../../packages/hermes/impact.py)
- Verified by:
  - [packages/context/test/impact-state.test.mjs](../../packages/context/test/impact-state.test.mjs)
  - [packages/context/test/hooks.test.mjs](../../packages/context/test/hooks.test.mjs)
  - [packages/context/test/hooks-antigravity.test.mjs](../../packages/context/test/hooks-antigravity.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
  - [packages/pi/test/context-root-isolation.test.ts](../../packages/pi/test/context-root-isolation.test.ts)
  - [packages/pi/test/context-execution-gates.test.ts](../../packages/pi/test/context-execution-gates.test.ts)
  - [packages/hermes/test/test_runtime.py](../../packages/hermes/test/test_runtime.py)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/CONTEXT_RETENTION.md](CONTEXT_RETENTION.md)
  - [docs/spec/ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md)
  - [docs/spec/HERMES_ADAPTER.md](HERMES_ADAPTER.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/impact-path.mjs","packages/context/src/impact-state.mjs","packages/context/src/hook-state.mjs","packages/context/src/hooks.mjs","packages/context/src/hooks-antigravity.mjs","packages/context/src/server.mjs","packages/pi/extensions/context-tools/index.ts","packages/hermes/impact.py"],"verifiedBy":["packages/context/test/impact-state.test.mjs","packages/context/test/hooks.test.mjs","packages/context/test/hooks-antigravity.test.mjs","packages/context/test/mcp.test.mjs","packages/pi/test/context-root-isolation.test.ts","packages/pi/test/context-execution-gates.test.ts","packages/hermes/test/test_runtime.py"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md","docs/spec/CONTEXT_RETENTION.md","docs/spec/ANTIGRAVITY_ADAPTER.md","docs/spec/HERMES_ADAPTER.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
