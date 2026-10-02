# Impact Graph Explorer Architecture

## Purpose

The explorer renders the shared structural graph reachable from changed-file roots while layering existing graph-impact ranking on top. Local memory, disconnected structure, and request-local semantic edges are absent. Shared heading structure remains when connected to a root.

## Runtime Flow

```text
changed paths
  -> fresh structural index + request-local semantic ranking overlay
  -> buildImpactReport() with root-aware request-local reference classification
  -> filtered structural graph + bounded reference diagnostics
  -> filter local-memory nodes from indexed structure
  -> undirected structural reachability from changed-file roots
  -> root-connected payload with minimum-hop metadata
  -> Graphology + D3 root-outward layout + Sigma rendering
```

`graph serve` binds to `127.0.0.1` by default. It has no depth parameter or depth control.

## Structural Boundary

Payload construction removes path-bearing nodes whose resolved memory area has `scope: "local"`. It builds undirected adjacency from every remaining indexed structural edge and performs breadth-first traversal from retained changed-file roots. This includes evidence connected through incoming relations while preserving every retained edge's stored source and target for arrow rendering.

Only reachable nodes and edges whose endpoints both remain are returned. Cycles are finite, multiple roots produce the union of their reachability sets, and breadth-first traversal assigns deterministic minimum-hop depth and nearest-root metadata. Disconnected and isolated non-root nodes are omitted from payload, search, and explorer evidence.

## Seed and Ranking Boundary

Changed files remain impact-ranking seeds and depth-zero visual roots. Seeds remain excluded from related results. Standalone `graph impact` scoring and output remain unchanged.

The explorer intersects its bounded ranked evidence list with retained graph-member IDs. Request-local semantic evidence can affect ranking but cannot create graph nodes or edges.

## Root-Outward Layout

D3 computes coordinates, Graphology holds browser graph state, and Sigma renders directed relations through WebGL. Roots occupy a compact center. Successive minimum-hop layers receive increasingly distant radial targets with deterministic ordering, collision, charge, and relation springs. Physical distance remains layout-only and never represents impact strength.

`contains_heading` edges use short, stronger springs. Heading nodes use weaker charge, smaller collision radii, and smaller rendered marks than files and contracts.

## Motion and Continuity

A native reveal selector offers `Instant`, `By hop layer`, and `One by one`; its value persists in local storage. Layer mode stages breadth-first hop groups. Sequence mode uses deterministic depth-plus-ID ordering and compresses per-node delay as graph size increases so total waiting remains bounded. A visible skip action applies all final coordinates immediately.

Nodes enter from their nearest root and morph toward final force-layout coordinates. Before re-rendering, current coordinates are retained so surviving nodes interpolate to their next positions during relation-filter or re-root updates. Animation uses `requestAnimationFrame` and existing browser/runtime dependencies. A generation token and frame cancellation prevent stale transitions from mutating newer graph state. `prefers-reduced-motion` resolves every mode to immediate final placement. Sigma/WebGL failure does not block ranked evidence or search.

## Broken Reference Boundary

Source file and contract nodes retain original reference evidence, including hrefs, fragments, relations, and available source lines. Compact graph shards preserve this source-owned metadata; cache schema 15 rebuilds older indexes. Traceability evidence is recorded even when shared extraction omits a missing target.

`impact/references.mjs` memoizes filesystem and Markdown-anchor checks within a request. It reconstructs valid reference edges from source evidence, so incremental target deletion/restoration does not require rewriting referring documents. Existing Markdown anchor extraction and decoding determine fragment validity. Missing non-seed file nodes and invalid reference evidence cannot carry PPR; an invalid anchor does not invalidate its existing file or independent valid evidence.

`buildImpactReport()` retains its request-local structural graph as a non-enumerable internal property consumed by payload construction. JSON does not duplicate the graph or expose raw source reference arrays in ranked items. Vector overlay edges whose targets were removed are filtered before scoring. Source documents and persisted graph membership are not destructively repaired.

Warnings cover sources connected to seeds in the pre-filter structural graph, are deterministically deduplicated, and are capped at 20 with separate total/omitted counts. The explorer renders them using text nodes in an accessible, WebGL-independent evidence section. Unknown filesystem access is distinct from confirmed missing targets and retains its evidence.

## Integrity and Diagnostics

Incremental index refreshes replace only nodes owned by changed paths; shared targets introduced by changed files do not discard unrelated incoming edges. Cache schema changes force a full rebuild when an older persisted graph cannot self-heal.

Payload diagnostics report retained roots, connected nodes, omitted disconnected nodes, and maximum hop depth. Every retained edge references retained endpoints, and original relation direction remains intact.

## Accessibility

The ranked list mirrors graph selection. Keyboard-accessible search covers every retained node. Motion preferences are honored, and motion never gates access to graph state. If WebGL fails, search, ranked evidence, and inspection remain usable. An empty graph explains that a selected changed-file root must survive shared structural filtering.

## Security and Scope

The explorer is local-only and read-only. Re-rooting changes ranking, membership, and seed context but cannot reintroduce local-memory or semantic-overlay nodes. Existing path canonicalization, scoring, and non-persistent semantic ranking behavior remain unchanged.
