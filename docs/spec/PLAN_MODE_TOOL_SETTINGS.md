# Plan Mode Tool Settings

## Purpose

Plan Mode keeps a conservative default tool surface, but users can opt into additional installed tools when a project or local workflow needs them.

## Setting

`--plan-extra-tools` accepts a comma-separated list of extra tool names:

```bash
pi --dd-plan --plan-extra-tools mcp__dotdotgod_context__search,mcp__dotdotgod_context__stats
```

Behavior:

- The default Plan Mode tool list applies when the setting is absent.
- Extra tool names are appended after the default Plan Mode tools.
- Duplicate names are deduplicated while preserving order.
- Invalid tool-name tokens are ignored.
- Tool names that are not installed in the current Pi session are ignored.
- The resolved active tool list is used both for `pi.setActiveTools()` and for the hidden full Plan Mode prompt.

This lets users opt into installed read-oriented tools without expanding the default surface. Discover exact host-qualified MCP names; forwarding aliases are not registered. Extra tools remain subject to Plan Mode command and mutation guards; adding execute_file does not authorize it while planning.

MCP executor environments are not attested: unknown commands are non-reusable and once-only, not session/persistent grants. Verified built-in safe reads remain allowed.

## Planning Document Writes

Built-in roots are `docs/plan/**` and `docs/archive/report/**`, including routing README files. Activated project metadata may select active-task-intent roots or `documentation.root/plan` and the corresponding report/archive routing paths. Unactivated projects use built-in roots only.

Additional eligible Markdown targets offer deny/once/session approval for that exact canonical planning edit/write target. No sibling or implementation permission is implied. Source/config, host instructions (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.pi/**`) and escaping symlinks remain denied. Shell moves/deletions and arbitrary directory creation require execution mode. These trusted workflow controls are not a filesystem sandbox.

`planMode.commands` contains exact `{effect, executable, args, cwd}` rules; `markdown.allow/deny` use exact paths or terminal `/**` subtrees. Empty allow lists add no paths; denies can exclude defaults. User and activated project additions are additive, with deny precedence. Legacy `writablePaths` is ignored. CLI config output shows project data, not Pi trust.

Edit `planMode` manually through the existing user/project configuration; no `/dd:plan-policy` command or general policy editor is provided. In-context activation still binds the exact trusted project revision separately from individual command grants. Project changes require activation again. Headless operation cannot create new approvals or activate new project policy.

## Remembered Command Approvals

Eligible native commands additionally offer **Always allow this project** and **Always allow all projects**, after Deny, Allow once and Allow same invocation this session. Unsupported targets omit persistent choices with an explanation; unattested MCP and non-default execution contexts remain once-only. Markdown approvals remain deny/once/session.

Remembered command approvals belong to the local user, not the team, and use a dedicated `~/.dotdotgod/plan-approvals/grants.json` store without editing user/project policy configuration. Project scope binds the canonical project root. Global scope matches the same identified execution target, exact ordered arguments and project-relative working directory across projects; it is not executable-name-wide or any-directory approval.

Recheck identified executable/script contents before reuse; changes require approval again. Supported directly executed scripts require a single absolute shebang interpreter without arguments, resolved to an identifiable native binary; env indirection and nested script interpreters are unsupported. Native format recognition is conservative and host-specific (Linux ELF or macOS Mach-O). Unidentified targets have no persistent choice, and existing prohibited interpreter/package execution is not reopened. This practical identity contract does not verify every dynamic import, external configuration or environment-dependent behavior; it is not a sandbox or a guarantee that unchanged command text has unchanged effects. Pi's shared impact and memory configuration modules come from `@dotdotgod/cli`; the consolidated dependency does not change Plan Mode's tool gates.

Successful atomic save commits consent before execution admission. Earlier save errors deny with no implicit once fallback; a subsequent execution error does not revoke committed consent. Cancellation, unavailable UI and stale context create no new grant. Explicit denies, prohibited operations, host permissions and fixed child ceilings remain authoritative. Managed children do not load, create or inherit these remembered grants.

To revoke, stop Pi sessions sharing this home, securely back up the dedicated store, remove the matching records (or only this dedicated file to revoke all), then restart. Never remove unrelated user/project configuration. Busy or invalid storage errors are visible, not silently treated as an empty store. The private directory is mode 0700 and grant file 0600; an existing non-writable-by-others 0755 shared parent is allowed. A crashed writer can leave `grants.json.lock`: remove it only after confirming no writer remains. The file contains opaque `project:`/`global:` digest records, not raw arguments or human-readable command metadata; selective removal requires knowing the matching record, otherwise revoke all. Atomic rename is the commit boundary, not a power-loss durability guarantee. Secret-like arguments are redacted and limited to one-time approval; detection is heuristic, not a general secret scanner. Revocation prevents future reuse, not already admitted work.


## Prompt Requirements

The full Plan Mode prompt renders the resolved active tool list; prompts distinguish default roots and explicit extra planning targets from implementation authority and use the configured documentation root for routing. `--dd-plan` startup restriction wins over restored off/executing state. Managed child startup additionally requires verified plugin readiness before parent task delivery; see [tool policy](plan-mode/TOOL_POLICY.md).

The managed loadout does not discover custom-provider extensions. A selected model requiring one may fail startup/readiness: deliver no task, report failure and clean up the run. Never silently substitute another model or unrestricted launch.

The prompt must not contradict Plan Mode permissions. It should clearly distinguish forbidden source/code/config mutation from allowed durable plan/archive markdown updates.

The prompt should prefer already-loaded project memory and documentation maps before asking the agent to re-read baseline docs.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../packages/pi/extensions/plan-mode/utils.ts)
  - [packages/pi/extensions/plan-mode/runtime/paths.ts](../../packages/pi/extensions/plan-mode/runtime/paths.ts)
  - [packages/pi/extensions/plan-mode/tools.ts](../../packages/pi/extensions/plan-mode/tools.ts)
  - [packages/pi/extensions/plan-mode/prompts.ts](../../packages/pi/extensions/plan-mode/prompts.ts)
  - [packages/pi/extensions/plan-mode/policy/runtime.ts](../../packages/pi/extensions/plan-mode/policy/runtime.ts)
  - [packages/pi/extensions/plan-mode/policy/markdown.ts](../../packages/pi/extensions/plan-mode/policy/markdown.ts)
  - [packages/pi/extensions/plan-mode/policy/storage.ts](../../packages/pi/extensions/plan-mode/policy/storage.ts)
  - [packages/pi/extensions/plan-mode/policy/durable.ts](../../packages/pi/extensions/plan-mode/policy/durable.ts)
  - [packages/pi/extensions/plan-mode/policy/admission.ts](../../packages/pi/extensions/plan-mode/policy/admission.ts)
  - [packages/pi/extensions/plan-mode/policy/native-binary.ts](../../packages/pi/extensions/plan-mode/policy/native-binary.ts)
  - [packages/pi/extensions/plan-mode/policy/ui.ts](../../packages/pi/extensions/plan-mode/policy/ui.ts)
- Verified by:
  - [packages/pi/test/plan-mode-extension.test.ts](../../packages/pi/test/plan-mode-extension.test.ts)
  - [packages/pi/test/plan-mode-utils.test.ts](../../packages/pi/test/plan-mode-utils.test.ts)
  - [packages/pi/test/context-execution-gates.test.ts](../../packages/pi/test/context-execution-gates.test.ts)
  - [packages/pi/test/plan-mode-policy-review.test.ts](../../packages/pi/test/plan-mode-policy-review.test.ts)
  - [packages/pi/test/plan-mode-policy-storage.test.ts](../../packages/pi/test/plan-mode-policy-storage.test.ts)
  - [packages/pi/test/plan-mode-policy-runtime.test.ts](../../packages/pi/test/plan-mode-policy-runtime.test.ts)
  - [docs/test/README.md](../test/README.md)
  - [packages/pi/test/plan-mode-durable.test.ts](../../packages/pi/test/plan-mode-durable.test.ts)
  - [packages/pi/test/plan-mode-durable-boundaries.test.ts](../../packages/pi/test/plan-mode-durable-boundaries.test.ts)
  - [packages/pi/test/plan-mode-admission-handlers.test.ts](../../packages/pi/test/plan-mode-admission-handlers.test.ts)
- Related docs:
  - [docs/spec/PLAN_MODE.md](PLAN_MODE.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts","packages/pi/extensions/plan-mode/runtime/paths.ts","packages/pi/extensions/plan-mode/tools.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/policy/runtime.ts","packages/pi/extensions/plan-mode/policy/markdown.ts","packages/pi/extensions/plan-mode/policy/storage.ts","packages/pi/extensions/plan-mode/policy/durable.ts","packages/pi/extensions/plan-mode/policy/admission.ts","packages/pi/extensions/plan-mode/policy/native-binary.ts","packages/pi/extensions/plan-mode/policy/ui.ts"],"verifiedBy":["packages/pi/test/plan-mode-extension.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/context-execution-gates.test.ts","packages/pi/test/plan-mode-policy-review.test.ts","packages/pi/test/plan-mode-policy-storage.test.ts","packages/pi/test/plan-mode-policy-runtime.test.ts","docs/test/README.md","packages/pi/test/plan-mode-durable.test.ts","packages/pi/test/plan-mode-durable-boundaries.test.ts","packages/pi/test/plan-mode-admission-handlers.test.ts"],"relatedDocs":["docs/spec/PLAN_MODE.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}
```
