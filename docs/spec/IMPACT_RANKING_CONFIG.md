# Impact Ranking Config

## Purpose

The dotdotgod CLI supports configurable `graph impact` ranking so projects can tune changed-file impact results while preserving deterministic defaults.

The ranking must remain explainable: every ranked item should expose an `impactScore` and `scoreBreakdown` that shows why it was included.

## Config File

Impact ranking policy lives in the same optional root config files as memory and traceability policy. Use `dotdotgod config <root>` to inspect the resolved policy or `dotdotgod config init <root>` to create an editable default config.

1. `dotdotgod.config.json`
2. `.dotdotgodrc.json`

## Config Shape

```json
{
  "impactRanking": {
    "preset": "balanced",
    "weights": {
      "ppr": 40,
      "traceability": 30,
      "memoryPolicy": 10,
      "verification": 15,
      "proximity": 10,
      "routing": 10,
      "freshness": 5,
      "archivePenalty": -25
    },
    "ppr": {
      "enabled": true,
      "damping": 0.85,
      "iterations": 20,
      "tolerance": 0.000001
    },
    "routing": {
      "enabled": true,
      "threshold": 0.5,
      "topKPerFile": 5,
      "includeArchiveBodies": false,
      "signals": ["path", "filename", "heading", "readme", "memoryArea", "package"]
    }
  }
}
```

## Behavior

- If `impactRanking` is absent, the CLI uses the built-in `balanced` preset.
- Presets can be partially overridden by numeric weights, relation weights, boost maps, PPR settings, and routing settings.
- Runtime graph commands fall back to defaults when config is invalid; `dotdotgod validate` reports the config errors.
- `graph impact` preserves its raw `related` and grouped output while adding ranking metadata.
- `--compact` is opt-in short text output; `--yml`/`--yaml` is opt-in structured compact output for agents.

## Ranking Signals

The default score combines:

- changed-file Personalized PageRank (`ppr`)
- curated traceability (`implemented_by`, `verified_by`, `related_doc`, `verification_command`)
- memory policy priority
- verification/test signals
- direct proximity signals such as markdown links, README routes, package/resource links
- deterministic routing hints from path, filename, heading, README, memory-area, and package metadata matches
- freshness boost or stale penalty
- archive-body penalty

Curated traceability remains higher confidence than deterministic routing hints.

## Routing Hints

Default routing hints are deterministic and lexical. They use explicit project artifacts such as file paths, markdown headings, README indexes, memory-area policy, package names, binaries, and package resources.

Embedding-based similarity is not part of the default ranking path. If added later, it should be opt-in and used for audit or repair suggestions, not as a substitute for consistent terminology, glossary aliases, or traceability blocks.

## Output Shape

`graph impact --json` includes ranking metadata and per-item scores:

```json
{
  "impact": {
    "ranking": {
      "method": "personalized-pagerank+policy",
      "preset": "balanced",
      "configSource": "default"
    },
    "related": [
      {
        "id": "file:docs/spec/LOAD_PROJECT.md",
        "impactScore": 65.4,
        "scoreBreakdown": {
          "ppr": 22.4,
          "traceability": 30,
          "memoryPolicy": 8,
          "verification": 0,
          "proximity": 0,
          "routing": 6,
          "freshness": 5,
          "archivePenalty": 0
        }
      }
    ]
  }
}
```

The top-level `related` array mirrors `impact.related` for compatibility.

`graph impact --yml` returns compact structured agent-facing groups, while `--json` keeps the full machine-readable payload:

```yaml
impact:
  ok: true
  output: "yml"
  groups:
    docs:
      items:
        - path: "docs/spec/LOAD_PROJECT.md"
          score: 65.4
          reasons: ["implemented_by", "semantic_similarity"]
  recommended_actions:
    - "review_related_docs"
    - "run_related_tests"
    - "run_dotdotgod_validate"
```

Compact text and YML output omit full ranking weights, long retrieval signal lists, and unbounded raw node metadata. Use raw JSON for diagnostics.

## Candidate Selection

Ranking still computes explainable `impactScore` values for every candidate. Before returning the bounded first page, the CLI prefers curated/test/proximity candidates over low-confidence routing-only matches and caps low-actionability metadata nodes such as dependencies when actionable files or docs are available.

Routing reasons remain visible in `reasons` and `scoreBreakdown`; they are demoted only for top-result selection.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/cli/src/core.mjs"
  ],
  "verifiedBy": [
    "packages/cli/test/core.test.mjs",
    "packages/cli/test/e2e.test.mjs",
    "docs/test/IMPACT_RANKING_CONFIG.md"
  ],
  "relatedDocs": [
    "docs/arch/IMPACT_RANKING_CONFIG.md",
    "docs/arch/VALIDATION_ARCHITECTURE.md",
    "docs/spec/MEMORY_AREA_CONFIG.md",
    "docs/spec/TRACEABILITY_CONFIG.md",
    "docs/spec/CONFIG_COMMAND.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/cli test",
    "node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json",
    "node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml",
    "node scripts/evaluate-graph-impact.mjs . --json",
    "node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"
  ]
}
```
