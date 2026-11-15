# Pi Pending Impact Smoke Tests

Continued from [Pi adapter](PI_ADAPTER.md).

## Pending Impact Checks

1. In execution or normal mode, make a source/config edit.
2. Confirm neither an impact list widget nor a pending-count status appears. Ask the agent for pending impact checks; MCP `impact_status` must return current session records without clearing them. Hidden context still reminds the agent to run `/impact-check` or MCP `project_impact`.
3. Confirm `/impact-check` runs compact graph impact for pending files plus current git unstaged, staged, and untracked source/config files, then status query returns no pending records after success.
4. Change a pending file again before impact and confirm a successful `/impact-check` clears the stale pending record for that path.
5. Stage a source/config file without an unstaged diff and confirm `/impact-check` includes it.
6. Pending impact must not block normal-mode verification or safe commit/publish dry-runs. Preserve Plan Mode/user permissions; failed reviews and concurrent re-edits retain state.
7. Confirm shell text claiming a successful `dotdotgod graph impact ... --changed <path>` does not clear pending; successful MCP `project_impact` is required.
8. Run MCP `project_impact` with up to twenty paths; inspect `isError`, `structuredContent`, and host rendering. No custom ten-line impact renderer remains. Failures, cancellation and concurrent re-edits retain pending.
9. After modification or coding work, confirm execution guidance requires `dotdotgod validate` before final completion.
