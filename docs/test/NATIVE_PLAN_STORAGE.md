# Native Plan Storage Verification

## Automated

`packages/cli/test/claude-plans.test.mjs` covers opt-in, dry-run, preserved
settings/denies, existing native directory, idempotency, invalid JSON/object
shape, symlinks and documentation-root selection.

`packages/context/test/hooks.test.mjs` verifies local plan Markdown does not
create source-impact gates while maintained docs retain their policy.

## Actual Host Smoke

Host binaries are installed only in a disposable directory. Their npm SHA-512
integrity is checked. Isolated HOME/config prevents user setup contamination.
Loopback model fixtures use no account, paid inference or external model API.

```sh
CLAUDE_BINARY=/path/to/claude node packages/claude-code/scripts/smoke-plans.mjs
```

Claude Code 2.1.308: the generated setting is read by native Plan Mode and its
native Write tool stores a plan below the project's docs/plan directory.

Fixtures prove integration and enforcement for the tested host/platform, not
that a live model always follows plan quality or task-selection guidance.
Other versions/platforms require renewed verification. MCP and hook processes
are outside this local-command acceptance boundary.
