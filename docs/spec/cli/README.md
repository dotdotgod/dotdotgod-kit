# CLI Specs

Focused behavior contracts for the `dotdotgod` command-line interface.

Use these files instead of the legacy monolithic `docs/spec/CLI_INTERFACE.md` when changing or verifying one CLI surface:

- `DISCOVERY.md`: top-level help/version, subcommand help, command side-effect boundaries, unknown commands, and validation budget override flags.
- `GRAPH_IMPACT.md`: `dotdotgod graph impact` required arguments, output modes, structured failures, and unsupported graph subcommands.
- `TRACEABILITY_LINKS.md`: `dotdotgod traceability links` help, check, write, JSON output, and generated-region repair behavior.
- `PLAN_COMMANDS.md`: `dotdotgod plan validate` and `dotdotgod plan stage create` behavior for simplified Plan Generator stages.

`../CLI_INTERFACE.md` remains as a compatibility route for older references and points to this domain directory.
