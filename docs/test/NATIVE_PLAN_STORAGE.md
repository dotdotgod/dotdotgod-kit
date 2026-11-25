# Native Plan Storage Verification

## Automated

- `packages/cli/test/claude-plans.test.mjs`: covers Claude Code opt-in `plansDirectory`, dry-run, preserved settings/denies, existing native directory, idempotency, invalid JSON/object shape, symlinks, and documentation-root selection.
- `packages/codex/test/native-plan.test.mjs`: checks the narrow Codex native prompt patch, preserved catalog metadata/default instructions, rejection of custom prompts, permission conflicts, and project-specific read/write policy.
- `packages/context/test/hooks.test.mjs`: verifies local `<docRoot>/plan/**/*.md` and `<docRoot>/archive/**` edits do not create pending impact entries while `<docRoot>/post/**` and maintained docs remain tracked.
- `packages/context/test/hooks-antigravity.test.mjs` (`AG-03`) & `packages/antigravity/test/resources.test.mjs` (`AP-01`): verify Antigravity Option C-2 native `/plan` integration:
  - triggers only on successful `PostToolUse` write/edit calls targeting exact `<artifactDirectoryPath>/implementation_plan.md`;
  - negative coverage ignores `Read` calls, workspace `implementation_plan.md`, sibling `<artifactDirectoryPath>-evil/implementation_plan.md`, and other/nested artifact files (`task.md`, `walkthrough.md`, `notes.md`);
  - `readArtifactBounded` passes `2 MiB` files and rejects `2 MiB + 1 B` files, symlinks (`O_NOFOLLOW`), directories, and POSIX FIFOs (`O_NONBLOCK`, completing in `< 1s`, skipped on `win32`);
  - `plan_notices` rows store only `(session, fingerprint, notified, created_at, expires_at)` with zero `$HOME` path leakage, suppress duplicate advisories on unchanged saves, and re-arm on changed content;
  - `PreInvocation` emits a 1-time advisory without permission-bypass fields, hooks never write any workspace files, and an observed native write to `<docRoot>/plan/**/*.md` clears `plan_notices`.

## Actual Host Smoke

Host binaries are installed only in a disposable directory with verified npm SHA-512 integrity and isolated `HOME`/config. Loopback model fixtures use no account, paid inference, or external model API.

```sh
CLAUDE_BINARY=/path/to/claude node packages/claude-code/scripts/smoke-plans.mjs
CODEX_BINARY=/path/to/codex CODEX_CATALOG=/path/to/full/models.json node packages/codex/scripts/smoke-plan.mjs
```

- **Claude Code 2.1.308**: the generated `plansDirectory` setting is read by native Plan Mode and its native Write tool stores a plan below the project's `docs/plan` directory.
- **Codex 0.163.0 on macOS**: native `apply_patch` writes a plan and denies a source patch; sandboxed commands create/update plans and deny source/config/maintained-doc and symlink-escape writes. Outgoing Plan Mode requests carry patched catalog instructions; resume retains Plan Mode and leaving it does not expand permissions.
- **Antigravity CLI/App (Option C-2)**: run `agy --mode plan` or App `/plan` writing `<artifactDirectoryPath>/implementation_plan.md`; confirm 1-time `PreInvocation` save advisory, zero hook workspace writes, intact host **Proceed** confirmation gate, no `$HOME` in `plan_notices`, and clearance after saving `<docRoot>/plan/<task-slug>/README.md` via native file write tools. See [`ANTIGRAVITY_ADAPTER.md`](ANTIGRAVITY_ADAPTER.md) and [`manual-smoke/CROSS_AGENT_ADAPTERS.md`](manual-smoke/CROSS_AGENT_ADAPTERS.md).

Fixtures prove integration and enforcement for the tested host/platform, not that a live model always follows plan quality or task-selection guidance. Other versions/platforms require renewed verification.
