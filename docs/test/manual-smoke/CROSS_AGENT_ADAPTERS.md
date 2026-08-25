# Cross-Agent Adapter Smoke Tests

## Pi Adapter Dependency Resources

`@dotdotgod/pi` should install `@dotdotgod/cli` and `pi-subagents` as runtime dependencies. In a packaged-install smoke, confirm Pi can load `/dd:load`, `/impact-check`, and `subagent` without separate global installs of those packages. If `pi-subagents` is installed both standalone and through `@dotdotgod/pi`, confirm the dotdotgod wrapper waits until session startup and skips duplicate `subagent` tool, skill, and prompt resources instead of failing startup or logging resource conflicts.

## Claude Code Adapter

Build and pack the adapter, extract the tarball under a clean temporary parent outside the checkout, and run with an isolated home/profile that has no separately installed `@dotdotgod/context` or `@dotdotgod/cli`. Then load it with the current local plugin flow, for example:

```bash
claude --plugin-dir /tmp/dotdotgod-claude-code/package
```

Confirm `SessionStart` and `PreToolUse` do not emit `package_json_reader` or `ERR_MODULE_NOT_FOUND`. Confirm the packaged `dotdotgod-context` stdio MCP server starts and exposes the complete context, project-workflow, session, ingestion-job, healing, and doctor tool surface. Run a non-empty-focus `dotdotgod_project_load` from a project directory different from the plugin path: it must return the documentation map, and unavailable optional embeddings must appear only as bounded `queryUnavailable` evidence. Confirm a rejected Load leaves Bash/Edit/Write denied.

Then verify host dispatch with the installed plugin, not by invoking `runtime.mjs posttooluse` directly: start a fresh session, observe the initial Bash/Edit/Write denial, let Claude call the plugin-qualified `dotdotgod_project_load`, confirm its successful PostToolUse hook runs, and retry Bash/Edit/Write. The retry must succeed without ending the session. To check unrelated MCP isolation, first complete a Write, confirm a broad verification command is denied by pending impact state, call an unrelated MCP tool, and confirm the same command remains denied. Verify small output returns directly and a large output returns an index handle without the full raw bytes.

Confirm these commands are discoverable or invokable:

```text
/dd:load
/dd:plan
/dd:init
/dd:impact
```

For `/dd:init`, generated guidance should preserve existing files, use the CLI or bundled fallback, and create the same complete default project config. Confirm the packaged initializer contains both `scripts/init_project.sh` and `templates/dotdotgod.config.json`.

For `/dd:load`, generated command and skill guidance should expose `Help: dotdotgod --help` without installation status or mandatory Help execution, run `dotdotgod config <root> --json` to apply resolved documentation exclusions, render the shared Markdown tree through depth 5 without arguments, use `dotdotgod query` for up to 30 focused results plus a depth-3 map with arguments, keep `docs/archive/README.md` as the separate history map, and fall back to README-index reads when CLI execution is unavailable.

For `/dd:impact`, generated guidance should identify changed source/config/docs files, run one repeated-`--changed` multi-seed `dotdotgod graph impact` command for up to 20 unique paths (and ordered batches only above that bound), inspect the combined ranking and per-seed results selectively, and choose focused verification before handoff.

## Codex Adapter

Install or add `/path/to/dotdotgod/packages/codex` with the current local plugin workflow.

Pack and extract Codex under the same clean-cache constraints. After Codex plugin hook trust/review, confirm hooks load without module-resolution diagnostics and the packaged `dotdotgod-context` server exposes the same complete tool surface as Claude Code. Repeat the focused Load degradation and failed/successful gate-lifecycle checks used for Claude Code. Verify a direct write creates impact-pending state, a broad verification command is denied with exact MCP guidance, successful impact clears matching fingerprints, and the original command can be retried. Confirm `project-load`, `doc-first-planning`, `project-initializer`, `impact-review`, and `document-clarify` skills are discoverable. Trigger phrases `dd:load`, `dd:plan`, `dd:init`, and `dd:impact` should activate the expected workflows. For `dd:init`, verify the same config template and preservation behavior as Claude Code. For `dd:load`, expose the same `Help: dotdotgod --help` hint without installation status or mandatory execution, and use the same depth-bounded documentation-map, focused-query, archive-exclusion, and unavailable-CLI/shell fallback expectations as Claude Code. For `dd:impact`, use the same bounded multi-seed changed-file graph-impact and focused-verification expectations as Claude Code.

After updating either installed adapter, restart the host and confirm it references the newly installed or registered artifact. Do not assume an existing content-hash plugin cache is rewritten by source changes; reinstall or re-register through the host's supported flow when the active artifact remains stale.

## Pi Context Tools

Confirm Pi registers native `dotdotgod_execute`, `dotdotgod_batch_execute`, `dotdotgod_execute_file`, context index/search/fetch/stats/purge, and `dotdotgod_project_initialize` tools from the adapter. Confirm no dotdotgod stdio MCP child process starts. Verify large output uses `.dotdotgod/context/` and existing pending-only project load plus graph-impact reminder behavior remains unchanged.

## Pi Load Guidance

Confirm `/load`, `/dd:load`, and the mode-neutral automatic load expose exactly `Help: dotdotgod --help`, omit `CLI status:`, and continue through the documentation map when Help or query execution is unavailable. Confirm `/dd:load:compact` is not registered.

## Cross-Agent Planning Parity

- Claude Code `/dd:plan` and both generated `doc-first-planning` skills provide an executable `dotdotgod query` command, conditional `dotdotgod config` guidance, and the written plan file as the durable review artifact without referencing saved-plan preview UI.
- Claude Code `/dd:impact` and Codex `impact-review` provide the cross-agent counterpart to Pi's `/impact-check` reminders without claiming Pi's runtime pending-impact state.
- Pi `document-clarify` requires resolved `config.areas` in active context; Claude Code and Codex tell agents to run `dotdotgod config <root> --json` and provide a CLI-unavailable fallback.
- `pnpm run verify:generated` confirms generated resources match shared workflow sources and platform-specific rendering.
