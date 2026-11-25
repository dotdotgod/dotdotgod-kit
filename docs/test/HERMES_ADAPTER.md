# Hermes Adapter Verification

Hermes uses **Path 1 non-blocking advisory impact** (confirmed on pinned host `19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9` supporting `post_tool_call`): edits observed via `post_tool_call` (`write_file` and `patch`) are persisted to `.dotdotgod/context/impact.sqlite` via `packages/hermes/impact.py` (Python `sqlite3` WAL / `BEGIN IMMEDIATE` / ms TTL cross-interoperable with Node `ImpactState`), `before_llm` injects non-blocking `[DOTDOTGOD IMPACT PENDING — ADVISORY]` reminders, and all blocking gates are removed.

## Automated Workspace Gate

```bash
pnpm --filter @dotdotgod/hermes run verify
pnpm --filter @dotdotgod/hermes run pack:dry-run
```

The package verify command checks generated runtime drift, Python stdlib lifecycle/impact/transport tests, and Node resource checks. Python 3.11+ is required; no Python MCP dependency is needed by the plugin.

- `test_runtime.py` (`HM-01`..`HM-03a` plus routing/session suites):
  - `HM-01`: verifies all three legacy blocking sites are removed (`execute`/`execute_file` never raises `PermissionError` for pending impact, `before_tool` never returns `"block"`, and `before_tool` exceptions fail open returning `None`); verifies `before_llm` emits non-blocking advisory reminders.
  - `HM-02`: verifies `resolve_documentation_root` (`knowledge/plan` and `knowledge/archive` excluded, `knowledge/post` preserved; invalid/malicious config falls back to `'docs'`) and aligned `impact_status` schema `{ok, count, pending: [{path}], truncated}`.
  - `HM-03a` (Path 1): verifies Python↔Node `impact.sqlite` WAL + ms-TTL cross-interop, `Proxy` principal key isolation with fixed `contextSessionId`, SQL `?`-binding with metacharacter paths, `contained()` rejection of `../`/sibling/external symlinks, `before_llm` display-path escaping, and raw exception `$HOME` masking.
  - Routing/lifecycle regressions: unrestricted labels/absolute project paths, concurrent repositories, same-root session isolation, explicit resume/reconnect, load opt-out, unselected-session isolation, nested `task_id` hooks, failed/subset impact, re-edit reopening, and non-Git fail-open behavior.
- `resources.test.mjs`: verifies 19 shared MCP tools plus `select_root` (20 registered tools), 3 generated skills (`impact-review`, `project-initializer`, `project-load`), `post_tool_call` declared in `plugin.yaml`, `impact.py` listed in `package.json#files`, absence of impact-blocking gates in `policy.py` and `runtime.py`, self-contained MCP artifacts, absent profile-wide `mcp.json`, and no planning resources.
- Shared `packages/context` tests retain execution limits, source-filtered search, fetch safeguards, provenance, destructive confirmation, job restart, and recovery coverage.

## Isolated Pinned Host Smoke

Pin Hermes commit `19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9` in a disposable checkout with an isolated Python venv (`ruamel.yaml`, `python-dotenv`, `rich`, `packaging`). Pack and extract `@dotdotgod/hermes` outside workspace ancestry, then run:

```bash
<host-venv>/bin/python packages/hermes/test/pinned_host_smoke.py \
  <pinned-hermes-checkout> <extracted-package-directory>
```

`pinned_host_smoke.py` creates an isolated `HERMES_HOME`, loads the installed native plugin via `PluginManager`, and exercises the real hook dispatcher and durable plugin state. It checks CLI and Telegram-shaped gateway events, concurrent repository/session ownership, resume isolation, child root inheritance, `post_tool_call` edit tracking, `pre_llm_call` `[DOTDOTGOD IMPACT PENDING — ADVISORY]` reminders, non-blocking `pre_tool_call` (`terminal` `git push` not blocked), `project_impact` clearance, and re-edit reopening without blocking.

This verifies installed-loader/hook integration, not full CLI conversations, model inference, `delegate_task` execution, or live Telegram/Discord messaging.

## Live Messaging And Model Acceptance

With an authorized test profile and user-provided credentials:

1. Enable the native plugin; verify registered skills and native tool availability.
2. CLI: dry-run initialization, explicitly confirm writes, load once, focused load, `dd:no-load`, explicit/fuzzy references, and standalone document clarification.
3. Gateway: optionally configure root labels; select any existing absolute directory or label without gateway grants. Confirm ordinary tools work before selection while context tools require a routing root, and verify two concurrent chats isolate roots and sessions.
4. Confirm separate context session IDs; resume one without affecting the other.
5. Edit a disposable file; verify `before_llm` emits the non-blocking `[DOTDOTGOD IMPACT PENDING — ADVISORY]` reminder while test/commit commands remain unblocked. Check impact for a subset, then the remainder; confirm clearance and subsequent re-edit reopening. Confirm failed checks retain pending state. Do not perform real publication.
6. Delegate a scoped task using native `delegate_task`; confirm child root inheritance, separate context connection, and missing-parent handling.
7. Interrupt a long `execute` call, cancel ingestion, reconnect, and restore a session without replaying uncertain writes.
8. Test missing Node/CLI/embedding runtime, non-Git repositories (fail-open), ignored legacy grants, and explicit confirmation gates for mutating/repair operations.
9. Verify unknown shell/patch/plugin paths and host timeout behavior remain documented as limitations, not a bypass-proof sandbox.

External messaging and model-driven acceptance require credentials and are not claimed by offline smoke checks. Desktop and remote/container path translation remain outside the supported scope.
