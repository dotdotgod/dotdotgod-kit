## Goal

Create a non-destructive dotdotgod baseline with canonical agent instructions, thin agent entrypoints, documentation indexes, project config, and local-memory ignore rules.

## Workflow

1. Inspect existing agent instructions, documentation, config, and ignore rules; preserve existing files and unrelated user work.
2. Run `dotdotgod init <project-root>` when available; otherwise run `{{INIT_SCRIPT_COMMAND}}`. Existing files must be skipped, not replaced.
3. Validate the initialized project with `dotdotgod validate <project-root>` when available.
4. Report created and skipped files, validation failures, and unresolved instruction conflicts.
