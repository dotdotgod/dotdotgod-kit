# Release 0.7.1

## Community Review Fixes

- Replace Pi's computed subagent import URL with a literal installed-package
  entrypoint. Preserve lazy loading, external-tool ownership, and resource paths.
- Narrow parsed query failures and MCP envelopes from `unknown`, preserving
  fallback precedence and error propagation. Build structured project-memory
  results without an untyped JSON round trip.
- Parse terminal ESC reports without control-character regexes, use explicit
  Node timers in the Pi handoff, and remove redundant casts/unused imports.
- Make plugin bundle bytes independent of invocation cwd, with regression tests.
- Build, test, and attest Obsidian artifacts in GitHub Actions from the release
  tag. New Releases attach only `main.js`, `manifest.json`, and `styles.css`.
  The manual-install ZIP remains available as a 90-day Actions artifact.
- Keep Elastic License 2.0; clarify its standard name and reference URL while
  retaining copyright and all license terms. GitHub's license database does not
  list ELv2, so a recognition warning may remain and is not represented as fixed.

## Review Boundary

The community scanner also inspects Pi TypeScript in this monorepo, even though
the Obsidian bundle contains no Pi code. No runtime code is moved into ignored
extensions/directories to suppress review. Security-relevant computed imports
and meaningful type findings are corrected at source. The Pi timer remains a
Node timer, not a browser `window` API.

The public listing is live. Automated review results are external evidence;
publication alone does not establish review approval or in-app installability.
The owner explicitly chose to retain ELv2. A different license or dedicated
repository requires a separate decision.

## Verification

Run full workspace verification, documentation/index validation, package-content
dry-runs, real-app plugin regressions, workflow build, attestation verification,
and hosted review refresh. Do not overwrite version 0.7.0 artifacts or tags.
