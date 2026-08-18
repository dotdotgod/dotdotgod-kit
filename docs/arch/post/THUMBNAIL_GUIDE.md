# Project Post Thumbnail Guide

Use thumbnails to communicate a post's central technical idea at feed-card size. The image should look like part of dotdotgod and should explain the article through real project structures rather than generic AI artwork.

## Visual Direction

The current terminal thumbnail system uses:

- a `1200 × 630` social-preview canvas;
- a near-black background and high-contrast text;
- the dotdotgod green accent derived from the project brand palette;
- a terminal panel containing real paths or commands;
- one short headline, a supporting sentence, and a small label; and
- matching composition across Korean and English editions.

Keep terminal detail subordinate to the headline. The image must remain understandable when reduced to a small feed card. Do not depend on color alone to communicate hierarchy.

## Source and Output

The generator is:

```text
scripts/generate-terminal-thumbnail.mjs
```

It builds an SVG in memory and renders a compressed PNG with Sharp. The source SVG can also be saved for inspection or manual adaptation.

Store language editions with their post:

```text
docs/post/<post-slug>/
├── thumbnail.png
└── thumbnail-en.png
```

Do not create separate post directories only for translated thumbnails.

## Generate the Default Thumbnail

Run the workspace command for the default Korean table-of-contents edition:

```bash
pnpm run thumbnail:terminal
```

The current default output is:

```text
docs/post/document-directory-as-table-of-contents/thumbnail.png
```

Use an article-specific preset when its visual structure is available:

```bash
pnpm run thumbnail:terminal -- --preset docs-first
pnpm run thumbnail:terminal -- --preset maintain-toc
pnpm run thumbnail:terminal -- --preset load
pnpm run thumbnail:terminal -- --preset query
pnpm run thumbnail:terminal -- --preset impact
pnpm run thumbnail:terminal -- --preset practice
pnpm run thumbnail:terminal -- --preset purpose-memory
pnpm run thumbnail:terminal -- --preset connected-cognition
```

Each preset provides article-specific terminal content, Korean copy, and an output path in the corresponding post directory.

Generate an English edition by overriding the copy and output path:

```bash
node scripts/generate-terminal-thumbnail.mjs \
  --output docs/post/document-directory-as-table-of-contents/thumbnail-en.png \
  --title "Docs are|AI's table|of contents" \
  --subtitle "The shortest route to relevant context" \
  --label "PROJECT MEMORY / EN"
```

Use `|` to split a title into at most three lines. Keep each line short enough for the right-hand text column.

## Generator Options

| Option | Purpose |
|---|---|
| `--preset <name>` | Visual and copy preset: `toc`, `docs-first`, `maintain-toc`, `load`, `query`, `impact`, `practice`, `purpose-memory`, or `connected-cognition` |
| `--output <path>` | PNG destination; defaults to the preset's post directory |
| `--svg <path>` | Optional SVG source destination |
| `--title <text>` | Headline with `|` line separators |
| `--subtitle <text>` | One-line supporting copy |
| `--label <text>` | Small series or language label |
| `--help` | Command usage |

Example with an inspectable SVG:

```bash
pnpm run thumbnail:terminal -- --svg /tmp/post-thumbnail.svg
```

## Adapt the Visual to the Article

The generator provides focused terminal visuals for the table-of-contents concept, Docs-first project memory, table-of-contents maintenance, Load, Query, graph-impact, AI coding-practice, purpose-shaped memory, and connected-memory cognition posts. Reuse a preset only when its terminal content supports the article's claim. For another post, use a real path, command, state transition, or bounded diagram from that article.

Do not make the template generic by adding many incidental command-line flags. Add a focused preset when the shared composition still fits, or a separate generator when the visual structure changes substantially.

## Platform Adaptation

The default `1200 × 630` output suits common Open Graph previews. Check the target platform immediately before publishing:

- Velog may crop the image in list and social views.
- DEV Community recommends a wider `1000 × 420` cover ratio.
- A platform-specific crop must preserve the headline, terminal path, and brand marker.

Prefer generating a deliberate platform variant over relying on automatic center cropping. Keep the durable article image and platform-specific exports clearly named when both are retained.

## Accessibility and Quality Review

Before publishing, verify:

- the headline is readable at small size;
- terminal text does not compete with the headline;
- Korean and English line breaks are intentional;
- contrast remains sufficient on the dark background;
- no text is clipped or hidden by platform cropping;
- the terminal content matches the article body;
- the PNG is exactly `1200 × 630` unless intentionally adapted; and
- the output opens correctly after generation.

Inspect the generated image visually and verify its metadata programmatically when changing the generator.
