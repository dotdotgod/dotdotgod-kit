# Impact Graph Explorer Tests

## Automated Coverage

`packages/cli/test/core.test.mjs` verifies:

- changed-file seeds remain absent from related results;
- graph membership is the union of nodes reachable from retained roots;
- reachability treats incoming and outgoing structural edges as undirected while retained edge direction is preserved;
- roots have depth zero and breadth-first minimum-hop depth is deterministic;
- disconnected and isolated non-root nodes are omitted;
- shared headings and `contains_heading` remain when root-connected;
- local-memory files, local headings, and incident edges are excluded;
- cyclic and duplicate edges remain finite and deduplicated;
- every displayed edge references displayed nodes;
- incremental Markdown refresh matches a clean full rebuild and preserves unchanged incoming edges.

`packages/cli/test/e2e.test.mjs` verifies CLI output compatibility and server lifecycle. Served payload checks assert root-connected diagnostics, hop metadata, heading and structural relation inclusion, vector-edge exclusion, explorer evidence intersection, morph runtime hooks, and reduced-motion handling while standalone impact output remains unchanged.

## Manual Smoke

Run:

```bash
node packages/cli/bin/dotdotgod.mjs graph serve . --changed packages/cli/src/impact/report.mjs
```

Verify:

- the changed file appears as a depth-zero root;
- nodes grow outward in increasing structural-hop layers;
- incoming relations can connect evidence without reversing rendered arrows;
- disconnected and isolated non-root nodes are absent from graph and search;
- `docs/plan/**`, `docs/archive/**`, and custom local-memory areas are absent;
- shared root-connected headings and `contains_heading` relations appear;
- heading marks remain smaller and quieter than file and contract nodes;
- request-local vector-only relations are absent;
- ranked evidence includes only retained graph-member IDs;
- the reveal selector provides Instant, By hop layer, and One by one modes and persists the selection;
- One by one reveals nodes in deterministic breadth-first order, bounds total delay, and exposes Skip reveal;
- re-rooting morphs surviving nodes instead of flashing a replacement graph;
- relation-filter changes preserve surviving-node position continuity;
- rapid repeated actions cancel prior animation cleanly;
- `prefers-reduced-motion` applies final positions without staged spatial movement;
- disabling WebGL leaves search and ranked evidence usable;
- no depth interface or synthetic edge exists.
