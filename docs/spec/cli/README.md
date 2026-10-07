# CLI Specs

Focused behavior contracts for the `dotdotgod` command-line interface.

Use these files instead of the legacy monolithic `docs/spec/CLI_INTERFACE.md` when changing or verifying one CLI surface:

- `DISCOVERY.md`: top-level help/version, subcommand help, command side-effect boundaries, unknown commands, and validation budget override flags.
- `GRAPH_IMPACT.md`: `dotdotgod graph impact` seed/result behavior and output modes plus the local `graph serve` impact explorer contract.
- `MAP.md`: shared read-only documentation discovery, depth-bounded tree rendering, human/JSON output, and structured failures.
- `QUERY.md`: hybrid full-document/code-outline retrieval, scopes, consent, ranking and output.
- `CODE_OUTLINES.md`: parser coverage, symbol/comment metadata, graph edges and read-only freshness validation.
- `TRACEABILITY_LINKS.md`: `dotdotgod traceability links` help, check, write, JSON output, and generated-region repair behavior.

`../CLI_INTERFACE.md` remains as a compatibility route for older references and points to this domain directory.
