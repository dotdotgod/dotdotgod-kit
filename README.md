# @dotdot/pi-workflow

Dotdot's Pi workflow package.

## Included

### Skills

- `project-initializer` — initializes shared agent docs and documentation folders for a project.

### Extensions

- `plan-mode` — customized planning mode for Pi.
  - `/plan`
  - `/todos`
  - `Ctrl+Alt+P`
  - manages active plan task directories under `docs/plan/<task-slug>/`
  - archives completed task directories under `docs/archive/<task-slug>/`

## Local install

```bash
pi install /Users/dotdot/Workspace/pi-workflow
```

Or test for one run:

```bash
pi -e /Users/dotdot/Workspace/pi-workflow
```

## Usage

Project initializer:

```text
/skill:project-initializer initialize this project
```

Plan mode:

```text
/plan
/todos
```

## Notes

- `project-initializer` is a Pi skill, not an extension.
- `plan-mode` is a Pi extension because it registers commands, shortcuts, tool filtering, and session state.
- The customized plan mode can use `pi-web-access` tools when they are installed: `web_search`, `code_search`, `fetch_content`, `get_search_content`.
