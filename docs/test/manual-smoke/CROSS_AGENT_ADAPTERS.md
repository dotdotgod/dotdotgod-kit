# Cross-Agent Adapter Smoke Tests

## Pi Adapter Dependency Resources

Real-SDK tests verify the plan and project-memory extensions load without providing a subagent tool. `packages/pi/test/mcp-envelope.test.ts` covers envelope guards, structured-result precedence, primitive/array fallback, cycles, and error propagation.

`@dotdotgod/pi` installs `@dotdotgod/cli` and `@dotdotgod/context` as runtime dependencies. In a packaged-install smoke, confirm Pi loads `/dd:load` and `/impact-check` without separate global installs. Subagent extensions are independently installed and not managed by this adapter.

## Antigravity Adapter (CLI And App)

Run sequentially in isolated workspaces (`/tmp/ddg-agy-init` with `dotdotgod.config.json` and `/tmp/ddg-agy-uninit` without `dotdotgod.config.json`/`.dotdotgod/`) after recording `$HOME/.dotdotgod` before and after:

```bash
agy plugin validate --strict packages/antigravity
agy plugin install packages/antigravity
```

1. **Manifest, logo & rules**: confirm `agy plugin validate --strict` exits `0` (0 errors, 0 warnings); verify `/mcp` lists `dotdotgod_context` (19 tools), `/hooks` lists `PostToolUse` + `PreInvocation` only, `/dd-*` lists `dd-init`, `dd-load`, and `dd-impact` (no `doc-first-planning`), and Antigravity App renders pastel yellow-green `assets/logo.svg` and `rules/AGENTS.md`.
2. **Uninitialized isolation**: edit a file in `/tmp/ddg-agy-uninit`; confirm `.dotdotgod/` is NOT created and `$HOME/.dotdotgod` is unchanged.
3. **MCP `roots/list` & `sessionBound`**: in `/tmp/ddg-agy-init`, call `doctor` and `impact_status`; confirm workspace resolves via MCP `roots/list` (despite startup `cwd === ${PLUGIN_ROOT}`), `impact_status` returns `sessionBound: false` with single-line `guidance` (`<= 120` chars), and `impact.sqlite` is not created.
4. **Non-blocking advisory impact**: edit `src/app.ts`; confirm 1-time `PreInvocation` `[DOTDOTGOD IMPACT PENDING — ADVISORY]` injection, run test/commit commands unblocked, confirm the next turn does not repeat the advisory, run a failing `call_mcp_tool(dotdotgod_context, project_impact)` (`isError: true`) to confirm pending retention, then run a valid `project_impact` to confirm pending clearance.
5. **Option C-2 `/plan`**: run `/plan` writing `<artifactDirectoryPath>/implementation_plan.md`; confirm 1-time `PreInvocation` `[DOTDOTGOD PLAN SYNC — ADVISORY]`, zero hook workspace writes, intact host **Proceed** gate, no `$HOME` path in `plan_notices`, and clearance after writing `<docRoot>/plan/<slug>/README.md` via native write tools.
6. **Cleanup**: run `agy plugin uninstall dotdotgod` and delete `/tmp/ddg-agy-*`.

## Claude Code Adapter

Build, pack, and extract the tarball under a clean temporary parent outside the checkout with an isolated home/profile and no separately installed `@dotdotgod/context` or `@dotdotgod/cli`, then run:

```bash
claude --plugin-dir /tmp/dotdotgod-claude-code/package
```

Confirm `SessionStart`, `UserPromptSubmit`, and `PostToolUse` load without `ERR_MODULE_NOT_FOUND` and `PreToolUse` is absent from `hooks.json`. Confirm `dotdotgod-context` exposes all 19 tools and focused `project_load` degrades optional embeddings cleanly. Pre-seed `.dotdotgod/context/runtime/legacy.json` (`{"loadRequired":true,"pending":{"src/a.ts":true}}`) and confirm it is completely ignored and untouched.

Edit a tracked file: confirm `PostToolUse` emits a single `0 -> >0` advisory, `UserPromptSubmit` emits per-turn reminders, and Bash/Edit/Write/test/commit commands are never denied. Confirm an unrelated MCP tool leaves `impact.sqlite` unchanged, a failed `project_impact` retains pending rows, and a succeeded `project_impact` clears them. Verify `/dd:load`, `/dd:plan`, `/dd:init`, and `/dd:impact` match shared contracts (including `Help: dotdotgod --help`, depth-bounded `map`, up to 20 repeated `--changed` paths, and bundled `scripts/init_project.sh` + `templates/dotdotgod.config.json`).

## Codex Adapter

Pack and extract Codex under the same clean-cache constraints, enable `[features].hooks = true`, and approve plugin hooks via `/hooks`. Confirm `SessionStart`, `UserPromptSubmit`, and `PostToolUse` (no `PreToolUse`) load without module-resolution errors and `dotdotgod-context` exposes all 19 tools. Pre-seed legacy `.dotdotgod/context/runtime/legacy.json` and confirm it is ignored.

Apply a multi-file `apply_patch`: confirm `PostToolUse` tracks all changed paths in `impact.sqlite` and emits a `0 -> >0` advisory, `UserPromptSubmit` emits the structured JSON `additionalContext` advisory, commands are never denied, failed `project_impact` retains pending rows, and succeeded `project_impact` clears them. Confirm `project-load`, `doc-first-planning`, `project-initializer`, and `impact-review` skills and `dd:{load,plan,init,impact}` triggers work and `document-clarify` stays separate.

After updating any installed adapter, restart the host so it picks up the newly installed artifact instead of a stale content-hash cache.

## Hermes Adapter

Run the isolated pinned-host smoke (`packages/hermes/test/pinned_host_smoke.py` against pinned commit `19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9`) plus a non-Git repository smoke: confirm `post_tool_call` tracks edits in `impact.sqlite`, `pre_llm_call` emits `[DOTDOTGOD IMPACT PENDING — ADVISORY]`, `pre_tool_call` never blocks (`terminal` `git push` allowed), `project_impact` clears pending rows, re-edits reopen them, and non-Git workspaces fail open. See [`../HERMES_ADAPTER.md`](../HERMES_ADAPTER.md).

## Pi Context Tools And Load Guidance

Confirm Pi starts the host-managed `dotdotgod_context` stdio MCP child (19 unprefixed tools, no forwarding aliases), Code Mode envelopes work, pending impact stays advisory while Plan Mode restrictions remain, and shutdown reaps the child. Confirm `/load`, `/dd:load`, and automatic load expose `Help: dotdotgod --help`, omit `CLI status:`, and never register `/dd:load:compact`.

## Cross-Agent Planning And Clarification Parity

- Claude Code `/dd:plan`, Codex `doc-first-planning`, and Pi `/dd:plan` share executable `dotdotgod query` and conditional `dotdotgod config` guidance; Antigravity relies on built-in `/plan` with Option C-2 artifact observation (no separate planning skill and zero hook workspace writes).
- All six adapters align on non-blocking advisory impact review (`/impact-check`, `/dd:impact`, `dd:impact`, `/dd-impact`, `/impact-review`).
- Standalone `document-clarify` (`@dotdotgod/skills`) stays absent from all six adapter packages (`packages/cli/test/document-clarify.test.mjs`). Follow [`../SKILL_INSTALLATION.md`](../SKILL_INSTALLATION.md).
- `pnpm run verify:generated` confirms generated resources match shared workflow sources across all adapters.
