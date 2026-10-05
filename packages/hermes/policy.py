"""Root-contained changed-file fingerprints and deliberately limited command gates."""
import hashlib
import re
import subprocess
from pathlib import Path

# ponytail: recognize common release/test invocations, not arbitrary shell/program semantics.
# Keep host approval/sandbox policy; add a host execution-policy integration if stronger isolation is required.
GATE = re.compile(r"\bgit\b[^\n;|]{0,200}\b(?:commit|push|tag)\b|\b(?:npm|pnpm|yarn)\b[^\n;|]{0,100}\b(?:publish|deploy|verify|test|build|lint|check)\b|\bpytest\b|\bnode\s+--test\b|\bpython\S*\s+-m\s+unittest\b")
EXCLUDED = (".dotdotgod/", "node_modules/", "dist/", "build/", "coverage/", "docs/plan/", "docs/archive/")


def contained(root, value):
    path = (root / value).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Path escapes selected repository")
    return path


def tracked(path):
    return not path.startswith(EXCLUDED)


def fingerprint(path):
    try:
        with path.open("rb") as stream:
            return hashlib.file_digest(stream, "sha256").hexdigest()
    except FileNotFoundError:
        return "missing"


def snapshot(root):
    # ponytail: hash all dirty bytes per gate; cache Git/file signatures only if profiling warrants it.
    # Dirty and untracked paths only; ignored/local memory is not indexed for impact.
    names = set()
    for args in (["diff", "--name-only", "-z", "HEAD"], ["ls-files", "--others", "--exclude-standard", "-z"]):
        run = subprocess.run(["git", "-C", str(root), *args], capture_output=True, timeout=10)
        if run.returncode:
            # A new repository can have no HEAD; fall back to tracked worktree paths.
            if args[0] == "diff":
                run = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], capture_output=True, timeout=10)
            if run.returncode:
                raise RuntimeError("Impact requires a readable Git worktree; no release commands allowed")
        names.update(run.stdout.decode("utf-8", errors="strict").split("\0"))
    return {name: fingerprint(contained(root, name)) for name in sorted(names) if name and tracked(name)}


def commands(name, args):
    if name.endswith("execute"):
        return [" ".join(str(v) for v in [item.get("command", ""), item.get("executable", ""), *item.get("args", [])])
                for item in args.get("commands", [])]
    return [str(args.get(key, "")) for key in ("command", "code", "goal", "tasks", "data")]


def gate(name, args, pending):
    if not pending:
        return None
    opaque = name.endswith("execute_file") or (name == "process" and args.get("action") in {"write", "submit"})
    if opaque or any(GATE.search(text) for text in commands(name, args)):
        return "Run dotdotgod_project_impact for pending paths before verification/commit/push/publish: " + ", ".join(sorted(pending)[:8])
    return None


def file_arguments(root, name, args):
    # Hermes file tools use path(s); paths in file patches are still subject to host policy.
    if name in {"read_file", "write_file", "file_edit", "file_write", "file_read"}:
        for key in ("path", "file_path"):
            if isinstance(args.get(key), str):
                try:
                    target = contained(root, args[key])
                except ValueError:
                    target = Path(args[key]).resolve()
                    if name not in {"read_file", "file_read"} or not target.is_relative_to(Path(__file__).parent.resolve() / "skills"):
                        raise
                args[key] = str(target)
    if name == "terminal":
        args["workdir"] = str(contained(root, args.get("workdir") or "."))
    return args
