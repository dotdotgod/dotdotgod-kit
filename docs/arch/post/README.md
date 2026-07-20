# Project Post Architecture

This directory defines the durable structure and editorial conventions for project posts. Posts remain explanatory narratives rather than product behavior contracts, while their shared authoring rules belong in tracked architecture documentation.

## Index

- `WRITING_GUIDE.md`: claim-first writing, evidence, formatting, bilingual editions, publishing adaptation, and review requirements.
- `THUMBNAIL_GUIDE.md`: terminal-thumbnail visual direction, generator options, language variants, platform adaptation, and quality checks.

## Runtime Boundary

Post source files live under `docs/post/` and are tracked in Git. The load documentation summary excludes that directory so routine project-memory loads do not present posts as part of the current spec, architecture, or test table of contents.

Posts remain available to repository search and graph indexing through the shared `docs/**` memory area. Read a post body only when the current task, a direct link, or graph impact identifies it as relevant.
