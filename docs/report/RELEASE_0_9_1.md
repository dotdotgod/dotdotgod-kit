# Release 0.9.1

## Clean Checkout Correction

Retain the Plan Mode behavior and limits documented in [Release 0.9.0](RELEASE_0_9_0.md).
Replace a tracked archive-index Markdown link to an ignored local-only report with
a plain local-memory path hint. Local validation saw the target, but GitHub's clean
checkout correctly reported BROKEN_LINK and prevented the 0.9.0 Obsidian release.
No validation gate is removed, no ignored report is force-added, and the existing
0.9.0 tag is not rewritten. All public packages and plugin metadata align to 0.9.1.

## Verification Boundary

Repeat generated parity, workspace verification, packaging and Obsidian build.
Verify documentation in a tracked-files-only export as well as the working tree.
GitHub artifacts/attestations and npm versions/latest tags require service checks.
Full live model-task/reload/UI acceptance and custom-provider child loading remain
limited as documented for 0.9.0; this correction does not claim additional runtime
coverage or change the installed user profile.
