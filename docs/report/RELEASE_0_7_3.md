# Release 0.7.3

## Pi Subagent Removal

The Pi adapter no longer depends on or registers `pi-subagents`. The runtime
wrapper, package resource declarations, type shim, dedicated tests, and default
normal-mode tool entry are removed. Installation no longer pulls in the
subagent package or its exclusive transitive dependencies.

Subagent tools, skills, prompts, and agent definitions must be installed through
a separate extension if needed. Existing independently installed extensions
are not uninstalled. Restart Pi to refresh previously loaded resources.
Other hosts retain their native delegation behavior.

## Distribution

All seven public npm packages and the Obsidian plugin use version 0.7.3.
The plugin has no runtime behavior changes in this release.

## Verification

Release preparation runs full workspace verification, package dry-runs, and
project documentation validation with a refreshed index. GitHub release CI
builds and attests the Obsidian artifacts. Hosted CI and publication status
must be verified independently after pushing the release tag.
