# document-clarify Migration

`document-clarify` is now distributed only in `@dotdotgod/skills`. The updated Pi, Claude Code, Codex, Hermes and OpenCode adapters no longer bundle it. Its name, editing guidance, memory-area handling and CLI-unavailable fallback remain unchanged.

## Upgrade

1. Identify the active skill path and back up any user edits. Record the adapter version/source and standalone installation scope.
2. Install the complete standalone skill from this checkout in the desired project, selecting the actual host ID:

   ```bash
   npx skills@1.7.6 add /absolute/path/to/dotdotgod-kit/packages/skills \
     --skill document-clarify --agent pi --copy --yes
   ```

   Other IDs: `claude-code`, `codex`, `hermes-agent`, `opencode`. Add `--global` only for an intentional user-wide installation. Do not assume npm installation registers a skill. Remote-source availability is not verified.
3. Upgrade/re-register the adapter using its host-supported procedure. Source/symlink installs must point to the updated checkout. Old plugin caches or copied directories may retain the old skill; use the host's supported removal/reinstall procedure if the active package remains stale. Do not delete unrelated skills, settings or package-owned files manually as the default procedure.
4. Reload/restart the host. Confirm exactly one `document-clarify` provider, inspect its actual path, and read the installed guidance. Do not invoke clarification while both old and new providers are exposed; discovery precedence is not assumed.
5. Confirm the adapter's other resources remain available and that its removal/reinstall did not remove the independent skill.

Codex, Pi and OpenCode can share `.agents/skills` with Skills CLI 1.7.6. Removal of that shared copy can affect multiple hosts. Inspect destinations before removal. Host-native upgrade/discovery and rollback have not been verified across all five hosts; file installation alone does not prove them.

## Rollback

Back up standalone edits first. Before returning to an old adapter that bundles the skill, remove/exclude the standalone provider using verified installer/host controls in its actual scope. Restore the old adapter through its normal installation route, then restart and verify a single provider and its path. Do not silently remove other skills or change trust settings. Reinstall the standalone version when returning to the new adapter.

See [package installation guidance](README.md) and [verification record](../../docs/test/SKILL_INSTALLATION.md). Repository documentation links are for source checkouts; packaged consumers should use the package README and their host's native installation guidance.
