"""Hermes lifecycle routing; shared Node tools retain their wire contracts."""
import atexit
import hashlib
import json
import os
import stat
import subprocess
import sys
import threading
import uuid
from copy import copy
from dataclasses import dataclass
from pathlib import Path

from .impact import ImpactStore, contained, extract_edit_paths, impact_reminder, is_failed_result, mask_error
from .policy import file_arguments, resolve_path
from .proxy import Proxy

BASE = Path(__file__).parent
LOAD_STATE_FIELDS = {"assessed": "assessed", "loaded": "loaded", "notified": "notified",
                     "skipCount": "skip_count", "lastPromptHash": "last_prompt_hash"}


def is_initialized(root):
    # Match the shared hook's markers without starting Node in uninitialized repositories.
    for marker, matches in (("dotdotgod.config.json", stat.S_ISREG), (".dotdotgod", stat.S_ISDIR)):
        try:
            if matches((root / marker).lstat().st_mode):
                return True
        except OSError:
            pass
    return False


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
    parent_id: str = ""
    assessed: bool = False
    loaded: bool = False
    notified: bool = False
    skip_count: int = 0
    last_prompt_hash: str | None = None
    host_warned: bool = False
    load_token: object | None = None

    def reset_load(self):
        self.assessed = self.loaded = self.notified = self.host_warned = False
        self.skip_count = 0
        self.last_prompt_hash = self.load_token = None


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
        return roots

    def session(self, session_id):
        # Anonymous calls use disposable state, never another conversation's route.
        if not session_id:
            return Session(uuid.uuid4().hex, "", "")
        if session_id not in self.sessions:
            self.sessions[session_id] = Session(session_id, "", "")
        return self.sessions[session_id]

    def impact_key(self, session):
        return digest(session.principal + "\0" + session.id + "\0" + str(session.root))

    def impact_store(self, session):
        return ImpactStore(session.root, self.impact_key(session))

    def impact_status(self, session, limit=50):
        return self.impact_store(session).status(limit=limit)

    def select(self, session, label):
        value = self.allowed(session).get(label, label)
        if not isinstance(value, str) or not Path(value).is_absolute():
            raise ValueError("Use a configured repository label or an absolute directory path")
        root = Path(value).resolve(strict=True)
        if not root.is_dir():
            raise ValueError("Repository root must be a directory")
        if session.proxy:
            session.proxy.close()
        session.root, session.label, session.proxy = root, label, None
        session.reset_load()
        if self.sessions.get(session.id) is session:
            self.ctx.state.set("route:" + digest(session.id), {"principal": session.principal, "label": label})
        return envelope({"ok": True, "root": str(root), "label": label})

    def client(self, session):
        with self.lock:
            if session.proxy is None:
                # Separate connection, but the existing project DB stays shared for the same root.
                session.proxy = Proxy(session.root, self.impact_key(session))
            return session.proxy

    def cli(self, root, args):
        run = subprocess.run(["node", str(BASE / "mcp" / "cli.mjs"), *args], cwd=root,
                             capture_output=True, text=True, timeout=20)
        if run.returncode:
            raise RuntimeError((run.stderr or run.stdout or "CLI unavailable")[:1000])
        return json.loads(run.stdout)

    def load(self, session, root, args):
        focus = str(args.get("focus", "")).strip()
        depth = 3 if focus else 5
        try:
            mapping = self.cli(root, ["map", str(root), "--depth", str(depth), "--json"])
        except Exception as error:
            mapping = {"fallback": [p for p in ["AGENTS.md", "README.md", "docs/README.md"] if (root / p).is_file()],
                       "unavailable": str(error)}
        query = None
        if focus:
            try:
                query = self.cli(root, ["query", str(root), focus, "--limit", "30", "--json"])
            except Exception as error:
                query = {"unavailable": str(error), "guidance": "Use map/README routing; do not install embeddings without approval."}
        with self.lock:
            if session.root is root:
                session.assessed = session.loaded = session.notified = True
                session.load_token = None
        data = {"ok": True, "root": str(root), "focus": focus, "documentationMap": mapping, "query": query}
        return envelope(data, "Project memory (map/query evidence; read bodies selectively):\n" + json.dumps(data, ensure_ascii=False) + "\nHelp: dotdotgod --help")

    def call(self, name, args, session_id=""):
        with self.lock:
            session = self.session(session_id)
        try:
            return self.call_with_session(name, args, session)
        finally:
            if not session_id and session.proxy:
                session.proxy.close()

    def call_with_session(self, name, args, session):
        with self.lock:
            if name == "select_root":
                return self.select(session, args.get("label"))
            if session.root is None and not session.parent_id and name == "project_initialize":
                target = args.get("root")
                if not isinstance(target, str) or not Path(target).is_absolute():
                    raise ValueError("Initialization without selection requires an explicit absolute root directory")
                root = Path(target).resolve(strict=True)
                if not root.is_dir():
                    raise ValueError("Initialization root must be a directory")
                proxy = Proxy(root, digest(session.principal + "\0" + session.id + "\0initialize"))
                try:
                    return proxy.call(name, {**args, "root": str(root)})
                finally:
                    proxy.close()
            if name == "project_load" and args.get("root"):
                base = session.root or self.launch_root
                target = resolve_path(base, args["root"])
                if target != session.root:
                    self.select(session, str(target))
            if session.root is None:
                session.root = Path(self.ctx.get_config("cli_root", "") or self.launch_root).resolve(strict=True)
                if not session.root.is_dir():
                    raise ValueError("Project root must be a directory")
            root = session.root
        if name == "impact_status":
            raw_limit = args.get("limit", 50)
            limit = raw_limit if isinstance(raw_limit, int) and not isinstance(raw_limit, bool) and 1 <= raw_limit <= 50 else 50
            return envelope(self.impact_status(session, limit=limit))
        if name == "project_load":
            return self.load(session, root, args)
        if name == "project_impact":
            raw_paths = args.get("paths", [])
            if isinstance(raw_paths, list):
                real_root = os.path.realpath(session.root)
                paths = []
                for raw in raw_paths:
                    resolved = contained(session.root, raw) if isinstance(raw, str) else None
                    paths.append(os.path.relpath(resolved, real_root).replace("\\", "/") if resolved else raw)
                args = {**args, "paths": paths}
            args = {**args, "contextSessionId": self.impact_key(session)}
        return self.client(session).call(name, args)

    def before_tool(self, tool_name, args, session_id="", **kwargs):
        try:
            session = self.sessions.get(session_id) if session_id else None
            if session is None or session.root is None or tool_name == "select_root":
                return None
            rewritten = file_arguments(session.root, tool_name, dict(args))
            if rewritten != args:
                return {"action": "modify", "args": rewritten}
        except Exception as error:
            print("dotdotgod hook error: " + mask_error(error), file=sys.stderr)
        return None

    def after_tool(self, tool_name="", args=None, result=None, session_id="", status=None, **kwargs):
        try:
            session = self.sessions.get(session_id) if session_id else None
            if session is None or session.root is None or is_failed_result(status, result):
                return None
            paths = extract_edit_paths(tool_name, args)
            if paths:
                self.impact_store(session).mark(paths)
        except Exception as error:
            print("dotdotgod hook error: " + mask_error(error), file=sys.stderr)
        return None

    def load_decision(self, session, root, text):
        with self.lock:
            if session.root is not root or session.loaded or session.load_token is not None:
                return {}
            state = {key: getattr(session, name) for key, name in LOAD_STATE_FIELDS.items()}
            token = session.load_token = object()
        try:
            request = {"root": str(root), "rawPrompt": text, "sessionState": state, "budgetMs": 22_000}
            run = subprocess.run(["node", str(BASE / "mcp" / "decision.mjs")], input=json.dumps(request),
                                 capture_output=True, encoding="utf-8", timeout=25, check=True)
            result = json.loads(run.stdout)
        except subprocess.TimeoutExpired:
            result = {"ok": False, "errorLine": "dotdotgod decision: request_timeout"}
        except (OSError, subprocess.SubprocessError, ValueError):
            result = {"ok": False, "errorLine": "dotdotgod decision: state_error"}
        with self.lock:
            # A reselect (even to the same root) or explicit tool load invalidates the response.
            if session.load_token is not token:
                return {}
            session.load_token = None
            if result["ok"]:
                for key, name in LOAD_STATE_FIELDS.items():
                    setattr(session, name, result["state"][key])
            error = result["errorLine"]
            if result.get("outcome", {}).get("errorCode") == "provider_unsupported_on_host":
                if session.host_warned:
                    error = None
                session.host_warned = True
        if error:
            print(error, file=sys.stderr)
        return result if result["ok"] else {}

    def before_llm(self, session_id, user_message, platform="", sender_id="", parent_session_id="", **kwargs):
        with self.lock:
            parent = self.sessions.get(parent_session_id) if platform == "subagent" else None
            principal = parent.principal if parent else platform + ":" + sender_id
            if parent:
                platform = parent.platform
            session = self.sessions.get(session_id)
            if session is None:
                session = Session(session_id or uuid.uuid4().hex, principal, platform)
                if session_id:
                    self.sessions[session_id] = session
                saved = self.ctx.state.get("route:" + digest(session_id), {}) if session_id else {}
                if isinstance(saved.get("label"), str) and (saved["label"] in self.allowed(session) or Path(saved["label"]).is_absolute()):
                    self.select(session, saved["label"])
                elif parent:
                    session.root, session.label, session.parent_id = parent.root, parent.label, parent.id
                elif platform in {"", "cli"}:
                    session.root = Path(self.ctx.get_config("cli_root", "") or self.launch_root).resolve(strict=True)
            route = copy(session)
        if route.root is None:
            labels = list(self.allowed(session))
            context = "dotdotgod is inactive; ordinary host tools remain available. Select a project using select_root with a configured label or absolute directory path, or initialize an explicit absolute directory with existing write confirmation. Initialization does not select a project."
            if labels:
                context += " Configured project labels: " + json.dumps(labels)
            return {"context": context}
        if not is_initialized(route.root):
            return None
        try:
            parts = []
            text = user_message if isinstance(user_message, str) else " ".join(p.get("text", "") for p in user_message if isinstance(p, dict))
            decision = self.load_decision(session, route.root, text)
            if decision.get("text"):
                parts.append(decision["text"])
            outcome = decision.get("outcome", {})
            # Shared prefetch already expands its refs read-only; don't refresh the index here.
            if outcome.get("kind") != "prefetch" and text.strip():
                try:
                    seeds = [f"[[{ref}]]" for ref in outcome.get("refs", []) if not any(ch in ref for ch in "[]|")]
                    # Keep the prompt a literal operand even with the pre-T4 CLI, which lacks `--`.
                    prompt = " ".join(["", text, *seeds])
                    expanded = self.cli(route.root, ["expand", str(route.root), prompt, "--json", "--with-impact", "--fuzzy"])
                    refs = expanded.get("refs", [])
                    if refs:
                        parts.append("Reference evidence (non-authoritative): " + json.dumps(refs, ensure_ascii=False))
                except Exception:
                    parts.append("Reference expansion unavailable; use README routing and explicit targeted reads.")
            try:
                reminder = impact_reminder(self.impact_status(route))
                if reminder:
                    parts.append(reminder)
            except Exception as error:
                print("dotdotgod hook error: " + mask_error(error), file=sys.stderr)
                parts.append("Impact status unavailable; run project_impact manually for edited paths.")
            with self.lock:
                return {"context": "\n\n".join(parts)} if parts and session.root is route.root else None
        except Exception as error:
            print("dotdotgod hook error: " + mask_error(error), file=sys.stderr)
            return {"context": "dotdotgod context unavailable; ordinary host tools remain available."}

    def finalize(self, session_id="", **kwargs):
        for child in list(self.sessions.values()):
            if session_id and child.parent_id == session_id:
                self.finalize(child.id)
        session = self.sessions.pop(session_id, None)
        if session and session.proxy:
            session.proxy.close()

    def end_turn(self, session_id="", interrupted=False, **kwargs):
        if interrupted:
            for child in list(self.sessions.values()):
                if session_id and child.parent_id == session_id:
                    self.end_turn(child.id, interrupted=True)
            session = self.sessions.get(session_id)
            if session and session.proxy:
                session.proxy.close()
                session.proxy = None

    def close_all(self):
        for sid in list(self.sessions):
            self.finalize(sid)
