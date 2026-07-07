# dotdotgod Trello Power-Up

Static Trello Power-Up frontend for dotdotgod's Trello docs-sync integration.

This package is not an agent adapter. It is the GitHub Pages frontend Trello opens to render linked repository docs from the `dotdotgod-view` Trello custom field. That custom field stores the docs and repository links that dotdotgod's Trello sync workflow attaches to a card, so Trello cards stay connected to the durable project memory (specs, tests, architecture docs) they describe.

## GitHub Pages URL

When deployed from the `dotdotgod/dotdotgod-kit` repository with GitHub Pages configured to use GitHub Actions, the connector URL is:

```text
https://dotdotgod.github.io/dotdotgod-kit/trello/index.html
```

The local preview URL after deployment is:

```text
https://dotdotgod.github.io/dotdotgod-kit/trello/preview.html
```

## Local Preview

```bash
python3 -m http.server 4173 --directory packages/trello-power-up
```

Then open:

```text
http://localhost:4173/preview.html
```

## Test

```bash
pnpm --filter @dotdotgod/trello-power-up test
```
