# Optional Claude Code Hooks

Claude Code hooks can complement dotdotgod commands and skills, but they are not required. `/dd:load`, `/dd:plan`, `/dd:init`, and the bundled skills work without hook configuration.

Use hooks only when you want opt-in reminders, lightweight validation, or local safety rails around the same doc-first workflow. Hooks run local commands with your user permissions, so copy and adapt examples deliberately.

## Current Claude Code Lifecycle Notes

Claude Code exposes a broad hook lifecycle. In addition to session, prompt, tool, subagent, and stop events, current Claude Code docs include events such as `Setup`, `UserPromptExpansion`, `PermissionRequest`, `PermissionDenied`, `PostToolUseFailure`, `PostToolBatch`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`, and `SessionEnd`.

Dotdotgod examples intentionally use only a small subset of that surface. Prefer current events this way:

- `SessionStart`: fast project-memory reminders or environment setup.
- `UserPromptSubmit`: advisory SDLC reminders before Claude plans or implements.
- `PreToolUse`: narrowly scoped local safety checks before writes or commands.
- `PostToolUse`: optional feedback after a single successful tool call.
- `PostToolBatch`: once-per-parallel-tool-batch checks or context injection when a check depends on the whole batch.
- `Stop`: successful turn completion reminders or opt-in validation.
- `StopFailure`: logging or notification when a turn ends due to an API error; do not use `Stop` as the only failure-path hook.
- `SessionEnd`: cleanup or local logging at session termination, not required validation.

Claude Code currently does not document dedicated plan-mode transition hooks such as `PrePlanMode`, `PostPlanMode`, plan-accept, or plan-reject events. Treat plan-mode-specific hook names found in issues or community posts as feature requests unless they appear in the official docs. Dotdotgod plan-safety examples should rely on explicit durable plans plus current hook events such as `UserPromptSubmit`, `PreToolUse`, `PostToolBatch`, and `Stop`.

Hook handlers may be `command`, `http`, `mcp_tool`, `prompt`, or `agent`, with event-specific support limits. `SessionStart` and `Setup` support only `command` and `mcp_tool`. For project or plugin scripts, prefer command exec form with `args` so `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, and `${CLAUDE_PLUGIN_DATA}` paths are passed without shell quoting. Hooks should not write directly to `/dev/tty`; use JSON `systemMessage` for user-visible messages or Claude Code's `terminalSequence` field for terminal notifications.

## SDLC Guardrail Framing

Use hooks as optional guardrails around the software-development lifecycle, not as a replacement for human review or the durable plan file:

1. Plan: `/dd:plan` or the planning skill creates or updates `docs/plan/<task-slug>/README.md` from docs evidence.
2. Implement: Claude changes only the target files described by the accepted plan.
3. Verify: run focused checks and, for docs changes, `dotdotgod validate . --include-local-memory --check-index`.
4. Review: inspect changed files, risks, and impact-derived related checks.
5. Archive: move completed plan artifacts only as an explicit housekeeping step, never from a default hook.

This SDLC framing maps common Claude Code guidance about a project brain to dotdotgod's cross-agent contract: keep `AGENTS.md` canonical and keep `CLAUDE.md` thin rather than duplicating long-lived instructions.

## When To Use Hooks

- Use `/dd:load` or the `project-load` skill when you intentionally want a curated project-memory load.
- Use `/dd:plan` or the `doc-first-planning` skill before implementation, refactors, migrations, or multi-step work.
- Use hooks for small reminders at session start, prompt submission, tool boundaries, or stop time.

## Opt-In Levels

- `advisory`: print reminders or read-only status only.
- `validate`: run `dotdotgod validate . --include-local-memory --check-index` after docs work or at stop time.
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
            "command": "dotdotgod validate . --include-local-memory --check-index",
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

`UserPromptSubmit` does not support matchers in Claude Code settings, so filter on the submitted `prompt` field inside the hook command. For planning-like prompts, use an advisory reminder that asks Claude to resolve explicit `[[...]]` project-memory refs with `dotdotgod expand`, identify the complete target file list, and run graph impact checks for every target file before finalizing the plan:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json,re,sys; p=json.load(sys.stdin).get('prompt',''); msg='dotdotgod: advisory reminder only. If the prompt contains [[...]] refs, run dotdotgod expand . \\\"<prompt>\\\" --json before broad grep/find. For planning work, identify the complete target file list, run dotdotgod graph impact . --changed <path> --compact for every target file, and use impact output to strengthen related docs, risks, and verification steps. If docs change, run dotdotgod validate . --include-local-memory --check-index.'; print(msg) if re.search(r'plan|planning|플랜|계획|\\[\\[', p, re.I) else None\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

## Strict Plan Safety Pattern

Strict safety belongs in a local script, not a generic package default. Use exec form when referencing project-local scripts so paths with spaces do not require shell quoting:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/dotdotgod-plan-safety.py"],
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
