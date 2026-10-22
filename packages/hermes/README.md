# @dotdotgod/hermes

Hermes CLI and messaging-gateway project memory adapter, without Plan Mode.
Target host revision: `19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9`.

## Installation

Requires Python 3.11+ (use the host's supported Python version), Node 22.19+,
Git for impact tracking, and an explicitly enabled native Hermes plugin.
The installed directory must contain plugin.yaml and __init__.py at its root.

For a source checkout:

```bash
pnpm install
pnpm run generate
mkdir -p "$HOME/.hermes/plugins"
cp -R packages/hermes "$HOME/.hermes/plugins/dotdotgod"
hermes plugins enable dotdotgod
```

For npm distribution, run npm pack @dotdotgod/hermes@0.6.0 and extract its package
directory into the same native plugin location. npm installation alone does not
activate a Hermes plugin. Generated MCP/CLI/client artifacts are self-contained;
consumer node_modules, a global dotdotgod CLI and Python MCP dependencies are not
required for core operation. Restart Hermes after installation/resource changes.
Do not enable a separate profile-wide dotdotgod MCP server for these tools.

Optional semantic embeddings use the existing explicit installation workflow;
map/README routing works without them. Do not automatically install dependencies.

## Project Routing

Optional project labels can be configured in config.yaml:

```yaml
plugins:
  enabled: [dotdotgod]
  entries:
    dotdotgod:
      settings:
        roots:
          app: /absolute/path/to/app
          docs: /absolute/path/to/docs-project
```

Host session IDs are optional bookkeeping, not permissions. Tools work before
pre-LLM registration. Without an ID, dotdotgod uses a disposable connection with
an explicit load root or cli_root/launch-directory default, never another chat's
selection. Ordinary host tools without known routing state pass through unchanged.
Missing parents and changed senders do not deny tools. Impact interception needs
known project state; nested host calls omitting it cannot be attributed reliably.

Any host session may select a configured label or an existing absolute directory
using select_root. Legacy gateway_access settings are ignored.
Dotdotgod imposes no filesystem-area restrictions. Gateway operators must rely
on host permissions and OS isolation, not plugin labels, for access control.
CLI starts at the launch directory; optional cli_root sets its repository.

One bridge and MCP server are created lazily per selected project/host
session. Same-repository connections share the project SQLite DB, not mutable
connection-session identity. Explicit context session_resume affects only the
caller's connection; its last resumed ID survives transport reconnects.
Selections persist in profile-owned plugin state and are resolved on restore.
Startup/restored sessions conservatively reassess project memory; abandoned
sibling completion is not inherited.

This is routing isolation, not multi-tenant OS isolation. Hermes and enabled
plugins retain host permissions. Sessions using the same repository share
project data; context scope/session filters are not access-control lists.

## Features

- Generated project-initializer, project-load, impact-review and document-clarify
  skills from canonical shared sources.
- Automatic load-required instructions; call project_load once with an
  agent-selected focus and continue the original request. Explicit load uses the
  same tool/skill; full map depth is 5, focused map depth 3 with up to 30 query hits.
- `dd:no-load` in a request skips only that request's automatic load instruction.
- Explicit/fuzzy reference evidence via the bundled CLI; no full auto-validation.
- Native execution/context/operations tools backed by per-session MCP, with shared
  unprefixed catalog names in the dotdotgod toolset and no forwarding aliases.
  They return a JSON envelope with content and structuredContent. Do not parse the
  Markdown content as JSON or assume an unwrapped service-object contract.
- select_root and impact_status are adapter-local tools; the shared impact_status
  entry is not registered twice. There are twenty unique tools. Reload the plugin
  after upgrading and update saved calls; old prefixed names are unsupported.
- Pending impact is derived from Git dirty/untracked fingerprints and durable
  checked fingerprints. Successful checks clear only checked, unchanged paths.
  Source edits reopen pending state; reads and impact checks remain available.
- Native Hermes delegate_task is the delegation mechanism. Child hooks inherit
  an active matching-principal parent's project by default, with a separate
  context connection; impact covers their changes in the shared worktree.

No dedicated planning state, wizard, source-edit approval UI, compaction feature,
Pi TUI implementation, or pi-subagents port is included.

## Gate And Lifecycle Limits

Recognized git commit/push/tag, npm/pnpm/yarn test/verify/build/lint/check/publish/deploy and common
Python/Node test commands are blocked while impact is pending. Execute batches
are checked inside the adapter too. Opaque execute_file calls are blocked while
pending because their effects cannot be inferred safely.

Relative native file paths and terminal workdir default to the selected project;
explicit paths may refer anywhere accessible to the host. This adapter targets local host worktrees, not remote/container path
translation. Shell paths, patch bodies, arbitrary programs and other plugins are
not a filesystem sandbox; keep Hermes's own approvals and OS isolation.
Shell mutations hidden inside one combined mutation/release command are not fully
recognized. Native hooks can fail open under host errors/timeouts; no universal
bypass-prevention claim is made.

Interrupted turns close their context connection without replaying writes.
Finalized/reset sessions release processes. Normal end-of-turn retains connections
and background jobs. Transport failure ends the uncertain call; only a subsequent
user/model call reconnects, with no automatic mutation replay. In-flight requests
have a 660-second MCP and 690-second bridge timeout; cancellation kills the local
process group after sending SDK cancellation so the server can reap detached
command groups. Forced transport loss cannot guarantee termination of all detached
commands; uncertain calls are never replayed. Persisted ingestion jobs retain
shared runtime restart semantics. Cleanup is POSIX-tested; Windows is unverified.

## Verification

```bash
pnpm --filter @dotdotgod/hermes run verify
pnpm --filter @dotdotgod/hermes run pack:dry-run
```

Tests exercise native registration/lifecycle callbacks with host-shaped fixtures
and real generated MCP processes, including concurrent roots/sessions, restore,
reference/load fallback, impact failure/subsets/re-edits and cancellation.
Live pinned host installation and messaging smoke results are recorded separately;
fixture success alone is not a claim that every host lifecycle path was exercised.
