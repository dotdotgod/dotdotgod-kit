# Obsidian Plugin Release 0.7.2

## Build Reproduction

Add root `pnpm run build` support for the community reviewer. It invokes the
existing plugin builder and writes ignored root `main.js` and `styles.css`.
Tests verify these copies match package output and the 0.7.1 runtime bytes.
No plugin runtime or vault data behavior changes in this release.

The plugin manifest/package version is 0.7.2. The seven public npm packages
remain at 0.7.1; no npm republishing is needed for this plugin-only build fix.
Release CI derives its notes path from the tag instead of hardcoding 0.7.1.

## Review Evidence

The hosted 0.7.1 review verified GitHub attestations for both `main.js` and
`styles.css`. Unsupported ZIP asset recommendations are absent in that review.
Source checks were still pending when this follow-up was prepared.
Elastic License 2.0 is deliberately retained; GitHub does not recognize it in
its license database. This advisory warning is not a missing LICENSE file and
is not resolved by pretending the project has another license.

## Verification

The release gate runs full workspace verification, root/package reproducibility
tests, docs validation, artifact build, provenance attestation, and verification
of the uploaded assets. Community review status must be checked separately.
