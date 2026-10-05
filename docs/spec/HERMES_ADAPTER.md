# Hermes Adapter

## Scope

The Hermes adapter supports CLI and messaging-gateway project memory without
Plan Mode. Native plugin tools and hooks route context operations through an
adapter-owned stdio MCP client per authorized repository/host session.

Host pin: 19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9. Compatibility evidence covers
the real loader/registry/hooks and generated runtime; external messaging/model
API calls and complete model-driven delegation are separate live checks.

## Installation And Routing

The native plugin directory contains plugin.yaml and __init__.py. Enable it
explicitly and restart the host. Four canonical generated skills are registered:
project-initializer, project-load, impact-review and document-clarify.
Generated server/client/CLI artifacts work without ancestor node_modules or
Python MCP packages. No profile-wide mcp.json server declaration is installed.

Operator roots map labels to absolute local directories. Gateway access maps
platform:sender_id principals to labels. Gateway sessions require explicit
selection via dotdotgod_select_root; missing or changed grants deny access.
The selected label persists in profile-owned plugin state and is reauthorized on
restore. CLI uses cli_root or the launch directory. Raw request arguments cannot
change trusted host-session routing. Native file path arguments and terminal
workdir are checked against the selected root; read tools also allow installed
bundled skill resources. Host shell policy remains separate.

Each host session gets a lazily opened client/server pair. Same-repository SQLite
storage is shared, but mutable connection session IDs are not. Explicit context
session_resume affects only that connection, including its reconnect identity.
These IDs and scope filters are not authentication or project-data ACLs.

## Load And References

Automatic assessment injects a load-required instruction until successful project
load; it does not rewrite user text/images or run broad validation. Requests with
dd:no-load suppress only that request's automatic instruction. Restored sessions
conservatively reassess; completion is never inherited from abandoned siblings.

Full load uses canonical map depth 5. Focused load uses map depth 3 and up to 30
query hits. CLI/query failure falls back to baseline README routing without
automatic installation. Reference expansion supplies explicit/fuzzy bounded CLI
evidence, marked non-authoritative, and falls back visibly when unavailable.
Hermes does not claim Pi's hidden TUI-message or codemode delivery mechanics.

## Context Results And Lifecycle

The adapter exposes the shared 18-tool context/project surface through native
names, plus root selection and pending impact status. Generic MCP tool names map
to dotdotgod names; index/search/stats/doctor/purge/session resume use the
context-prefixed native names. There are no public compatibility aliases.

Native handlers return a JSON envelope with content and structuredContent. Shared
MCP responses remain unchanged; native project-load uses the canonical map/query
contract. Markdown is not parsed as JSON. Existing execution flags, errors,
source IDs, limits, ordering, confirmations and graph-impact presentation remain.

Each bridge serializes its own calls. Normal turn completion retains the
connection/jobs. Interrupt closes it; finalize/reset releases it. Transport
failures are not replayed automatically. A later call may reconnect. In-flight
limits are 660 seconds at MCP and 690 seconds at the bridge; cancellation kills
the local process group after sending SDK cancellation for detached commands.
Forced transport loss cannot guarantee termination of detached commands, so never
replay uncertain calls. Cleanup is POSIX-tested; Windows is unverified.
Python bridge diagnostics retain an 8,000-character
stderr tail; this does not change shared command-capture limits or result data.

## Impact And Delegation

Dirty/untracked Git file fingerprints, excluding ignored caches and local
plan/archive bodies, determine pending impact. Durable checked fingerprints are
shared for the selected worktree. Successful checks clear only requested paths
whose fingerprints still match. Failure, unrequested paths and re-edits remain
pending. dotdotgod_impact_status is read-only and does not clear state.

Known release/test commands are blocked while pending; execute batches check
inside the adapter too. Opaque execute_file and interactive process write/submit
calls are blocked while pending. File paths/terminal workdir are rooted.
Unavailable impact state blocks covered release paths rather than authorizing
unchecked handoff; reads, load, initialization and impact review remain usable.

Hermes delegate_task remains host-owned. A trusted subagent pre-LLM event can
inherit the active parent's authorized root/principal, with a separate client;
children cannot select a different root. Parent revocation/root changes deny
subsequent child access. Shared-worktree fingerprints include delegated edits.

Hooks and command recognition are not an OS sandbox. Arbitrary programs, shell
paths, patch bodies, other plugins and combined mutation/release commands do not
have universal coverage. Host errors/timeouts can fail open. Keep host approvals
and OS isolation; do not claim bypass-proof enforcement or multi-tenant isolation.
No host memory, compaction, planning UI or pi-subagents implementation is replaced.

## Verification

Python stdlib regressions exercise registration, root authorization, concurrent
clients, same-root session filtering, explicit resume/reconnect, conservative load
restore/opt-out, reference fallback, impact failure/subsets/re-edits, delegation
identity, nested gates and interruption with real generated Node processes.
Resource checks validate generated skills and intentionally absent Plan Mode.
The opt-in pinned-host smoke loads an extracted package in an isolated real
PluginManager profile and tests CLI/gateway hook delivery, concurrent roots,
shared-result channels and impact deny/clear/re-edit without remote mutations.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/hermes/__init__.py](../../packages/hermes/__init__.py)
  - [packages/hermes/plugin.yaml](../../packages/hermes/plugin.yaml)
  - [packages/hermes/runtime.py](../../packages/hermes/runtime.py)
  - [packages/hermes/proxy.py](../../packages/hermes/proxy.py)
  - [packages/hermes/policy.py](../../packages/hermes/policy.py)
  - [packages/hermes/mcp/bridge-entry.mjs](../../packages/hermes/mcp/bridge-entry.mjs)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
  - [scripts/build-adapter-runtime.mjs](../../scripts/build-adapter-runtime.mjs)
- Verified by:
  - [packages/hermes/test/test_runtime.py](../../packages/hermes/test/test_runtime.py)
  - [packages/hermes/test/resources.test.mjs](../../packages/hermes/test/resources.test.mjs)
  - [packages/hermes/test/pinned_host_smoke.py](../../packages/hermes/test/pinned_host_smoke.py)
  - [docs/test/HERMES_ADAPTER.md](../test/HERMES_ADAPTER.md)
- Related docs:
  - [docs/spec/CROSS_AGENT_SUPPORT.md](CROSS_AGENT_SUPPORT.md)
  - [docs/spec/LOAD_PROJECT.md](LOAD_PROJECT.md)
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/TOOL_RESPONSES.md](TOOL_RESPONSES.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
- Contracts:
  - `HERMES-ROUTING-001` — CLI and gateway sessions use authorized repository-isolated MCP connections without Plan Mode (sections: 2, implementedBy: 3, verifiedBy: 2)
  - `HERMES-IMPACT-001` — Supported release paths require successful current-fingerprint impact checks (sections: 1, implementedBy: 2, verifiedBy: 2)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/hermes/__init__.py","packages/hermes/plugin.yaml","packages/hermes/runtime.py","packages/hermes/proxy.py","packages/hermes/policy.py","packages/hermes/mcp/bridge-entry.mjs","scripts/generate-adapters.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/hermes/test/test_runtime.py","packages/hermes/test/resources.test.mjs","packages/hermes/test/pinned_host_smoke.py","docs/test/HERMES_ADAPTER.md"],"relatedDocs":["docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/LOAD_PROJECT.md","docs/spec/CONTEXT_EXECUTION.md","docs/spec/TOOL_RESPONSES.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"],"contracts":[{"id":"HERMES-ROUTING-001","title":"CLI and gateway sessions use authorized repository-isolated MCP connections without Plan Mode","sections":["Installation And Routing","Context Results And Lifecycle"],"implementedBy":["packages/hermes/__init__.py","packages/hermes/runtime.py","packages/hermes/proxy.py"],"verifiedBy":["packages/hermes/test/test_runtime.py","packages/hermes/test/pinned_host_smoke.py"]},{"id":"HERMES-IMPACT-001","title":"Supported release paths require successful current-fingerprint impact checks","sections":["Impact And Delegation"],"implementedBy":["packages/hermes/runtime.py","packages/hermes/policy.py"],"verifiedBy":["packages/hermes/test/test_runtime.py","packages/hermes/test/pinned_host_smoke.py"]}]}
```
