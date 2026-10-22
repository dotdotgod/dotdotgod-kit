# Native Plan Integration

Claude Code exposes a supported `plansDirectory` setting, so initialization
merges only that opt-in project key. Plugin defaults cannot apply it. No Mods
module, native filename rewrite or permission hook is necessary.

Official references:
- https://code.claude.com/docs/en/settings-reference#plansdirectory
- https://developers.openai.com/codex/permissions
- https://github.com/openai/codex/tree/rust-v0.163.0
