# Obsidian Community Submission

## Status

Submitted and published through the community website on 2026-10-29 after the
owner explicitly accepted the developer policies and maintenance commitment.
GitHub is connected as `dotdotgod`; listing ownership is `Myself`.

- Public listing: <https://community.obsidian.md/plugins/dotdotgod-traceability>
- Owner dashboard: <https://community.obsidian.md/account/plugins/dotdotgod-traceability>
- Detected version: `0.7.0`, commit `b113d04`.
- Observed dashboard message: "Your entry is live. An automated review is in progress."
- Review state at submission: **Pending**. Public listing visibility is verified;
  automated review completion, approval, and in-app directory propagation are not.

The listing description discloses desktop-only support, undocumented renderer
APIs, native-filter limitations, safe local-file reveal, no network/telemetry,
and Elastic-2.0 licensing. GitHub release assets were discovered successfully.

## Listing Fields

- Repository: `dotdotgod/dotdotgod-kit`
- ID: `dotdotgod-traceability`
- Name: `dotdotgod Traceability`
- Author: `dotdotgod`
- Description: Explore exported project traceability in the native graph with
  relation colors, weights, filters, and document groups.
- Next review version/tag: `0.7.1` (no `v` prefix)
- Minimum app: `1.14.5`; desktop only; tested on macOS Obsidian 1.14.5.
- License: Elastic License 2.0. No copied Extended Graph implementation.

## Release Checklist

- Root `README.md`, `LICENSE`, `manifest.json`, and `versions.json` exist.
- Root README introduces the plugin and links to full usage/privacy details.
- Build: `pnpm --filter @dotdotgod/obsidian run verify`.
- Bundle: `node packages/obsidian/scripts/release.mjs`.
- Release assets: only `main.js`, `manifest.json`, and `styles.css` from
  `packages/obsidian/dist/`. The manual ZIP is a separate Actions artifact.
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
3. Point reviewers to `packages/obsidian/`, the root manifest, exact versioned
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
