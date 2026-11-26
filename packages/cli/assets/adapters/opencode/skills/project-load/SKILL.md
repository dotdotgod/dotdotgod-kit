---
name: project-load
description: Load or refresh project memory and focused documentation/code search.
---

# Project Load

Use the dotdotgod_context MCP server for project load, initialization, graph impact, execution and indexed retrieval. Discover its exact tool names in OpenCode Code Mode; inspect MCP isError and structuredContent and every execution results entry. For unknown output size use execute with a commands array and outputMode auto; search indexed.id with bounded source-scoped search. Run ancillary CLI checks through MCP execute rather than a duplicate native service. Keep direct read for short located source and images. Pending impact is advisory, never an execution gate. Preserve host permissions. Use the native plan agent, not dd:plan; concrete plans are automatically maintained in docs/plan/<task-slug>/README.md without a separate save request.

## Goal

Load the repository's dotdotgod project memory without modifying maintained files. Treat free-form arguments as query text, not mode switches.

## Workflow

1. Identify the repository root. Expose `Help: dotdotgod --help` as optional CLI discovery guidance without checking or reporting installation status, and do not require Help execution for Load to continue.
2. When baseline context is missing, read `AGENTS.md`, the adapter entrypoint, `README.md`, and `docs/README.md` when present.
3. Without arguments, prefer the host's dotdotgod MCP `project_load` tool with no focus and `maxDepth: 5`. Use its configured prefix-compressed documentation tree. The map owns `documentation.root`, `load.documentationSummary.exclude`, deterministic Markdown discovery, and boundary summaries.
4. With arguments, call project_load with the arguments as `focus`, `limit: 30`, and `maxDepth: 3`. Use the configured tree and at most 30 documentation-file or code-symbol results. Check `isError`, `structuredContent.ok`, and retrieval warnings.
5. If MCP is unavailable or project_load reports mapUnavailable, continue with README routing.
6. If no configured map is available, preserve Load behavior by building the same tree from the configured documentation root when known, excluding local memory, and using README routing. At the depth boundary, list every direct Markdown file and immediate child directory, then summarize hidden descendants separately under each named child with exact recursive directory and Markdown-file counts.
7. Query searches full documentation content and code outlines/comments, not implementation bodies. Preserve result kind, source ranges and retrieval warnings; verify source freshness before reading a symbol's implementation. Read bodies selectively from query results, explicit paths, and README indexes. Read relevant active plans only when needed, use `docs/archive/README.md` (or the configured archive `README.md` under an alternate documentation root) as the history map, and avoid broad generated, dependency, cache, or secret reads.

## Output

Report the project purpose, key rules, relevant documentation routes, and only the active-plan or next-read hints needed for the request. Keep compact loads to a brief refresh.
