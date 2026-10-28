# Release 0.7.0

## Changes

- Replace the changed-file web explorer with a standalone project traceability
  graph using resolved default/project configuration, D3, and Canvas.
- Share filtering, representative relations, document colors, and compact labels
  with the Obsidian development adapter. No Obsidian runtime is required by web.
- Add relation toggles, document-only mode, weighted lines, virtualized file
  navigation, diagnostic reload errors, and bounded cluster layout/camera fitting.
- Preserve positions on unchanged reloads and remove strikethrough styling.
- Pin Pi context MCP connections to the session project, preventing inherited
  parent project roots from redirecting impact state and retrieval.

## Upgrade

Run `dotdotgod graph serve .` without `--changed`. Use `graph impact --changed`
for changed-file ranking. Legacy web impact/reroot endpoints and structural
payload exports are removed. Sigma and Graphology renderer dependencies are
removed. The web refresh action resolves current config and index data directly.

The desktop Obsidian plugin ships as GitHub Release assets with vault-relative
settings, validated payloads, safe file reveal, and a `graph export` command.
It uses undocumented renderer APIs; native filters may not constrain injected
endpoints. Community-directory submission is prepared, not approved. See
`OBSIDIAN_COMMUNITY_SUBMISSION.md` for owner steps and review limitations.
Local vault/profile and plugin build output are ignored. Private root/shared and
Obsidian workspace packages are not published to npm; seven public packages ship
in dependency order.

## Verification

Workspace verify, generated-runtime checks, and package dry-runs passed after
the version bump. Documentation/index validation requires a fresh index.
The packaged plugin passed unit tests and real-app checks on macOS Obsidian
1.14.5: 327 relations, filters, repeated reload, missing-file recovery, settings
save, safe reveal routing, native options, unload restoration, and graph reopen.
Chrome MCP checks cover graph
rendering/filtering, layout stability, zoom bounds, list windowing and reload
failure recovery. Physical touch and OS clipboard-permission coverage is limited.
