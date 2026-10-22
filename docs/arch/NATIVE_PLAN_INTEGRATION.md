# Native Plan Integration

Claude Code exposes a supported `plansDirectory` setting, so initialization
merges only that opt-in project key. Plugin defaults cannot apply it. No Mods
module, native filename rewrite or permission hook is necessary.

Codex separates collaboration instructions from filesystem enforcement. Its
0.163.0 catalog supports `model_messages.collaboration_modes.plan`; its Beta
permission profiles allow a read-only baseline with one writable subtree.
The opt-in setup changes both together, preserving the full supplied catalog
and avoiding an always-on writable workspace. Catalog replacement is pinned
to the tested host version because upstream prompt and metadata contracts vary.

The native template and Apache-2.0 attribution are retained in the adapter.
The source patch changes mutation guidance and appends durable-plan rules;
questions, proposed-plan rendering and explicit mode switching remain native.
Conflicting permission choices require manual integration so user denies cannot
silently disappear. Managed constraints remain enforced by Codex itself.

Configuration profile selection is explicit and session-wide. Ending native
planning does not expand permissions. The setup is not a new execution agent
and does not replace host lifecycle, MCP or hooks. Hook internal state and MCP
execution remain separate boundaries; native writes are used for acceptance.

Official references:
- https://code.claude.com/docs/en/settings-reference#plansdirectory
- https://developers.openai.com/codex/permissions
- https://github.com/openai/codex/tree/rust-v0.163.0
