# Obsidian Community Submission

## Status

Version 0.7.0 is prepared for GitHub distribution and community review, not
community-approved. The owner must sign in and submit; GitHub publication alone
does not add a plugin to Obsidian's directory.

## Listing Fields

- Repository: `dotdotgod/dotdotgod-kit`
- ID: `dotdotgod-traceability`
- Name: `dotdotgod Traceability`
- Author: `dotdotgod`
- Description: Explore exported project traceability in the native graph with
  relation colors, weights, filters, and document groups.
- Version/tag: `0.7.0` (no `v` prefix)
- Minimum app: `1.14.5`; desktop only; tested on macOS Obsidian 1.14.5.
- License: Elastic License 2.0. No copied Extended Graph implementation.

## Release Checklist

- Root `README.md`, `LICENSE`, `manifest.json`, and `versions.json` exist.
- Root README introduces the plugin and links to full usage/privacy details.
- Build: `pnpm --filter @dotdotgod/obsidian run verify`.
- Bundle: `node packages/obsidian/scripts/release.mjs`.
- Assets: `main.js`, `manifest.json`, `styles.css`, and
  `dotdotgod-traceability-0.7.0.zip` from `packages/obsidian/dist/`.
- ZIP contains a `dotdotgod-traceability/` directory, not an entire vault.
- Review source/bundle for external paths, network, telemetry, dependency
  installers, untrusted HTML, and OS file execution.
- Confirm missing-export recovery, loading, filtering, settings, reveal behavior,
  repeated reload, graph reopen, and disable restoration.
- Run workspace verification and docs/index validation after generation.
- Inspect actual uploaded assets and registry versions after publication.

## Owner Submission

1. Sign in at <https://community.obsidian.md> with an Obsidian account and connect
   the GitHub account that owns the repository.
2. Choose plugin submission and enter the repository/listing fields.
3. Point reviewers to `packages/obsidian/`, the root manifest, exact `0.7.0`
   release, and build instructions. Explain that this is a monorepo.
4. Disclose undocumented renderer hooks, desktop-only support, native-filter
   limitations, local-file reveal, and Elastic-2.0 licensing. The plugin uses no
   network, telemetry, payment, or account.
5. Resolve feedback and record the review URL here. Do not advertise Community
   plugins browser availability until approved.

If review requires a dedicated repository, different licensing, or public
renderer APIs, request a separate owner decision rather than silently changing
distribution or claiming compliance/approval.

## Official References

Checked on 2026-10-29:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
