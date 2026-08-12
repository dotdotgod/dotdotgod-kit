# Config Template Architecture

## Boundary

Runtime project-config discovery remains in `memory/config.mjs`: project file or built-in zero-config policy. Initialization template discovery is isolated in `config/templates.mjs` so global template state cannot alter normal runtime behavior.

## Registry

The template module owns:

- built-in template names and config data
- `software` as the compatibility initialization default
- global settings lookup under `~/.dotdotgod/config.json`
- custom file lookup under `~/.dotdotgod/templates/`
- complete replacement and validation
- serialized template output and provenance

Built-in domain templates reuse the public project-config schema. The registry also owns explicit scaffold metadata for directory-based domain areas. Scaffold metadata is separate from memory-area globs so initialization does not accidentally turn file paths, optional areas, or artifact patterns into documentation directories. Generated adapter resources come from the same registry.

## Initialization Flow

1. `init` or `config init` receives an optional template name.
2. Without a name, the resolver reads global `defaultTemplate`, then uses `software`.
3. A custom same-name file is considered before the built-in registry.
4. The selected data is validated and serialized.
5. The initializer writes the common scaffold and, for bundled templates, the explicit template scaffold without replacing existing paths.
6. The initializer writes a standalone `dotdotgod.config.json` only when absent.

Custom templates do not define scaffold metadata in the current schema and therefore receive only the common scaffold. General validation also does not require every configured memory-area root to exist; initializer E2E tests verify bundled scaffold materialization instead.

Invalid intended overrides fail closed. This prevents a malformed custom `software` template from silently generating bundled software.

## Skill and CLI Responsibilities

The initializer skill performs semantic project classification and asks the user when needed. The CLI performs deterministic name resolution, validation, provenance reporting, and file creation.

Global/template management remains file-based; no mutable template-management command surface is introduced.

## Fallback

The POSIX fallback receives an explicit built-in template name and copies the corresponding packaged JSON. Portable shell does not parse or validate arbitrary user JSON. Generated resources keep all built-in templates aligned across adapters.

## Verification

- Unit tests validate every built-in config and require an intentional scaffold entry for every bundled template.
- E2E tests isolate the home directory and cover global defaults, custom shadowing, invalid templates, runtime non-interference, CLI initialization, and POSIX bundled selection.
- Generated-resource verification checks adapter copies.

## Related Documentation

- [`CONFIG_TEMPLATES.md`](../spec/CONFIG_TEMPLATES.md)
- [`CONFIG_COMMAND.md`](../spec/CONFIG_COMMAND.md)
- [`PROJECT_INITIALIZER.md`](../spec/PROJECT_INITIALIZER.md)
- [`CONFIG_TEMPLATES.md`](../test/CONFIG_TEMPLATES.md)
