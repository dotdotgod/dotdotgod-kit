# OpenCode Adapter Manual Smoke

## Setup

Use a disposable project and private HOME/XDG paths. Preview then run
`dotdotgod adapter install opencode --root <project>` from a durable CLI.
Confirm exactly one local plugin entry in the project config, with user config
unchanged. Separately exercise `--scope user` with its isolated XDG config.
Use OpenCode 2.1.2 for the native Plan Mode contract; discovering the plugin on
another version does not verify automatic plan storage. Use Node >=22.5.

## Planning

1. Select the built-in plan agent and request a concrete implementation plan,
   without asking to save a file. Confirm docs/plan/<task-slug>/README.md exists.
2. Refine the scope; confirm the same plan is updated and unrelated plans survive.
3. Start an explanation-only exchange; confirm no unnecessary new plan is made.
4. Try a source edit; confirm denial. Switch to build before implementation.
5. Add an explicit plan-path deny and confirm the plugin does not override it.
6. Test a supported and unsupported reminder/version. Unsupported integration
   must be reported, not falsely presented as a successful save.

## MCP And Impact

1. Run dd:load and inspect the map; use focus for project documentation/code query.
2. Execute small and large output through MCP Code Mode. Inspect structured
   status, then search the retained source ID without returning the full log.
3. Edit a source file; inspect MCP impact_status and the advisory reminder.
4. Run tests/build and a safe commit dry-run; pending impact alone must not block.
5. Review one of two pending files. Only the covered file clears after success.
6. Fail/cancel impact or re-edit during review. Pending must remain.
7. Resume the same session and open another session. Confirm persistence and
   session isolation, including nested Code Mode calls.
8. Review shell/external edits with explicit paths; do not expect automatic
   attribution of pre-existing worktree changes.
