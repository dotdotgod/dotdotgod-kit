# Optional Claude Code Hooks

Claude Code hooks can complement dotdotgod commands and skills, but they are not required. `/dd:load`, `/dd:plan`, `/dd:init`, and the bundled skills work without hook configuration.

Use hooks only when you want opt-in reminders, lightweight validation, or local safety rails around the same doc-first workflow. Hooks run local commands with your user permissions, so copy and adapt examples deliberately.

## When To Use Hooks

- Use `/dd:load` or the `project-load` skill when you intentionally want a curated project-memory load.
- Use `/dd:plan` or the `doc-first-planning` skill before implementation, refactors, migrations, or multi-step work.
- Use hooks for small reminders at session start, prompt submission, tool boundaries, or stop time.

## Opt-In Levels

- `advisory`: print reminders or read-only status only.
- `validate`: run `dotdotgod validate` after docs work or at stop time.
- `strict-plan-safety`: add local blocking scripts only when a reliable plan-only state signal exists.

Start with advisory hooks. Do not enable blocking hooks until you have tested the hook payload and your local policy script.

## Advisory Example

This example reminds Claude to use dotdotgod intentionally and checks cache status without rebuilding it:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s\\n' 'dotdotgod: use /dd:load or dotdotgod load-snapshot when project memory is needed.'",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "dotdotgod status . --json 2>/dev/null || true",
            "timeout": 20
          }
        ]
      }
    ]
  }
}
```

## Opt-In Validation Example

Use this only when you want stop-time docs validation. It may be noisier than advisory hooks, but it keeps dotdotgod docs contracts visible:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "dotdotgod validate . --include-local-memory",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

## Prompt Reminder Pattern

A `UserPromptSubmit` hook can add a reminder for implementation-like prompts. Keep the command fast and non-mutating. Prefer reminders over automatic planning because `/dd:plan` and the planning skill are the explicit durable workflow.

## Strict Plan Safety Pattern

Strict safety belongs in a local script, not a generic package default:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 .claude/hooks/dotdotgod-plan-safety.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

A strict script must read hook JSON from stdin, confirm the session is explicitly in plan-only mode, allow expected `docs/plan/**` and `docs/archive/**` plan/archive updates, and fail open or advisory unless the mode signal and path parsing are tested.

## Avoid By Default

- Do not run `pnpm run verify` after every tool call.
- Do not run `dotdotgod index` as an automatic stop hook.
- Do not move active plans to `docs/archive/` automatically.
- Do not block all source writes without an explicit plan-only state signal.
- Do not treat `dotdotgod load-snapshot` as side-effect-free in strict hooks; it may lazily refresh the ignored `.dotdotgod/` cache.
