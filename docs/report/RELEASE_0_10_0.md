# Release 0.10.0

## Remembered Pi Command Approvals

Eligible native Plan Mode commands offer Deny, Allow once, Allow same invocation
this session, Always this project and Always all projects. Personal remembered
consent is stored privately under `~/.dotdotgod/plan-approvals/grants.json`, not in
shared project policy. Exact identified executable/script contents, ordered args
and project-relative cwd determine reuse; project scope additionally binds root.

Execution admission rechecks live project/session/trust, cancellation, requested
command resolution and context after approval and lock waits. Save errors before
atomic rename deny without once fallback; later execution failure does not revoke
committed consent. Native and user_bash routes share admission checks. Existing
prohibited commands, MCP once-only restrictions and managed-child ceilings remain.

## Limits and Compatibility

Supported direct scripts have one absolute native shebang interpreter without
options. Unknown formats, env/nested-script interpreters and unsupported host
formats lack persistent choices. No command ban is reopened. This is practical
entry identity, not exhaustive dynamic import/configuration/environment verification
or an OS sandbox. Atomic rename is not power-loss durability. Secret-like argument
redaction is heuristic; crashed writer locks require careful manual cleanup.

All workspace packages, eight public npm packages and plugin metadata align to
0.10.0. Obsidian changes are synchronized metadata only; minimum app remains 1.14.5.

## Verification Boundary

Implementation verification passed: 37 focused approval/boundary/handler tests,
Pi 262 tests without failures/skips, independent review fixes, full workspace
verify, documentation/check-index and diff whitespace checks. Release preflight
repeats generation, workspace verification, packaging and plugin artifact checks
at the aligned version. Publication and GitHub release/attestations require service
verification, not inference from local builds. Actual interactive Pi restart,
narrow-terminal acceptance and Linux-kernel execution remain unverified.
