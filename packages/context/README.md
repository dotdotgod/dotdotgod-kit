# @dotdotgod/context

Local-first execution and retrieval runtime for dotdotgod adapters.

The package exposes a stdio MCP server and shared core modules. Claude Code and Codex load the server through their adapter packages. Pi uses the shared modules through native extension tools rather than starting the MCP server.

## Tools

- `execute`, `batch_execute`, `execute_file`
- `index`, `search`, `fetch_and_index`
- `stats`, `doctor`, `purge`
- `dotdotgod_project_load`, `dotdotgod_project_impact`, `dotdotgod_project_initialize`

Large command output is captured in temporary files and indexed into a project-local SQLite FTS5 store under `.dotdotgod/context/`. The raw output is not returned before output policy filtering.

```bash
dotdotgod-context
```
