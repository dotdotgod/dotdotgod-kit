# Validation Rule Boundaries

The validator owns dotdotgod-specific structure checks:

- Markdown files matched by the resolved traceability policy include valid fenced `json dotdotgod` traceability blocks as the final section. The default policy matches `docs/spec/**` and excludes README files.
- Optional `--check-index` validation compares current markdown fingerprints with `.dotdotgod/manifest.json` so stale graph indexes are visible without running `status` separately.
- `docs/` directory names are kebab-case.
- Markdown files under `docs/` are UPPER_SNAKE_CASE or `README.md`.
- Markdown files stay within configurable line and character budgets unless explicitly excluded.
- Directories with multiple markdown files include `README.md`.
- Local markdown links and anchors point to existing targets.
- Optional config files use valid memory-area, traceability, validation, and impact-ranking settings.
- `docs/plan`, `docs/archive/plan`, and `docs/archive/report` use expected task/report shapes.
- `.gitignore` contains `docs/plan`, `docs/archive`, and `.dotdotgod`.

The validator does not own general markdown style formatting. Use Prettier or markdownlint separately if a project wants style linting.

Traceability validation is CLI-owned because project docs are user-editable. Errors include block-shape and property guidance. Projects may configure enforced path arrays, but valid traceability blocks share one schema.

Markdown size validation uses `validation.markdown.maxLines`, `validation.markdown.maxChars`, and `validation.markdown.exclude` from project config. CLI `--max-lines` and `--max-chars` override configured numeric budgets for one run. Size exclusions skip only `FILE_TOO_LONG` and `FILE_TOO_LARGE`; all other validation rules still apply.
