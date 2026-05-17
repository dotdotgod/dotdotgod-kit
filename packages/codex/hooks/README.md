# Optional Codex Hooks

Codex hooks can complement dotdotgod skills and `dd:*` trigger phrases, but they are not required. The `project-load`, `doc-first-planning`, and `project-initializer` skills work without hook configuration.

Use hooks only when you want opt-in reminders, lightweight validation, or local safety rails around the same doc-first workflow. Hooks run local commands with your user permissions. Project-local `.codex/` hooks should be reviewed and trusted before use.

## When To Use Hooks

- Use `dd:load` or the `project-load` skill when you intentionally want a curated project-memory load.
- Use `dd:plan` or the `doc-first-planning` skill before implementation, refactors, migrations, or multi-step work.
- Use hooks for small reminders at session start, prompt submission, supported tool boundaries, or stop time.

## Opt-In Levels

- `advisory`: print reminders or read-only status only.
- `validate`: run `dotdotgod validate` after docs work or at stop time.
- `strict-plan-safety`: add local blocking scripts only when a reliable plan-only state signal exists.

Start with advisory hooks. Do not enable blocking hooks until you have tested the hook payload, Codex trust state, and your local policy script.

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
            "command": "printf '%s\\n' 'dotdotgod: use dd:load or dotdotgod load-snapshot when project memory is needed.'",
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
command = "sh .codex/hooks/validate-docs-if-needed.sh"
timeout = 120
statusMessage = "Checking dotdotgod docs when relevant"
```

Use validation hooks only by explicit opt-in. They are useful for docs-heavy sessions but can be noisy if they run after every supported edit. Prefer a local wrapper that filters to docs-related edits or writes validation logs without returning invalid hook output.

## Prompt Reminder Pattern

A `UserPromptSubmit` hook can add a reminder for implementation-like prompts. Keep the command fast and non-mutating. Prefer reminders over automatic planning because `dd:plan` and the planning skill are the explicit durable workflow.

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
- Do not move active plans to `docs/archive/` automatically.
- Do not block all source writes without an explicit plan-only state signal.
- Do not imply Codex has Claude/Pi slash-command parity.
- Do not treat `dotdotgod load-snapshot` as side-effect-free in strict hooks; it may lazily refresh the ignored `.dotdotgod/` cache.
- Do not return raw `dotdotgod status` JSON from `Stop`; Codex stop hooks need Codex-compatible hook output. Use a tested wrapper if you want stop-time status reporting.
