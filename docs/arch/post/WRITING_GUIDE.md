# Project Post Writing Guide

Use this guide for explanatory posts, implementation narratives, experiments, and technical essays under `docs/post/`. Posts communicate ideas and experience; they do not replace product specs, architecture records, or test contracts.

## Start with One Claim

Define the conclusion in one sentence before outlining the post. Every example, section, table, and code block should support that claim. Move adjacent ideas that require their own explanation into follow-up posts.

Put the conclusion in the opening paragraph. The opening should identify:

- the problem;
- the central claim;
- the proposed approach; and
- what the reader will learn.

Do not delay the conclusion behind a long history, a rhetorical question, or a list of general industry problems.

## Give Each Format One Job

Use the format that best communicates the information instead of repeating the same content in several forms.

| Format | Use it for |
|---|---|
| Directory tree | Hierarchy and document structure |
| Prose | Principles, transitions, and causes |
| Table | Meaningful differences between paths or roles |
| List | Procedures, choices, and checklists |
| Code block | Content readers can inspect or run directly |

A tree should show structure, while the following prose explains why that structure exists or how it grows. Do not restate every tree entry in both a list and a table.

## Prefer Evidence from the Project

Use real paths, commands, and source behavior when they make the claim concrete.

```text
docs/spec/CLI_INTERFACE.md
docs/arch/CLI_ARCHITECTURE.md
docs/test/CLI_INTERFACE.md
```

Examples should reveal the intended distinction before the reader opens every file. Verify code paths and commands against the current repository before publishing.

Remove examples that are broadly related to AI but do not directly support the post's claim. General context-window limits or hallucination problems belong in a post only when the article explains them.

## Keep Terminology Stable

Use terms that working developers naturally recognize. In Korean posts, established transliterations such as 스펙, 아키텍처, 테스트, 컨텍스트, 스냅샷, and 캐시 are usually clearer than forced translations.

Choose one term for each concept and use it throughout the post. Treat analogies as supporting explanations rather than replacing the primary term. For example, parts, chapters, and sections may explain a hierarchical table of contents, but the table of contents remains the central concept.

## Remove Repetition

Each section should add information. During revision, remove:

- restatements of the opening claim;
- lists that repeat a preceding tree;
- tables that repeat a preceding list;
- general AI problems unrelated to the argument; and
- conclusions that reproduce the entire body.

A summary should provide an application rule, boundary, or next step rather than merely shortening earlier paragraphs.

## State Technical Boundaries

Describe what an implementation guarantees and what it does not guarantee. Prefer narrow statements supported by code and tests over broad claims.

For example, a loader may verify index freshness, build a bounded snapshot, and route an agent through README indexes. Those mechanisms do not prove that every statement in the loaded documents is true.

Link the relevant spec, architecture document, test, plan, or source path when it lets the reader verify a technical statement.

## Keep Posts Separate from Project Truth

A post may contain observations, assumptions, decisions, and completed work, but it is not a behavior contract. When writing reveals durable project truth, update the appropriate area as well:

- product behavior in `docs/spec/`;
- architectural rationale and constraints in `docs/arch/`;
- regression and manual verification in `docs/test/`; and
- active implementation intent in `docs/plan/`.

The post should link to those sources instead of becoming their only record.

## Organize a Post Directory

Start with one kebab-case directory and a `README.md`.

```text
docs/post/<post-slug>/
├── README.md
├── ENGLISH.md
├── thumbnail.png
└── thumbnail-en.png
```

Use `README.md` for the primary edition. Add `ENGLISH.md` only when an English edition exists. Keep both editions and their assets in the same directory, and add reciprocal language links.

Add other UPPER_SNAKE_CASE Markdown files only when they have a distinct supporting role. Register every post directory in `docs/post/README.md` with its status and one-line purpose.

## Adapt Rather Than Translate Literally

Bilingual editions should preserve the same claim, examples, technical facts, and boundaries. Rewrite sentence structure and terminology for the target audience instead of translating line by line.

Keep platform metadata outside the durable article body when possible. The current publishing defaults are:

- Korean edition: Velog;
- English edition: DEV Community; and
- canonical URL: set when an English article is syndicated from another primary site.

Review platform-specific title, tag, front matter, image URL, and cover ratio requirements immediately before publishing.

## Make the Thumbnail Explain the Post

Use the article's actual structure, path, or command instead of generic technology imagery. A thumbnail should have:

- one short central message;
- readable contrast at feed-card size;
- limited terminal or diagram detail;
- consistent visual treatment across language editions; and
- an aspect ratio appropriate for the target platform.

Use `thumbnail.png` for the primary edition and `thumbnail-en.png` for the English edition. The default generator produces `1200 × 630` PNG files; verify cropping when a platform expects another ratio. Follow [`THUMBNAIL_GUIDE.md`](THUMBNAIL_GUIDE.md) for the visual system, generator commands, language variants, and platform checks.

## Review Before Publishing

### Argument

- Can the central claim be stated in one sentence?
- Does the opening paragraph contain the conclusion?
- Does every example directly support the claim?
- Does each section add new information?
- Are technical guarantees and limitations accurate?

### Structure

- Does each tree, paragraph, table, list, and code block have one clear job?
- Are terminology, paths, and filenames consistent?
- Is the article within the configured Markdown size limits?
- Are language, related-post, and source links valid?
- Is the nearest README index current?

### Publication

- Does each edition have the correct thumbnail?
- Are title, tags, metadata, and cover ratio appropriate for the platform?
- Is a canonical URL required for syndication?
- Have private data, credentials, and unrelated personal notes been removed?

## Validate the Change

Run graph impact for changed files, review the related files it reports, and then validate the documentation from the source checkout.

```bash
node packages/cli/bin/dotdotgod.mjs validate \
  . \
  --include-local-memory \
  --check-index
```
