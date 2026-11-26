# Native Plan Integration

## Claude Code

Claude Code exposes a supported `plansDirectory` setting, so initialization merges only that opt-in project key. Plugin defaults cannot apply it. No Mods module, native filename rewrite, or permission hook is necessary.

## Codex

Codex separates collaboration instructions from filesystem enforcement. Its 0.163.0 catalog supports `model_messages.collaboration_modes.plan`; its Beta permission profiles allow a read-only baseline with one writable subtree. The opt-in setup changes both together, preserving the full supplied catalog and avoiding an always-on writable workspace. Catalog replacement is pinned to the tested host version because upstream prompt and metadata contracts vary.

The native template and Apache-2.0 attribution are retained in the adapter. The source patch changes mutation guidance and appends durable-plan rules; questions, proposed-plan rendering, and explicit mode switching remain native. Conflicting permission choices require manual integration so user denies cannot silently disappear. Managed constraints remain enforced by Codex itself.

Configuration profile selection is explicit and session-wide. Ending native planning does not expand permissions. The setup is not a new execution agent and does not replace host lifecycle, MCP, or hooks. Hook internal state and MCP execution remain separate boundaries; native writes are used for acceptance.

## Antigravity (Option C-2)

Antigravity owns its native `/plan` mode, `<artifactDirectoryPath>/implementation_plan.md`, inline comments, and **Proceed** confirmation UI. The CLI-installed Antigravity adapter integrates via Option C-2 without replacing host UI or bypassing host write permissions:

1. **Artifact write observation (`PostToolUse`)**: `packages/cli/src/context/hooks-antigravity.mjs` matches successful write/edit tool calls (`write_file`, `edit_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`) whose resolved target equals `<realpath(artifactDirectoryPath)>/implementation_plan.md`. Reads, other artifacts (`task.md`, `walkthrough.md`, `scratch/**`), sibling directories (`<artifactDirectoryPath>-evil/`), and workspace files are ignored.
2. **Bounded safe read (`readArtifactBounded`)**: `packages/cli/src/context/hook-state.mjs` opens the artifact with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`, confirms `fstatSync().isFile()` and matching `dev`/`ino`, reads at most `2 MiB` (`2 MiB + 1` rejects), and hashes the contents with SHA-256. Symlinks, directories, FIFOs, and oversized files fail open and are ignored.
3. **Privacy-safe notice recording (`plan_notices`)**: `ImpactState.recordPlanNotice(fingerprint)` stores `(session, fingerprint, notified, created_at, expires_at)` in `.dotdotgod/context/impact.sqlite` (24-hour fixed TTL). No `$HOME` or artifact filesystem path is persisted. Re-saving unchanged content keeps `notified = 1`; changed content resets `notified = 0`. Hooks never write workspace files.
4. **One-time save advisory (`PreInvocation`)**: `ImpactState.claimPlanNotice()` atomically flips `notified: 0 -> 1` and injects a single `[DOTDOTGOD PLAN SYNC — ADVISORY]` step asking the agent to save `<docRoot>/plan/<task-slug>/README.md` and update `<docRoot>/plan/README.md` using native file write tools only when workspace writes are permitted (keeping the native artifact if restricted or denied).
5. **Clearance**: an observed workspace write/edit under `<docRoot>/plan/**/*.md` calls `ImpactState.clearPlanNotice()`. Moving completed plans to `docs/archive/plan/<task-slug>/` remains an explicit manual step.

## Official References

- https://code.claude.com/docs/en/settings-reference#plansdirectory
- https://developers.openai.com/codex/permissions
- https://github.com/openai/codex/tree/rust-v0.163.0
