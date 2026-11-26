# Native Plan Storage Verification

## Automated

- `packages/cli/test/claude-plans.test.mjs`: covers Claude Code opt-in `plansDirectory`, dry-run, preserved settings/denies, existing native directory, idempotency, invalid JSON/object shape, symlinks, and documentation-root selection.
- `packages/cli/test/adapters/codex-plan.test.mjs`: checks the narrow Codex native prompt patch, preserved catalog metadata/default instructions, rejection of custom prompts, permission conflicts, and project-specific read/write policy.
- `packages/cli/test/context/hooks.test.mjs`: verifies local `<docRoot>/plan/**/*.md` and `<docRoot>/archive/**` edits do not create pending impact entries while `<docRoot>/post/**` and maintained docs remain tracked.
- `packages/cli/test/context/hooks-antigravity.test.mjs` (`AG-03`) & `packages/cli/test/adapters/antigravity-resources.test.mjs` (`AP-01`): verify Antigravity Option C-2 native `/plan` integration:
  - triggers only on successful `PostToolUse` write/edit calls targeting exact `<artifactDirectoryPath>/implementation_plan.md`;
  - negative coverage ignores `Read` calls, workspace `implementation_plan.md`, sibling `<artifactDirectoryPath>-evil/implementation_plan.md`, and other/nested artifact files (`task.md`, `walkthrough.md`, `notes.md`);
  - `readArtifactBounded` passes `2 MiB` files and rejects `2 MiB + 1 B` files, symlinks (`O_NOFOLLOW`), directories, and POSIX FIFOs (`O_NONBLOCK`, completing in `< 1s`, skipped on `win32`);
  - `plan_notices` rows store only `(session, fingerprint, notified, created_at, expires_at)` with zero `$HOME` path leakage, suppress duplicate advisories on unchanged saves, and re-arm on changed content;
  - `PreInvocation` emits a 1-time advisory without permission-bypass fields, hooks never write any workspace files, and an observed native write to `<docRoot>/plan/**/*.md` clears `plan_notices`.

## Actual Host Smoke

Use disposable projects and profiles. For Claude Code, preview then apply
`dotdotgod init <root> --claude-plans` and check native Plan Mode writes.
For Codex, preview `dotdotgod adapter setup-plan codex <root> --codex <bin> --catalog <file>`
with Codex 0.163.0, then apply with `--confirm` and use the reported launch command.
The older dedicated smoke scripts were retired; the historical observations
below do not prove the new installer or native registration was exercised.

- **Claude Code 2.1.308**: the generated `plansDirectory` setting is read by native Plan Mode and its native Write tool stores a plan below the project's `docs/plan` directory.
- **Codex 0.163.0 on macOS**: native `apply_patch` writes a plan and denies a source patch; sandboxed commands create/update plans and deny source/config/maintained-doc and symlink-escape writes. Outgoing Plan Mode requests carry patched catalog instructions; resume retains Plan Mode and leaving it does not expand permissions.
- **Antigravity CLI/App (Option C-2)**: run `agy --mode plan` or App `/plan` writing `<artifactDirectoryPath>/implementation_plan.md`; confirm 1-time `PreInvocation` save advisory, zero hook workspace writes, intact host **Proceed** confirmation gate, no `$HOME` in `plan_notices`, and clearance after saving `<docRoot>/plan/<task-slug>/README.md` via native file write tools. See [`ANTIGRAVITY_ADAPTER.md`](ANTIGRAVITY_ADAPTER.md) and [`manual-smoke/CROSS_AGENT_ADAPTERS.md`](manual-smoke/CROSS_AGENT_ADAPTERS.md).

Fixtures prove integration and enforcement for the tested host/platform, not that a live model always follows plan quality or task-selection guidance. Other versions/platforms require renewed verification.
