# Hermes Adapter Verification

## Automated Workspace Gate

```bash
pnpm --filter @dotdotgod/hermes run verify
pnpm --filter @dotdotgod/hermes run pack:dry-run
```

The package verify command checks generated runtime drift, then Python stdlib
lifecycle/transport tests and Node resource checks. Root verification discovers
the package automatically. Python 3.11+ is required; use the Hermes-supported
version for compatibility smoke. No Python MCP dependency is needed by the plugin.

- test_runtime.py: registration, operator grants/revocation, concurrent repositories,
  same-root session search isolation, explicit resume/reconnect, load opt-out and
  conservative restore, explicit references, CLI fallback, failed/subset impact,
  re-edit, batch/file/process/delegation gates and cancellation. Unselected-session
  checks cover empty roots/grants, optional selection, ordinary host tools without
  path rewriting or impact scans, blocked dotdotgod calls, one-shot initialization,
  absolute targets, dry-run/write confirmation, failure cleanup and revocation.
- resources.test.mjs: 18 shared tools plus two local tools, four generated skills,
  batch schemas, self-contained artifacts, absent profile-wide MCP declaration
  and no planning resources.
- Shared packages/context tests retain execution limits, source-filtered search,
  fetch safeguards, provenance, destructive confirmation, job restart and recovery
  coverage. Hermes wrappers preserve those contracts rather than duplicating them.

## Isolated Pinned Host Smoke

Pin Hermes commit 19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9 in a disposable
checkout. Use an isolated Python environment with that host loader's declared
prerequisites (ruamel.yaml, python-dotenv, rich and packaging were sufficient for
loader tests); this is not a complete production Hermes dependency installation.
Do not install into the user's active profile or global Python environment.

Pack/extract the Hermes package outside workspace ancestry, then run:

```bash
<host-venv>/bin/python packages/hermes/test/pinned_host_smoke.py \
  <pinned-hermes-checkout> <extracted-package-directory>
```

The test creates an isolated HERMES_HOME, loads the installed native plugin using
the actual PluginManager, registers tools/skills in the actual registry and uses
the host's real hook dispatcher and durable plugin state. It checks CLI and
Telegram-shaped gateway hook events, concurrent repository/session ownership,
resume isolation, child root inheritance and impact deny/clear/re-edit. Generated
MCP processes run without consumer node_modules; no remote commit/push happens.

This is installed-loader/hook integration, not a full CLI conversation, provider
inference, delegate_task execution, or real Telegram/Discord network session.
Record those distinctions in handoffs. The smoke is opt-in because it requires a
separate pinned host checkout/environment; it is not silently skipped inside the
ordinary workspace gate.

## Live Messaging And Model Acceptance

With an authorized test profile and user-provided credentials:

1. Enable the native plugin; verify all four skills and native tool availability.
2. CLI: dry-run initialization, explicitly confirm writes, load once, focused load,
   dd:no-load for one request, explicit/fuzzy references and document clarification.
3. Gateway: operator-configure roots and platform:sender grants. Reject unauthorized
   labels and unbound dotdotgod repository work. Before selection, verify ordinary
   tools remain available; with empty grants only dotdotgod initialization works,
   without enabling other dotdotgod tools. Select roots in two concurrent chats.
4. Confirm separate context session IDs; resume one without changing the other.
   Same-root sessions may share project DB data but not mutable connection IDs.
5. Edit a disposable file; verify a covered commit/test command is denied. Check
   impact for a subset, then the remainder; verify allow and subsequent re-edit deny.
   Failed checks must not clear pending state. Do not perform real publication.
6. Delegate a scoped task using native delegate_task. Confirm child root inheritance,
   separate context connection, changed-file visibility and revocation handling.
7. Interrupt a long execute call, cancel ingestion, reconnect and restore a session.
   Confirm uncertain writes are not automatically replayed and load reassesses.
8. Test missing Node/CLI/embedding runtime, changed grants and root symlink escape.
   Preserve explicit repair/install/purge confirmations and host approvals.
9. Verify unknown shell/patch/plugin paths and host timeout behavior are described
   as limitations, not a bypass-proof sandbox.

External messaging and model-driven acceptance needs credentials and is not
claimed by the offline installed-hook smoke. Desktop and remote/container path
translation remain outside the supported release scope.
