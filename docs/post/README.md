# Project Posts

Use this local-memory area for posts about questions, trade-offs, decisions, experiments, and implementation work related to dotdotgod.

## Structure

- Create one kebab-case directory per post: `docs/post/<post-slug>/`.
- Keep the post or its overview in `docs/post/<post-slug>/README.md`.
- Add supporting Markdown files with UPPER_SNAKE_CASE names only when they improve the post.
- List each post below with its status and a one-line purpose.

## Writing Guidance

Follow [`docs/arch/post/WRITING_GUIDE.md`](../arch/post/WRITING_GUIDE.md) when drafting, translating, illustrating, reviewing, and publishing a post. In particular:

- lead with one central claim and use each example to support it;
- use trees for structure, prose for principles, tables for differences, and lists for procedures;
- distinguish observations, assumptions, decisions, and completed work;
- link relevant specs, architecture docs, tests, plans, or source paths;
- keep bilingual editions and their thumbnails in the same post directory;
- do not treat posts as behavior contracts; and
- keep private data, credentials, and unrelated personal notes out of this directory.

## Posts

- `document-directory-as-table-of-contents/` — published on Velog and DEV Community: Korean and English editions explaining how directories, filenames, README indexes, and headings form a book-like table of contents for AI agent memory.
- `how-dotdotgod-maintains-document-toc/` — published on Velog and DEV Community: Korean and English editions explaining how dotdotgod initializes, validates, traces, loads, and archives the documentation table of contents.
- `docs-first-project-memory/` — published on Velog and DEV Community: Korean and English editions explaining why maintained documents remain the source of project memory while vector caches, graphs, and Load outputs act as derived routing layers.
- `how-load-keeps-ai-context-fresh/` — published on Velog and DEV Community: Korean and English editions explaining how Load turns maintained documentation maps, focused query routes, and selected local memory into bounded next reads.
- `how-query-finds-related-docs/` — published on Velog and DEV Community: Korean and English editions explaining how local multilingual E5 embeddings route natural-language questions to distinct maintained Markdown documents without replacing their source text.
- `how-graph-impact-finds-related-docs/` — published on Velog and DEV Community: Korean and English editions explaining how graph impact turns changed files into an explainable, bounded review list of related specs, architecture, tests, commands, and source files.
- `project-memory-from-biological-cognition/` — draft Korean edition explaining how dotdotgod turns explicit project memory into an impact-driven psychometry capability that traces changed files back to related review scope.
- `hacker-news-introduction/` — draft English Show HN introduction presenting dotdotgod through changed-file impact, explicit traceability, and project psychometry.
