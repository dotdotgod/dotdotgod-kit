# Reference Expansion Verification

## Scope

Verify `dotdotgod resolve` and `dotdotgod expand` behavior for indexed project-memory references.

The feature should prove that reference expansion uses the existing dotdotgod graph/cache instead of a new repository scan, keeps output bounded, and preserves archive-body exclusion by default.

## Automated Coverage

`packages/cli/test/core.test.mjs` should cover:

- extraction of `[[...]]` references from prompt text;
- wiki-style alias handling for `[[target|label]]`;
- case-insensitive alias normalization;
- equivalence of spaces, `_`, and `-`;
- `.md` omission for markdown files;
- path, basename, extensionless basename, and heading candidate aliases;
- candidate ranking with score reasons;
- explicit ambiguity when top scores are close;
- default archive-body exclusion and `--include-archive` inclusion;
- bounded output and omitted counts.

`packages/cli/test/e2e.test.mjs` should cover:

- `resolve` and `expand` help output without cache side effects;
- JSON output shape for resolved references;
- lazy cache refresh metadata when the index is missing or stale;
- missing reference input errors;
- prompt expansion across multiple `[[refs]]`;
- archive body exclusion by default.

## Adapter Workflow Coverage

Pi Plan Mode should detect explicit `[[...]]` refs in the latest planning request, run bounded `expand --with-impact` context shaping when available, and continue planning if expansion fails. Claude Code and Codex hook docs should describe `expand` reminders as optional/advisory only.

## Smoke Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs resolve . PLAN_MODE --json
node packages/cli/bin/dotdotgod.mjs resolve . docs/spec/PLAN_MODE.md --json
node packages/cli/bin/dotdotgod.mjs expand . "Update [[PLAN_MODE]] and [[HOOKS]]" --json
node packages/cli/bin/dotdotgod.mjs expand . "Update [[PLAN_MODE|plan mode]]" --json
node packages/cli/bin/dotdotgod.mjs expand . "Update [[PLAN_MODE]]" --with-impact --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```

## Expected Results

- `PLAN_MODE` resolves to `docs/spec/PLAN_MODE.md` as a top candidate in this repository.
- Ambiguous short names such as `HOOKS` show multiple candidates when several indexed files or headings match.
- JSON output includes `status` and `metadata` fields, including `cacheRefreshed`.
- Archive plan bodies are absent unless `--include-archive` is provided.
- Output remains bounded and reports omitted candidate counts.

## Manual Review Notes

Review human output for concise wording. The command should help agents choose the right project-memory file without forcing them to read every search hit.
