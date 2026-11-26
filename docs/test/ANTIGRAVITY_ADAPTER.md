# Antigravity Adapter Verification

See the [behavior contract](../spec/ANTIGRAVITY_ADAPTER.md) and the
[desktop/CLI smoke procedure](manual-smoke/CROSS_AGENT_ADAPTERS.md#antigravity-adapter-cli-and-app).

## Automated Checks

- [`hooks-antigravity.test.mjs`](../../packages/cli/test/context/hooks-antigravity.test.mjs)
  covers workspace attribution, valid sessions, failed-tool filtering, pending
  claim/clear, and read-only native plan observation.
- [`antigravity-resources.test.mjs`](../../packages/cli/test/adapters/antigravity-resources.test.mjs)
  checks the rendered manifest, logo, rules, three canonical skills,
  `mcpServers.context`, and advisory-only hooks bound to the CLI. It validates
  the installed-layout fixture with real `agy plugin validate --strict` when
  available; the release gate requires the binary.
- [`installer-lifecycle.test.mjs`](../../packages/cli/test/adapters/installer-lifecycle.test.mjs)
  verifies direct placement, dry-run, status, upgrades and owned uninstall.
  Legacy and modified files require explicit conflict resolution.
- [`runtime-smoke.test.mjs`](../../packages/cli/test/adapters/runtime-smoke.test.mjs)
  runs rendered hook and MCP entrypoints; there is no per-host bundled tarball.

```bash
DOTDOTGOD_REQUIRE_AGY=1 pnpm --filter @dotdotgod/cli run verify
```

For manual verification, install into a private HOME from a persistent CLI,
then run `agy plugin validate --strict --json "$HOME/.gemini/config/plugins/dotdotgod"`.
Require exit 0 with zero errors and warnings. Record CLI discovery separately
from App/IDE discovery. Test desktop startup with a restricted PATH, silence
in uninitialized repos, and intact native **Proceed** and write permissions.
A strict-validation pass alone does not prove desktop activation.
