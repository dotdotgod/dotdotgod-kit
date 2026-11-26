# Hermes Adapter

## Scope

The Hermes adapter supports CLI and messaging-gateway project memory without
Plan Mode. Native plugin tools and hooks route context operations through an
adapter-owned stdio MCP client per selected project/host session.

Historical host pin: `19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9` (verified to support
`post_tool_call` in `VALID_HOOKS`). Compatibility evidence covers the real
loader/registry/hooks and generated runtime; external messaging/model API calls
and complete model-driven delegation are separate live checks.

## Installation And Routing

`dotdotgod adapter install hermes` places `plugin.yaml`, `__init__.py`, and the
Python runtime under `~/.hermes/plugins/dotdotgod/` without editing `config.yaml`.
Run the reported host enable command and restart. Three canonical generated skills
are registered: `project-initializer`, `project-load`, and `impact-review`.
The [optional skills](cli/ADAPTER.md#optional-skills) install separately from the
plugin files. The Python client launches the shared CLI via `mcp-bridge` and
needs no Python MCP package. There is no profile-wide `mcp.json` server declaration.

Configured roots map convenient labels to absolute local directories. Every
platform may select a configured label or any existing absolute directory through
`select_root`. Legacy `gateway_access` is ignored: dotdotgod does not provide
repository or filesystem-area authorization. Host permissions and OS isolation
are responsible for access, including gateway deployments. Before selection,
dotdotgod is inactive and ordinary host tools remain available under host
permissions without dotdotgod path rewriting or advisory impact tracking. There
is no mandatory selection/load instruction. Selection and initialization are
available without a selected project, even without configured labels; other
project/context tools need a routing root. Initialization requires an explicit
absolute path to an existing directory, defaults to dry-run, and requires
`confirmWrite` for writes using a disposable client without persisting selection.
Host session IDs are optional bookkeeping, not admission credentials. Unknown
IDs create routing state on demand; missing IDs use disposable clients and never
inherit another conversation's selection. Tools may run before a pre-LLM event.
Explicit load roots take precedence; otherwise `cli_root` or the launch
directory supplies the default for unbound dotdotgod calls. Anonymous selections
are not persisted. The selected label or absolute path persists for identified
conversations and is resolved on restore without a sender/principal authorization
check. Relative native file paths and terminal workdir default to the selected
root; explicit external paths are allowed. Host shell policy remains separate.

Each host session gets a lazily opened client/server pair. Same-repository SQLite
storage is shared, but mutable connection session IDs are not. Explicit context
`session_resume` affects only that connection, including its reconnect identity.
Explicit `project_load` root changes replace that session's routing connection
and reset load assessment. These IDs and scope filters are not authentication or
project-data ACLs.

## Load And References

In initialized selected repositories, `before_llm` offers non-forcing
`advisory` guidance by default without rewriting user text/images. `always`
offers a one-time baseline-load hint. `manual` or request-local `/dd:no-load`
suppresses automatic load guidance. With `mode: "model"`, the shared CLI's
`hook hermes decision` command runs triage outside the Python runtime lock with a 25-second
subprocess timeout. See [Decision Config](DECISION_CONFIG.md).

The in-memory `Session` owns load state (including completion, skip count, and
last prompt hash), not SQLite. `select_root` or an explicit load that changes
the root resets it. Restored routing does not restore completion after a process
restart. An explicit load or reselection supersedes any in-flight decision.

Full load uses canonical map depth 5. Focused load uses map depth 3 and up to 30
query hits. CLI/query failure falls back to baseline README routing without
automatic installation. Reference expansion supplies bounded explicit/fuzzy
evidence and can use allowlisted decision refs as additional non-authoritative
seeds. Prefetch already expands its refs read-only, so the hook skips its normal
expansion for that turn. Hermes uses native ephemeral context, not Pi's TUI.

## Context Results And Lifecycle

The adapter exposes the shared 19-tool context/project catalog names in the
dotdotgod toolset, plus `select_root`: twenty unique native registrations. Hermes
provides its selected-repository `impact_status` instead of registering the
shared catalog entry twice. Names have no `dotdotgod_` prefix or compatibility
aliases.

Native handlers return a JSON envelope with `content` and `structuredContent`.
Shared MCP responses remain unchanged; native `project_load` uses the canonical
map/query contract. Markdown is not parsed as JSON. Existing execution flags,
errors, source IDs, limits, ordering, confirmations, and graph-impact
presentation remain.

Each bridge serializes its own calls. Normal turn completion retains the
connection/jobs. Interrupt closes it; finalize/reset releases it. Transport
failures are not replayed automatically. A later call may reconnect. In-flight
limits are 660 seconds at MCP and 690 seconds at the bridge; cancellation kills
the local process group after sending SDK cancellation for detached commands.
Forced transport loss cannot guarantee termination of detached commands, so never
replay uncertain calls. Cleanup is POSIX-tested; Windows is unverified. Python
bridge diagnostics retain an 8,000-character stderr tail; this does not change
shared command-capture limits or result data.

## Impact And Delegation

Hermes uses Path 1 non-blocking advisory impact backed by shared
`.dotdotgod/context/impact.sqlite` v3 for Python `sqlite3` and Node `ImpactState`
interop. Writes add the same `load_state` DDL and purge expired rows from all
three tables under the fixed, non-sliding 24-hour TTL. Hermes does not use that
table as its load state source of truth. `write=False` makes zero WAL/DDL writes
and does not create the database. The reserved `default` session ID is rejected
case-insensitively. See [schema](ADVISORY_IMPACT.md#schema-v3-and-delivery-cadence)
and [retention](CONTEXT_RETENTION.md).

- `post_tool_call` observes successful native `write_file`, `file_write`,
  `file_edit`, and `patch` (both `path` and V4A multi-file `patch` headers)
  edits inside the selected repository and marks them under a principal-derived
  `impact_key` (`sha256(principal + "\0" + session_id + "\0" + root)`).
- Excluded paths match the shared contract: paths outside canonical root,
  `node_modules`, `.git`, `.dotdotgod`, `dist`, `build`, `coverage`, and
  `<docRoot>/(plan|archive)` (resolved safely from `dotdotgod.config.json`
  `documentation.root`, default `docs`); `<docRoot>/post` remains tracked.
  Failed tool calls (`status != "ok"`, `error`, `is_error`, `isError`,
  `ok === false`) add nothing.
- `project_impact` passes the fixed `impact_key` as `contextSessionId` so the
  shared Node MCP `withImpactReview` clears only successfully reviewed, unchanged
  revisions. Failed reviews and re-edits remain pending.
- `impact_status` is read-only (bounded `limit` 1..50) and returns the aligned
  shared schema `{ ok, count, pending: [{ path }], truncated }`.
- `before_llm` emits an ephemeral per-turn `impactReminder` advisory while
  `count > 0` (degrading safely with masked stderr and no raw error message in
  prompt context if status fails).
- **Non-blocking policy**: all legacy blocking gates (`before_tool` deny,
  `before_tool` exception-to-block, and `execute`/`execute_file`
  `PermissionError`) are removed. `before_tool` only rewrites relative native
  file arguments to the selected root and fails open on error. Pending impact
  never blocks shell commands, `execute`, `execute_file`, interactive processes,
  or edits.

Hermes `delegate_task` remains host-owned. A subagent `before_llm` event may
inherit an available parent's root with a separate client; missing parents and
changed sender identities do not deny calls. Children may select their own
routing root. Ordinary host tools without known project state pass through
unchanged, including nested calls with `task_id` but no `session_id`; host
policy remains authoritative. Keep host approvals and OS isolation; no host
memory, compaction, planning UI, or `pi-subagents` implementation is replaced.

## Verification

Python stdlib regressions exercise registration, unrestricted project routing,
concurrent clients, same-root session filtering, explicit resume/reconnect,
conservative load restore/opt-out, reference fallback, `post_tool_call` edit
tracking, Python/Node `impact.sqlite` v3 interop, aligned `impact_status`,
MCP `project_impact` clearance/failure/re-edits, non-blocking execution under
pending impact, delegation identity, and interruption with real generated Node
processes. Resource checks validate generated skills and absent Plan Mode. The
opt-in pinned-host smoke loads a CLI-rendered plugin in an isolated real
`PluginManager` profile and tests CLI/gateway hook delivery, concurrent roots,
and advisory impact mark/remind/clear/re-edit without blocking or remote
mutations.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/assets/adapters/hermes/__init__.py](../../packages/cli/assets/adapters/hermes/__init__.py)
  - [packages/cli/assets/adapters/hermes/plugin.yaml](../../packages/cli/assets/adapters/hermes/plugin.yaml)
  - [packages/cli/assets/adapters/hermes/runtime.py](../../packages/cli/assets/adapters/hermes/runtime.py)
  - [packages/cli/assets/adapters/hermes/impact.py](../../packages/cli/assets/adapters/hermes/impact.py)
  - [packages/cli/assets/adapters/hermes/proxy.py](../../packages/cli/assets/adapters/hermes/proxy.py)
  - [packages/cli/assets/adapters/hermes/policy.py](../../packages/cli/assets/adapters/hermes/policy.py)
  - [packages/cli/src/context/mcp-bridge.mjs](../../packages/cli/src/context/mcp-bridge.mjs)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
  - [packages/cli/src/adapters/hosts/hermes.mjs](../../packages/cli/src/adapters/hosts/hermes.mjs)
  - [packages/cli/src/context/hermes-decision.mjs](../../packages/cli/src/context/hermes-decision.mjs)
- Verified by:
  - [packages/cli/test/adapters/hermes/test_runtime.py](../../packages/cli/test/adapters/hermes/test_runtime.py)
  - [packages/cli/test/adapters/hermes-resources.test.mjs](../../packages/cli/test/adapters/hermes-resources.test.mjs)
  - [packages/cli/test/adapters/hermes/pinned_host_smoke.py](../../packages/cli/test/adapters/hermes/pinned_host_smoke.py)
  - [docs/test/HERMES_ADAPTER.md](../test/HERMES_ADAPTER.md)
- Related docs:
  - [docs/spec/CROSS_AGENT_SUPPORT.md](CROSS_AGENT_SUPPORT.md)
  - [docs/spec/ADVISORY_IMPACT.md](ADVISORY_IMPACT.md)
  - [docs/spec/LOAD_PROJECT.md](LOAD_PROJECT.md)
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/TOOL_RESPONSES.md](TOOL_RESPONSES.md)
  - [docs/spec/DECISION_CONFIG.md](DECISION_CONFIG.md)
  - [docs/spec/CONTEXT_RETENTION.md](CONTEXT_RETENTION.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
- Contracts:
  - `HERMES-ROUTING-001` — CLI and gateway sessions use project-routed MCP connections without filesystem-area authorization or Plan Mode (sections: 2, implementedBy: 3, verifiedBy: 2)
  - `HERMES-IMPACT-001` — Observed edits record non-blocking advisory pending impact in shared impact.sqlite with aligned status and MCP review clearance (sections: 1, implementedBy: 3, verifiedBy: 2)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/assets/adapters/hermes/__init__.py","packages/cli/assets/adapters/hermes/plugin.yaml","packages/cli/assets/adapters/hermes/runtime.py","packages/cli/assets/adapters/hermes/impact.py","packages/cli/assets/adapters/hermes/proxy.py","packages/cli/assets/adapters/hermes/policy.py","packages/cli/src/context/mcp-bridge.mjs","scripts/generate-adapters.mjs","packages/cli/src/adapters/hosts/hermes.mjs","packages/cli/src/context/hermes-decision.mjs"],"verifiedBy":["packages/cli/test/adapters/hermes/test_runtime.py","packages/cli/test/adapters/hermes-resources.test.mjs","packages/cli/test/adapters/hermes/pinned_host_smoke.py","docs/test/HERMES_ADAPTER.md"],"relatedDocs":["docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/ADVISORY_IMPACT.md","docs/spec/LOAD_PROJECT.md","docs/spec/CONTEXT_EXECUTION.md","docs/spec/TOOL_RESPONSES.md","docs/spec/DECISION_CONFIG.md","docs/spec/CONTEXT_RETENTION.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"],"contracts":[{"id":"HERMES-ROUTING-001","title":"CLI and gateway sessions use project-routed MCP connections without filesystem-area authorization or Plan Mode","sections":["Installation And Routing","Context Results And Lifecycle"],"implementedBy":["packages/cli/assets/adapters/hermes/__init__.py","packages/cli/assets/adapters/hermes/runtime.py","packages/cli/assets/adapters/hermes/proxy.py"],"verifiedBy":["packages/cli/test/adapters/hermes/test_runtime.py","packages/cli/test/adapters/hermes/pinned_host_smoke.py"]},{"id":"HERMES-IMPACT-001","title":"Observed edits record non-blocking advisory pending impact in shared impact.sqlite with aligned status and MCP review clearance","sections":["Impact And Delegation"],"implementedBy":["packages/cli/assets/adapters/hermes/runtime.py","packages/cli/assets/adapters/hermes/impact.py","packages/cli/assets/adapters/hermes/policy.py"],"verifiedBy":["packages/cli/test/adapters/hermes/test_runtime.py","packages/cli/test/adapters/hermes/pinned_host_smoke.py"]}]}
```
