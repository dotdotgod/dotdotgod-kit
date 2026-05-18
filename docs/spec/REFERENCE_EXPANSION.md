# Reference Expansion

## Purpose

Reference expansion resolves short user-written project-memory references from the existing dotdotgod graph index.

The feature avoids repeated full-repository `find` or `grep` scans. It reuses `.dotdotgod/manifest.json` and graph shards to turn references such as `[[PLAN_MODE]]` into bounded, ranked project-memory candidates.

## Commands

The CLI MUST provide explicit commands:

```bash
dotdotgod resolve <root> <ref> [--json] [--max-results n] [--include-archive]
dotdotgod expand <root> <prompt> [--json] [--max-results n] [--include-archive] [--with-impact]
```

`resolve` resolves one reference string. The input MAY include `[[...]]`, but the wrapper is not required.

`expand` scans the prompt for `[[...]]` references and resolves each target independently. If a wiki-style alias is present, such as `[[PLAN_MODE|plan mode]]`, the target before `|` is resolved.

Both commands MUST expose help through `--help`, `-h`, and `help` without refreshing the graph cache.

## Index Reuse

The commands MUST use the existing dotdotgod index through the same lazy-refresh path used by `load-snapshot` and `graph` commands.

When the index is missing, stale, or schema-mismatched, the command MAY refresh `.dotdotgod/` before returning output. JSON output MUST include refresh metadata so callers can see whether the cache changed.

The resolver MUST NOT create a separate persistent database or require embedding/vector search.

## Matching

The resolver MUST build candidates from indexed graph nodes rather than scanning all repository files at command time.

Candidate aliases SHOULD include:

- project-relative file path;
- file basename;
- basename without `.md` or source extension;
- path suffixes such as `spec/PLAN_MODE`;
- markdown heading title and anchor aliases when heading nodes are available.

Alias comparison MUST be case-insensitive. It MUST treat spaces, `_`, and `-` as equivalent, and it MUST allow `.md` omission for markdown files.

## Ranking and Ambiguity

Results MUST be bounded by `--max-results`, defaulting to a small agent-facing limit.

Ranking SHOULD prefer:

1. exact path and exact basename matches;
2. normalized alias matches;
3. heading matches;
4. README-routed or curated-index candidates;
5. higher-priority dotdotgod memory areas;
6. current docs/spec, docs/arch, docs/test, and docs/plan files ahead of archive bodies.

If multiple candidates have close scores, output MUST mark the reference as ambiguous instead of silently implying a single authoritative choice. JSON output MUST include candidate scores and reasons.

## Archive Policy

Archive bodies under `docs/archive/**` MUST be excluded by default, except for `docs/archive/README.md` as the archive map. `--include-archive` MAY include archive bodies in the candidate set.

## Output

JSON output MUST include:

- `ok`;
- `command`;
- `root`;
- `status`;
- `metadata`;
- `refs`;
- omitted counts.

Each resolved reference SHOULD include:

- original input;
- normalized query;
- candidates;
- top candidate when present;
- `ambiguous` boolean;
- omitted candidate count.

Human output MUST stay compact and include candidate paths, scores, and ambiguity markers.

## Impact Expansion

`expand --with-impact` MAY attach a compact impact report for the top file candidate of each resolved reference. The impact output MUST remain bounded and MUST use the same archive policy as graph impact reports.

## Adapter Workflow Adoption

Agent load and planning workflows MAY prefer `dotdotgod expand` before broad `grep` or `find` scans when the user prompt contains explicit `[[...]]` project-memory references. This preference MUST remain scoped to reference resolution; `grep` and `find` remain valid fallback and raw source text-search tools.

Pi Plan Mode MAY run `expand --with-impact` during context shaping for explicit `[[...]]` refs and include a bounded summary in the planning prompt. Claude Code and Codex hook examples MAY remind users or agents to run `expand`, but hooks MUST remain optional/advisory guardrails and MUST NOT block `grep` or `find`.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": ["packages/cli/src/core.mjs", "packages/pi/extensions/plan-mode/index.ts", "packages/pi/extensions/plan-mode/utils.ts"],
  "verifiedBy": ["packages/cli/test/core.test.mjs", "packages/cli/test/e2e.test.mjs", "packages/pi/test/plan-mode-utils.test.ts", "docs/test/REFERENCE_EXPANSION.md"],
  "relatedDocs": ["docs/spec/CLI_INTERFACE.md", "docs/spec/LOAD_PROJECT.md", "docs/arch/VALIDATION_ARCHITECTURE.md", "docs/concept/LAT_MD_COMPARISON.md"],
  "verificationCommands": ["pnpm --filter @dotdotgod/cli test", "node packages/cli/bin/dotdotgod.mjs resolve . PLAN_MODE --json", "node packages/cli/bin/dotdotgod.mjs expand . \"Update [[PLAN_MODE]] and [[HOOKS]]\" --json"]
}
```
