# project-memory-kit

Project memory kit for AI coding agents. It provides shared docs initialization, plan/archive workflow conventions, and customized Pi extensions.

## Included

- Skill: `project-initializer` — initializes shared agent docs and documentation folders.
- Extension: `plan-mode` — adds `/plan`, `/todos`, `Ctrl+Alt+P`, safe planning restrictions, todo tracking, and saved plan previews.
- Extension: `load-project` — adds `/load` and `/pmk:load` for read-only project memory loading.

## Documentation

- [Project initializer spec](docs/spec/PROJECT_INITIALIZER.md)
- [Plan mode spec](docs/spec/PLAN_MODE.md)
- [Load project spec](docs/spec/LOAD_PROJECT.md)
- [Dotdot setting spec](docs/spec/DOTDOT_SETTING.md)
- [Docs structure architecture](docs/arch/DOCS_STRUCTURE.md)
- [Extension architecture](docs/arch/EXTENSION_ARCHITECTURE.md)
- [Code conventions](docs/arch/CODE_CONVENTIONS.md)

## Install from npm

```bash
pi install npm:project-memory-kit
```

Or test for one run without installing permanently:

```bash
pi -e npm:project-memory-kit
```

## Local development

```bash
pi install /Users/dotdot/Workspace/project-memory-kit
pi -e /Users/dotdot/Workspace/project-memory-kit
```

## Usage

```text
/skill:project-initializer initialize this project
/plan
/todos
/load
/pmk:load
```

Optional dotdot convention scaffold:

```bash
sh skills/project-initializer/scripts/init_project.sh --dotdot-setting <project-root>
```

## Publishing

```bash
npm run pack:dry-run
npm publish --access public
```
