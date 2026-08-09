# Automatic Project Memory Smoke Tests

Use these checks when changing Pi's mode-neutral automatic project-memory assessment, pending Load tool, active-branch lifecycle, or recent-load suppression.

## Fresh Ordinary Session

1. Install the local adapter with `pi install /path/to/dotdotgod/packages/pi` and start a fresh ordinary-mode Pi session in an initialized project.
2. Submit a substantive request without calling `/load` or `/dd:load`.
3. Confirm startup context files alone do not suppress loading: `dotdotgod_project_load` becomes pending even when Pi has already injected project README files.
4. Confirm the submitted user message and attached images remain unchanged and contain no project-memory marker or automatic-load instruction.
5. Confirm a persistent `project-memory-context` custom message with `display: false` supplies the model-only instruction, and that it does not render as user-authored request text in the TUI.
6. Confirm the agent generates a concise task-specific focus, calls the tool exactly once before substantive work, consumes the compact Load result, and continues the original request.
7. Confirm the pending tool disappears after successful completion.
8. Confirm the completed tool result shows at most three lines in the Pi TUI, includes the configured expansion hint, expands to the complete result with `Ctrl+O` by default, and collapses again with the same keybinding.

## Duplicate And Branch Boundaries

1. Submit another request within 25 active-branch entries and confirm the recent reachable Load suppresses a duplicate call.
2. Fork before assessment and confirm the new branch performs its own assessment.
3. Fork after assessment but before completion and confirm the new branch keeps the pending Load retryable.
4. Fork after reachable completion and confirm the new branch reuses that completion.
5. Confirm an abandoned sibling's assessment or completion does not suppress loading on the active branch.

## Opt-Out And Failure Recovery

1. Start a request with `/dd:no-load`, `dd:no-load`, or `/no-load` and confirm automatic loading is skipped for that request.
2. Interrupt or fail a pending Load before completion and confirm the tool remains retryable.
3. Confirm duplicate in-flight calls are rejected.
4. Run `/load` and `/dd:load` separately and confirm both explicit full-load commands remain available regardless of automatic state.

## Focused Verification

```bash
pnpm --filter @dotdotgod/pi test
pnpm --filter @dotdotgod/pi run verify
```
