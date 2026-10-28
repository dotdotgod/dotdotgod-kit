# Obsidian Graph Style Proposal

Open `GRAPH_STYLE.figcraft` in FigCraft to review and edit the visual proposal.
`GRAPH_STYLE.png` is the rendered preview. This is not an Obsidian screenshot or
evidence that renderer integration has been implemented.

Regenerate with `node scripts/design-obsidian-graph.mjs`. The CLI defaults to
`~/.local/bin/figcraft-cli`; override it with `FIGCRAFT_CLI` if needed.
`GRAPH_STYLE.commands.json` records the generated editable layer commands.
Regeneration overwrites generated artifacts; save manual edits separately first.

## Review Goals

- Preserve the native graph's circular file-node appearance.
- Use relationship type for edge color and the fixed top legend; relation weight controls line width.
- Show Markdown, code, and test files without proxy Markdown notes.
- Keep relationship text off the graph; retain native file labels.
- Inspect relation source, target, weight, and evidence in a side panel.
- Keep edges continuous with directional arrowheads.
- Highlight the selected relationship and match legend colors and width samples.
- Treat hover states, light theme, and multiple relations per file pair as
  subsequent design work; this board explores the dark static style.

## Copy And Scope

The board intentionally omits speculative search/filter controls and evidence
navigation buttons. It shows no duplicate page title, selected-relation footer,
or persistent implementation disclaimers. The inspector keeps the relationship
identifier, source, target, weight, and the declaring metadata only. Evidence is
illustrative fixture content, not a verified extraction from the project.

The source data and renderer integration remain owned by dotdotgod and the
Obsidian plugin respectively. This design does not add either implementation.
