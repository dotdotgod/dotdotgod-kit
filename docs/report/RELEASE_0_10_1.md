# Release 0.10.1

## Optional Claude Code and Codex Memory Loading

Remove the shared hooks' mandatory `loadRequired` flag and the pre-load
Bash/Edit/Write denial. SessionStart offers optional project-memory guidance;
`project_load` remains available, but its success or failure does not gate work.
Existing persisted `loadRequired` values are discarded during hook housekeeping.

Regenerate both bundled hook runtimes and update direct/standalone-package
regressions. Separate impact-pending gates, root/session isolation and Pi's
adapter-specific project-memory lifecycle remain unchanged.

## Version Alignment and Verification

Workspace packages, public-package metadata and plugin manifests align to 0.10.1.
Obsidian changes are metadata only; minimum app version remains 1.14.5.

Full workspace verification, generated-runtime parity, documentation/check-index
validation and diff checks run before commit. Push alone does not install the fix
into an existing host plugin cache. npm publication and release-tag creation are
separate operations; this version-preparation change does not claim distribution.
Actual installed-host cache refresh and interactive hook dispatch remain unverified.
