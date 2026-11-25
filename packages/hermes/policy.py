"""Non-blocking relative path defaults for Hermes file and terminal tools."""

from pathlib import Path


def resolve_path(root, value):
    # Relative paths default to the selected repository; explicit absolute paths stay intact.
    return (Path(root) / value).resolve()


def file_arguments(root, name, args):
    # Hermes file tools use path(s); paths in file patches are still subject to host policy.
    if name in {"read_file", "write_file", "patch", "file_edit", "file_write", "file_read"}:
        for key in ("path", "file_path"):
            if isinstance(args.get(key), str) and args[key]:
                args[key] = str(resolve_path(root, args[key]))
    if name == "terminal":
        args["workdir"] = str(resolve_path(root, args.get("workdir") or "."))
    return args
