# Codex Hooks

Local planning Markdown under the configured documentation plan directory does
not create source-impact pending state. The opt-in native plan profile restricts
native files/commands, not hook processes or MCP servers. Hooks never grant plan
write permissions or override the active native collaboration mode.

## Packaged Defaults

The adapter packages `hooks/hooks.json` and `hooks/runtime.mjs` with `SessionStart`, `UserPromptSubmit`, and `PostToolUse` hooks (no `PreToolUse` gate). After Codex's applicable plugin-hook enablement and trust review in initialized repositories (`dotdotgod.config.json` or `.dotdotgod/`), `SessionStart` offers optional project-memory advice, `PostToolUse` records successful `apply_patch`/`Edit`/`Write`/`MultiEdit` paths (emitting a one-time advisory notice when pending transitions from empty to non-empty) and clears requested paths on successful `project_impact` (retaining pending state if `project_impact` fails), and `UserPromptSubmit` injects a non-blocking per-turn advisory reminder while impact is pending. Pending impact never blocks edits, tests, builds, commits, or other tools, and hooks do not transform a shell tool call into an MCP call.

Advisory pending state is stored locally in `.dotdotgod/context/impact.sqlite` (24-hour fixed TTL; legacy `.dotdotgod/context/runtime/*.json` files are ignored). Hooks fail open on invalid input or missing session IDs and run local commands with user permissions, so review plugin resources before enabling them.

Current Codex docs support plugin-bundled hooks subject to the active version's enablement and trust flow. The skills remain usable when hooks are disabled.

## When To Use Hooks

- Use `dd:load` or the `project-load` skill when you intentionally want a curated project-memory load.
- Use `dd:plan` or the `doc-first-planning` skill before implementation, refactors, migrations, or multi-step work.
- Use `dd:impact` or the `impact-review` skill after source/config/docs edits and before broad verification, commits, pushes, publishing, or final handoff.
- During planning, prefer bounded dotdotgod context/status helpers: `status`, `query`, `resolve`, `expand`, `graph impact`, `graph communities`, read-only `config`, and intentional `index` refreshes. Do not run mutating scaffold/config commands such as `init` or `config init` from hooks unless the user explicitly requested that setup.
- Use hooks for small reminders at session start, prompt submission, supported tool boundaries, or stop time.

## Opt-In Levels

- `advisory`: print reminders or read-only status only.
- `validate`: run `dotdotgod validate . --include-local-memory --check-index` after docs work or at stop time.
- `strict-plan-safety`: add local blocking scripts only when a reliable plan-only state signal exists.

Start with advisory hooks. Do not enable blocking hooks until you have tested the hook payload, Codex trust state, and your local policy script.

## Review Before First Run

Codex may detect a configured hook but keep it disabled until you review it. If Codex shows `1 hook needs review before it can run. Open /hooks to review it.`, open `/hooks`, inspect the command, and approve only commands you trust.

After approval, trigger a small supported edit such as an `apply_patch` documentation comment change and confirm the hook status message or command output appears. If the hook was added while a Codex session was already running, restart Codex before the smoke test so the current configuration is loaded.

## Advisory `hooks.json` Example

This example reminds Codex to use dotdotgod intentionally at session start:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s\\n' 'dotdotgod: use dd:load for project memory or dotdotgod query for focused documentation search.'",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

## Inline TOML Shape

Codex can also express hooks in `config.toml`:

```toml
[[hooks.PostToolUse]]
matcher = "Edit|Write|apply_patch"

[[hooks.PostToolUse.hooks]]
type = "command"
command = "dotdotgod validate . --include-local-memory --check-index"
timeout = 120
statusMessage = "Checking dotdotgod docs and index freshness"
```

Use validation hooks only by explicit opt-in. They are useful for docs-heavy sessions but can be noisy if they run after every supported edit. `--check-index` compares current markdown fingerprints with `.dotdotgod/manifest.json` without refreshing the cache; if the only failure is an index freshness error, run `dotdotgod index .` or `pnpm run verify:cache` intentionally.

## Prompt Reminder Pattern

A `UserPromptSubmit` hook can add a reminder for implementation-like prompts. Keep the command fast and non-mutating. Prefer reminders over automatic planning because `dd:plan` and the planning skill are the explicit durable workflow.

For planning-like prompts, use an advisory reminder that asks Codex to resolve explicit `[[...]]` project-memory refs with `dotdotgod expand`, identify the complete target file list, and run one bounded multi-seed graph impact command with repeated `--changed` options for up to 20 unique paths before finalizing the plan. Split only larger sets into ordered batches:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "plan|planning|플랜|계획",
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s\\n' 'dotdotgod: advisory reminder only. If the prompt contains [[...]] refs, run dotdotgod expand . \"<prompt>\" --json before broad grep/find. For planning work, identify the complete target file list, run one bounded dotdotgod graph impact . --changed <path-a> --changed <path-b> --compact command for up to 20 unique paths, split only larger sets into ordered batches, and use combined and per-seed impact output to strengthen related docs, risks, and verification steps. After edits, use dd:impact before broad verification or handoff.'",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

## Strict Plan Safety Pattern

Strict safety belongs in a local script, not a generic package default:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|apply_patch",
        "hooks": [
          {
            "type": "command",
            "command": "python3 .codex/hooks/dotdotgod-plan-safety.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

A strict script must read hook JSON from stdin, confirm the session is explicitly in plan-only mode, allow expected `docs/plan/**` and `docs/archive/**` plan/archive updates, and fail open or advisory unless the mode signal and path parsing are tested. Codex tool interception may not cover every command path, so do not treat this as complete Plan Mode parity.

## Avoid By Default

- Do not run `pnpm run verify` after every tool call.
- Do not run `dotdotgod index` as an automatic stop hook.
- Do not run `dotdotgod init` or `dotdotgod config init` automatically.
- Do not move active plans to `docs/archive/` automatically.
- Do not block all source writes without an explicit plan-only state signal.
- Do not imply Codex has Claude/Pi slash-command parity.
- Do not imply plugin-bundled hooks run unless the user has enabled Codex `plugin_hooks` and trusted the hook source.
- Treat `dotdotgod query` as a cache-aware opt-in; it may refresh `.dotdotgod/vectors/` and download the local model on first use.
- Do not return raw `dotdotgod status` JSON from `Stop`; Codex stop hooks need Codex-compatible hook output. Use a tested wrapper if you want stop-time status reporting.
