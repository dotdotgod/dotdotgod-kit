# CLI Interface

## Purpose

This compatibility route preserves the historical `docs/spec/CLI_INTERFACE.md` entrypoint while the CLI command contracts live in focused files under `docs/spec/cli/`.

Use the focused specs for behavior changes:

- [`cli/DISCOVERY.md`](cli/DISCOVERY.md): top-level help/version, subcommand help, command side-effect boundaries, unknown commands, and validation budget override flags.
- [`cli/GRAPH_IMPACT.md`](cli/GRAPH_IMPACT.md): `dotdotgod graph impact` required arguments, output modes, structured failures, and unsupported graph subcommands.
- [`cli/TRACEABILITY_LINKS.md`](cli/TRACEABILITY_LINKS.md): `dotdotgod traceability links` help, check, write, JSON output, and generated-region repair behavior.
- [`cli/PLAN_COMMANDS.md`](cli/PLAN_COMMANDS.md): `dotdotgod plan validate` and `dotdotgod plan stage create` behavior for simplified Plan Generator stages.

## Compatibility Contract

- Existing links to `docs/spec/CLI_INTERFACE.md` remain valid and route readers to the split CLI spec domain.
- New CLI behavior contracts should be added to a focused file under `docs/spec/cli/` instead of expanding this route document.
- Traceability for this route points to the focused CLI spec files, package README, and CLI verification doc.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [docs/spec/cli/DISCOVERY.md](cli/DISCOVERY.md)
  - [docs/spec/cli/GRAPH_IMPACT.md](cli/GRAPH_IMPACT.md)
  - [docs/spec/cli/TRACEABILITY_LINKS.md](cli/TRACEABILITY_LINKS.md)
  - [docs/spec/cli/PLAN_COMMANDS.md](cli/PLAN_COMMANDS.md)
- Verified by:
  - [docs/test/CLI_INTERFACE.md](../test/CLI_INTERFACE.md)
- Related docs:
  - [docs/spec/cli/README.md](cli/README.md)
  - [packages/cli/README.md](../../packages/cli/README.md)
  - [docs/test/README.md](../test/README.md)
  - [docs/spec/PROJECT_INITIALIZER.md](PROJECT_INITIALIZER.md)
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
  - [docs/spec/VALIDATION_CONFIG.md](VALIDATION_CONFIG.md)
  - [docs/spec/REFERENCE_EXPANSION.md](REFERENCE_EXPANSION.md)
- Verification commands:
  - `node packages/cli/bin/dotdotgod.mjs traceability links . --check --json`
  - `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["docs/spec/cli/DISCOVERY.md","docs/spec/cli/GRAPH_IMPACT.md","docs/spec/cli/TRACEABILITY_LINKS.md","docs/spec/cli/PLAN_COMMANDS.md"],"verifiedBy":["docs/test/CLI_INTERFACE.md"],"relatedDocs":["docs/spec/cli/README.md","packages/cli/README.md","docs/test/README.md","docs/spec/PROJECT_INITIALIZER.md","docs/spec/CONFIG_COMMAND.md","docs/spec/VALIDATION_CONFIG.md","docs/spec/REFERENCE_EXPANSION.md"],"verificationCommands":["node packages/cli/bin/dotdotgod.mjs traceability links . --check --json","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index"]}
```
