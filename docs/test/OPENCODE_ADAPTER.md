# OpenCode Adapter Verification

See [behavior](../spec/OPENCODE_ADAPTER.md) and
[manual smoke](manual-smoke/OPENCODE_ADAPTER.md).

## Automated Coverage

- [`opencode-plugin.test.mjs`](../../packages/cli/test/adapters/opencode-plugin.test.mjs)
  exercises registrations, Code Mode, native plan redirect and later denies,
  write-capable tool gating, load advice and clearance on successful impact.
- [`opencode-runtime.test.mjs`](../../packages/cli/test/adapters/opencode-runtime.test.mjs)
  verifies the CLI-relative runtime import in pinned/PATH modes, rejects
  untrusted bindings, and checks fail-open advisories without lifting native
  plan restrictions.
- [`jsonc-edit.test.mjs`](../../packages/cli/test/adapters/jsonc-edit.test.mjs) and
  [`installer-lifecycle.test.mjs`](../../packages/cli/test/adapters/installer-lifecycle.test.mjs)
  cover project and user destinations, byte-preserving narrow config edits,
  ownership, legacy conflicts, and uninstall.
- [`runtime-smoke.test.mjs`](../../packages/cli/test/adapters/runtime-smoke.test.mjs)
  launches MCP through the installed plugin. The
  [package contract test](../../packages/cli/test/adapters/packaging-contract.test.mjs)
  checks shared CLI/Pi tarballs, not a separate OpenCode tarball.

Run `pnpm --filter @dotdotgod/cli run verify`. Check native plugin
discovery separately in a private profile. The native Plan Mode adapter
targets 2.1.2; discovery on another version does not prove Plan Mode
redirect or permission compatibility.
