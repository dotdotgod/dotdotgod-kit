# Impact Ranking Config Architecture

## Purpose

Impact ranking turns `dotdotgod graph impact` into an explainable retrieval layer for changed-file work. It combines structural graph signals, curated docs traceability, deterministic semantic hints, and memory policy metadata.

## Config Resolution

The CLI reads `impactRanking` from `dotdotgod.config.json` or `.dotdotgodrc.json` alongside memory and traceability policy.

Invalid config is reported by `validate`, but runtime graph commands use defaults so impact reports remain available.

## Ranking Pipeline

1. Build or refresh the indexed project graph.
2. Add deterministic semantic edges from existing graph nodes.
3. Collect direct neighbors and limited expanded neighbors from traceability and semantic relations.
4. Compute changed-file Personalized PageRank over weighted graph edges.
5. Score each related item with `scoreBreakdown`.
6. Sort by `impactScore`, keeping the changed file first.
7. Preserve bounded grouped output and omitted counts.

## Score Components

- `ppr`: normalized changed-file Personalized PageRank.
- `traceability`: curated docs links such as `implemented_by` and `verified_by`.
- `memoryPolicy`: normalized memory-area retrieval priority.
- `verification`: tests and verification commands.
- `proximity`: imports, same-directory, shared imports, routes, commands, and events.
- `semantic`: deterministic lexical/name/heading/symbol/command/event/package hints.
- `freshness`: fresh memory boost or stale memory penalty.
- `archivePenalty`: protects historical archive bodies from default over-retrieval.

## Deterministic Semantic Edges

Semantic edges are generated without embeddings. They derive from:

- path and filename tokens
- markdown headings and anchors
- exported symbols and declarations
- commands and events
- package names, binaries, dependencies, and package resources

Semantic edge metadata records confidence, score, matched terms, and contributing signals. These edges are lower-confidence than curated traceability and have lower relation weights.

Archive bodies are excluded from semantic edge generation by default unless the project explicitly opts in.

## PPR Policy

Personalized PageRank is seeded by the changed file and runs with bounded iterations. The impact graph treats weighted edges as bidirectional for retrieval so incoming traceability can guide source-to-doc impact queries.

PPR is normalized against candidate results, not the entire graph, then capped by the configured `ppr` score weight.

## Compatibility

The feature is additive:

- existing `related` and `impact.groups` remain
- `ranking`, `impactScore`, and `scoreBreakdown` are new fields
- deprecated `graph query` receives the same fields
- projects without config keep the built-in `balanced` preset

## Traceability Discipline

Embedding similarity is intentionally absent from defaults. If embeddings are added later, they should be opt-in and should surface terminology inconsistencies for repair instead of hiding mismatched project language.
