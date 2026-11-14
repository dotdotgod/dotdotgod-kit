# Release 0.9.0

## Plan Mode

Keep existing /dd:plan, pi --dd-plan and native hc interfaces. No policy or child
management slash commands are added. Unknown simple inspections, including
hc --skill, offer deny/once/session approval; unsafe shell forms, implementation
commands and unclassified tool operations remain unavailable during planning.

Existing config supports command allow/deny rules and Markdown planning paths.
Trusted project policy requires exact-revision activation in context. No plugin
config writer is provided. Default planning/report roots replace unrestricted
Markdown writes; additional eligible targets require approval. Legacy writablePaths
remains ignored. Existing users may encounter new prompts or narrower permissions.

Local native hc planning launches inherit a fixed parent ceiling through an audited
Pi bootstrap and authenticated IPC. Restrictions must be ready before managed work
is delivered; load/verification failure gets no task and scoped cleanup. Native
hc lifecycle calls target registered children only. Reload ends inherited runs.

## Limits

Trusted-plugin workflow enforcement is not an OS sandbox. Prepared/in-flight effects
cannot be rolled back. Initial inherited launch supports local POSIX, a constrained
native hc/Pi argument shape and an audited loadout; custom provider extensions are
not automatically loaded. Unavailable providers fail without model fallback.
Stateful hc through MCP is denied; unknown MCP commands are once-only because the
separate execution environment is not attested. Full live model task/reload/UI
acceptance remains partial, distinct from automated tests and startup smoke.

## Verification and Distribution

Workspace verification passed including Pi 225 tests, syntax/type/resource checks,
generated-resource/runtime parity and all package checks. Isolated interactive Pi
hc run/get/kill/rm startup/readiness/cleanup passed without a model task. Release
preflight repeats verification and packaging after version alignment.

All eight public npm packages, workspace packages and Obsidian metadata align to
0.9.0. Obsidian has no feature-specific changes beyond synchronized metadata;
minimum application version remains 1.14.5. Publication, GitHub artifacts and
attestations must be checked against their services, not inferred from local builds.
