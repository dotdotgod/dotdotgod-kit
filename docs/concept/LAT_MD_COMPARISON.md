# lat.md and dotdotgod Comparison

lat.md and dotdotgod both treat project memory as version-controlled markdown that coding agents can read, validate, and maintain. They differ mainly in the control model: lat.md builds a section-level knowledge graph, while dotdotgod builds a structured project-memory workflow.

## What lat.md Provides

lat.md is a markdown knowledge graph rooted in a project-level `lat.md/` directory. Its docs describe a graph made of markdown sections, wiki links, and optional source-code backlinks.

Key mechanics:

- `lat.md/` contains architecture, domain, and test-spec markdown files.
- Sections are addressed by file and heading paths such as `auth#OAuth Flow`.
- Wiki links use `[[target]]` or `[[target|alias]]` syntax.
- Markdown can link to code symbols such as `[[src/auth.ts#validateToken]]`.
- Source files can link back with `// @lat: [[section-id]]` or `# @lat: [[section-id]]`.
- `lat check` validates links, code references, and required code mentions.
- `lat search` offers semantic search over sections when an OpenAI or Vercel AI Gateway key is configured.
- `lat expand` expands `[[refs]]` in prompts so agents receive resolved context.
- `lat init` can scaffold the graph and add agent instructions, hooks, and MCP integration.

Its strongest pattern is bidirectional traceability: documentation sections point to code, and code comments can point back to documentation sections.

## Where It Overlaps with dotdotgod

Both projects share the same broad premise: agent memory should be durable, reviewable, and validated instead of living only in chat history.

Common principles:

- project knowledge belongs in markdown under version control;
- agents should read project memory before changing code;
- links and references should be validated;
- architecture, behavior, tests, and implementation should stay connected;
- memory should be usable by both humans and agents;
- retrieval commands should reduce repeated grep-and-guess work.

This makes lat.md closer to dotdotgod than to generated Graphify-style semantic graphs. lat.md's graph is curated markdown, not a generated graph that tries to infer all project meaning after the fact.

## Main Difference

The main difference is where each system puts the durable contract.

| Area | lat.md | dotdotgod |
| --- | --- | --- |
| Primary artifact | `lat.md/` section graph | `AGENTS.md` plus structured `docs/` memory areas |
| Organization | Flexible markdown sections and wiki links | `docs/spec`, `docs/arch`, `docs/test`, `docs/plan`, `docs/archive`, and concept docs |
| Source traceability | Inline `@lat:` code comments and source-symbol wiki links | Traceability blocks, docs indexes, package metadata, imports, tests, and graph extraction |
| Test-spec enforcement | `require-code-mention: true` can require code backlinks from leaf sections | Specs declare `verifiedBy` and `verificationCommands`; validation checks doc contracts and cache/index state |
| Agent startup | `lat search`, `lat expand`, then inspect graph sections | Load bounded snapshot, follow README indexes, inspect relevant docs, then plan scoped work |
| Search model | Exact/fuzzy locate plus semantic search with external key | Local graph/index, bounded snapshots, impact reports, deterministic edges, and demoted semantic-only links |
| Work lifecycle | Keep the graph updated after behavior/architecture/test changes | Maintain active plans in `docs/plan`, archive completed work in `docs/archive`, and keep archive bodies out of default context |
| Code intrusion | Encourages explicit source comments for traceability | Does not require inline source comments by default |

lat.md optimizes for section-level graph navigation and explicit doc/code backlinks. dotdotgod optimizes for a broader agent-memory operating model: canonical rules, behavior specs, architecture rationale, verification knowledge, active plans, archive policy, bounded project loads, and impact analysis.

## Strengths of lat.md

lat.md is compelling when a project wants a lightweight and direct knowledge graph.

Strengths:

- Wiki-link syntax is familiar and easy to maintain.
- Section IDs make project concepts addressable in prompts.
- `lat refs` and `lat section` make concept navigation direct.
- `@lat:` comments provide strong backlinks from code or tests to docs.
- `require-code-mention: true` can enforce test-spec coverage at the documentation layer.
- `lat expand` is a useful prompt-time primitive for agent context.
- MCP and hook integration make the graph part of normal agent workflow.

## Tradeoffs Compared with dotdotgod

lat.md's explicit graph model also introduces tradeoffs.

- Semantic search needs an external model key unless exact/fuzzy lookup is enough.
- `@lat:` source comments can be powerful but may add maintenance overhead or be undesirable in production code.
- A flexible `lat.md/` directory is less opinionated about separating product truth, architecture, verification, active work, and historical archive memory.
- Hook reminders to update docs after every task can become noisy if not tuned.
- It does not appear, from the sourced docs, to define a first-class active plan/archive lifecycle like dotdotgod.

Dotdotgod accepts more initial structure in exchange for predictable memory areas, plan execution state, archive boundaries, local validation, and impact reports that connect changed files to specs, tests, docs, and commands.

## When to Choose Each Model

Use lat.md when the project wants:

- a section-level markdown knowledge graph;
- wiki-link navigation between concepts;
- direct code backlinks with `@lat:` comments;
- prompt expansion through `[[refs]]`;
- semantic section search when an external embedding key is acceptable.

Use dotdotgod when the project wants:

- canonical multi-agent instructions through `AGENTS.md`;
- explicit spec, architecture, test, plan, and archive areas;
- active task plans and completed-work archives;
- bounded project-memory snapshots;
- local validation and cache/index freshness checks;
- impact analysis that surfaces related docs, tests, and verification commands;
- traceability without requiring inline source comments by default.

## Design Lessons for dotdotgod

lat.md suggests useful ideas that fit dotdotgod's direction without replacing its model.

- Dotdotgod already extracts markdown links into its graph and uses README/index links for routing and impact analysis; prompt-time reference expansion can make user-written refs such as `[[PLAN_MODE]]` resolve to bounded context before work begins.
- Section-level lookup commands could complement README-index routing.
- Optional code backlinks may be useful for projects that want stronger traceability than docs-only blocks.
- Agent hook reminders should remain advisory and scoped so documentation updates do not become the only perceived task.

The safest positioning is not "lat.md versus dotdotgod" as mutually exclusive tools. They solve overlapping memory problems with different defaults. lat.md makes project knowledge graph-shaped; dotdotgod makes project execution memory workflow-shaped.

## Sources

lat.md sources:

- <https://github.com/1st1/lat.md>
- <https://lat.md/>
- <https://context7.com/1st1/lat.md/llms.txt>
- <https://github.com/1st1/lat.md/blob/main/AGENTS.md>

Dotdotgod sources:

- [`README.md`](../../README.md)
- [`CONTEXT_CURATION.md`](CONTEXT_CURATION.md)
- [`GRAPHIFY_COMPARISON.md`](GRAPHIFY_COMPARISON.md)
- [`LOAD_PROJECT.md`](../spec/LOAD_PROJECT.md)
