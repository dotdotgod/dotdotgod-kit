"""Hermes lifecycle routing; shared Node tools retain their wire contracts."""
import atexit
import hashlib
import json
import re
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path

from .policy import contained, file_arguments, gate, snapshot
from .proxy import Proxy

BASE = Path(__file__).parent


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def envelope(data, text=None):
    return {"content": [{"type": "text", "text": text or json.dumps(data, ensure_ascii=False)}], "structuredContent": data}


@dataclass
class Session:
    id: str
    principal: str
    platform: str
    root: Path | None = None
    label: str = ""
    proxy: Proxy | None = None
    loaded: bool = False
    parent_id: str = ""


class Runtime:
    def __init__(self, ctx):
        self.ctx = ctx
        self.sessions = {}
        self.lock = threading.RLock()
        self.launch_root = Path.cwd().resolve()
        atexit.register(self.close_all)

    def allowed(self, session):
        roots = self.ctx.get_config("roots", {})
        if not isinstance(roots, dict):
            raise ValueError("roots must be an operator-configured mapping")
        if session.platform in {"", "cli"}:
            return roots
        access = self.ctx.get_config("gateway_access", {})
        labels = access.get(session.principal, []) if isinstance(access, dict) else []
        return {label: roots[label] for label in labels if label in roots} if isinstance(labels, list) else {}

    def session(self, session_id):
        if not session_id or session_id not in self.sessions:
            raise ValueError("No trusted host session; start a turn before using dotdotgod")
        session = self.sessions[session_id]
        if session.root is None:
            raise ValueError("Select an authorized repository with dotdotgod_select_root first")
        if session.parent_id:
            parent = self.session(session.parent_id)
            if parent.root != session.root or parent.principal != session.principal:
                raise PermissionError("Delegating parent repository or principal changed")
        if session.label:
            value = self.allowed(session).get(session.label)
            if not isinstance(value, str) or Path(value).resolve(strict=True) != session.root:
                raise PermissionError("Repository grant changed; select an authorized root again")
        return session

    def select(self, session, label):
        if session.parent_id and label != self.session(session.parent_id).label:
            raise PermissionError("Delegated work cannot select a different repository")
        value = self.allowed(session).get(label)
        if not isinstance(value, str) or not Path(value).is_absolute():
            raise PermissionError("Unknown or unauthorized repository label")
        root = Path(value).resolve(strict=True)
        if not root.is_dir():
            raise ValueError("Repository root must be a directory")
        if session.proxy:
            session.proxy.close()
        session.root, session.label, session.proxy, session.loaded = root, label, None, False
        self.ctx.state.set("route:" + digest(session.id), {"principal": session.principal, "label": label})
        return envelope({"ok": True, "root": str(root), "label": label})

    def client(self, session):
        with self.lock:
            if session.proxy is None:
                # Separate connection, but the existing project DB stays shared for the same root.
                session.proxy = Proxy(session.root, digest(session.principal + "\0" + session.id + "\0" + str(session.root)))
            return session.proxy

    def pending(self, session):
        current = snapshot(session.root)
        checked = self.ctx.state.get("impact:" + digest(str(session.root)), {})
        return {path: value for path, value in current.items() if checked.get(path) != value}

    def cli(self, session, args):
        run = subprocess.run(["node", str(BASE / "mcp" / "cli.mjs"), *args], cwd=session.root,
                             capture_output=True, text=True, timeout=20)
        if run.returncode:
            raise RuntimeError((run.stderr or run.stdout or "CLI unavailable")[:1000])
        return json.loads(run.stdout)

    def load(self, session, args):
        focus = str(args.get("focus", "")).strip()
        depth = 3 if focus else 5
        try:
            mapping = self.cli(session, ["map", str(session.root), "--depth", str(depth), "--json"])
        except Exception as error:
            mapping = {"fallback": [p for p in ["AGENTS.md", "README.md", "docs/README.md"] if (session.root / p).is_file()],
                       "unavailable": str(error)}
        query = None
        if focus:
            try:
                query = self.cli(session, ["query", str(session.root), focus, "--limit", "30", "--json"])
            except Exception as error:
                query = {"unavailable": str(error), "guidance": "Use map/README routing; do not install embeddings without approval."}
        session.loaded = True
        data = {"ok": True, "root": str(session.root), "focus": focus, "documentationMap": mapping, "query": query}
        return envelope(data, "Project memory (map/query evidence; read bodies selectively):\n" + json.dumps(data, ensure_ascii=False) + "\nHelp: dotdotgod --help")

    def call(self, name, args, session_id):
        with self.lock:
            if name == "dotdotgod_select_root":
                return self.select(self.sessions[session_id], args.get("label"))
            session = self.session(session_id)
        if name == "dotdotgod_impact_status":
            return envelope({"ok": True, "pending": list(self.pending(session))})
        if name == "dotdotgod_project_load":
            if contained(session.root, args.get("root") or ".") != session.root:
                raise ValueError("Use dotdotgod_select_root to change repositories")
            return self.load(session, args)
        if name in {"execute", "execute_file"}:
            reason = self.check(session, name, args)
            if reason:
                raise PermissionError(reason)
        if name == "dotdotgod_project_impact":
            before = self.pending(session)
            paths = [contained(session.root, path).relative_to(session.root).as_posix() for path in args.get("paths", [])]
            args = {**args, "paths": paths}
        value = self.client(session).call(name, args)
        if name == "dotdotgod_project_impact" and not value.get("isError") and value.get("structuredContent", {}).get("ok") is True:
            with self.lock:
                after = self.pending(session)
                key = "impact:" + digest(str(session.root))
                checked = self.ctx.state.get(key, {})
                for path in paths:
                    if path in before and before[path] == after.get(path):
                        checked[path] = before[path]
                self.ctx.state.set(key, checked)
        return value

    def check(self, session, name, args):
        try:
            pending = self.pending(session)
        except Exception:
            pending = {"<impact state unavailable>": "unknown"}
        return gate(name, args, pending)

    def before_tool(self, tool_name, args, session_id="", **kwargs):
        try:
            if tool_name == "dotdotgod_select_root":
                return None
            session = self.session(session_id)
            reason = self.check(session, tool_name, args)
            if reason:
                return {"action": "block", "message": reason}
            rewritten = file_arguments(session.root, tool_name, dict(args))
            if rewritten != args:
                return {"action": "modify", "args": rewritten}
        except Exception as error:
            return {"action": "block", "message": str(error)}

    def before_llm(self, session_id, user_message, platform="", sender_id="", parent_session_id="", **kwargs):
        with self.lock:
            parent = self.session(parent_session_id) if platform == "subagent" else None
            principal = parent.principal if parent else platform + ":" + sender_id
            if parent:
                platform = parent.platform
            session = self.sessions.get(session_id)
            if session and session.principal != principal:
                if session.proxy:
                    session.proxy.close()
                session = None
            if session is None:
                session = Session(session_id, principal, platform)
                self.sessions[session_id] = session
                saved = self.ctx.state.get("route:" + digest(session_id), {})
                if saved.get("principal") == principal and saved.get("label") in self.allowed(session):
                    self.select(session, saved["label"])
                elif parent:
                    session.root, session.label, session.parent_id = parent.root, parent.label, parent.id
                elif platform in {"", "cli"}:
                    session.root = Path(self.ctx.get_config("cli_root", "") or self.launch_root).resolve(strict=True)
        if session.root is None:
            return {"context": "Select a repository using dotdotgod_select_root. Authorized labels: " + json.dumps(list(self.allowed(session)))}
        try:
            self.session(session_id)
            parts = []
            text = user_message if isinstance(user_message, str) else " ".join(p.get("text", "") for p in user_message if isinstance(p, dict))
            if not session.loaded and not re.search(r"(?:^|\s)/?dd:no-load\b|(?:^|\s)/no-load\b", text):
                parts.append("Call dotdotgod_project_load once with an agent-selected focus, then continue the original request. Read AGENTS.md and maintained README indexes selectively.")
            if text.strip():
                try:
                    expanded = self.cli(session, ["expand", str(session.root), text, "--json", "--with-impact", "--fuzzy"])
                    refs = expanded.get("refs", [])
                    if refs:
                        parts.append("Reference evidence (non-authoritative): " + json.dumps(refs, ensure_ascii=False))
                except Exception:
                    parts.append("Reference expansion unavailable; use README routing and explicit targeted reads.")
            pending = self.pending(session)
            if pending:
                parts.append("Impact pending: " + ", ".join(list(pending)[:8]) + ". Run dotdotgod_project_impact before broad tests or release commands.")
            return {"context": "\n\n".join(parts)} if parts else None
        except Exception as error:
            return {"context": "dotdotgod context unavailable: " + str(error) + "; do not bypass root/impact checks."}

    def finalize(self, session_id="", **kwargs):
        for child in list(self.sessions.values()):
            if child.parent_id == session_id:
                self.finalize(child.id)
        session = self.sessions.pop(session_id, None)
        if session and session.proxy:
            session.proxy.close()

    def end_turn(self, session_id="", interrupted=False, **kwargs):
        if interrupted:
            for child in list(self.sessions.values()):
                if child.parent_id == session_id:
                    self.end_turn(child.id, interrupted=True)
            session = self.sessions.get(session_id)
            if session and session.proxy:
                session.proxy.close()
                session.proxy = None

    def close_all(self):
        for sid in list(self.sessions):
            self.finalize(sid)
