import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("dd_hermes", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
from dd_hermes.runtime import Runtime
from dd_hermes.proxy import Proxy


class State(dict):
    def set(self, key, value):
        self[key] = value


class Context:
    def __init__(self, config=None):
        self.config = config or {}
        self.state = State()
        self.tools = {}
        self.hooks = {}
        self.skills = {}

    def get_config(self, key, default=None):
        return self.config.get(key, default)

    def register_tool(self, **kw):
        if kw['name'] in self.tools:
            raise AssertionError('Duplicate tool registration: ' + kw['name'])
        self.tools[kw['name']] = kw

    def register_hook(self, name, callback):
        self.hooks[name] = callback

    def register_skill(self, name, path):
        self.skills[name] = path


class RuntimeTest(unittest.TestCase):
    def setUp(self):
        # Runtime subprocesses, not just direct fixture Git calls, must inherit
        # the fixture's repository discovery instead of a parent push hook.
        clean_env = os.environ.copy()
        for name in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX"):
            clean_env.pop(name, None)
        environment = patch.dict(os.environ, clean_env, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.a = Path(self.temp.name).resolve() / "a"
        self.b = Path(self.temp.name).resolve() / "b"
        for root in (self.a, self.b):
            root.mkdir()
            (root / "src").mkdir()
            (root / "src/api.ts").write_text("export const value = 1;\n")
            (root / ".gitignore").write_text(".dotdotgod/\ndocs/plan/\ndocs/archive/\n")
            self.git(root, "init", "-q")
            self.git(root, "add", ".")
            self.git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture")
        self.ctx = Context({"roots": {"a": str(self.a), "b": str(self.b)},
                            "gateway_access": {"telegram:alice": ["a"], "telegram:bob": ["b"]},
                            "cli_root": str(self.a)})
        self.runtime = Runtime(self.ctx)
        self.addCleanup(self.runtime.close_all)

    def git(self, root, *args):
        # Linked-worktree hooks export repository-local Git variables. Fixture
        # operations must never inherit those and target the release repository.
        env = os.environ.copy()
        for name in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX"):
            env.pop(name, None)
        return subprocess.run(["git", "-C", str(root), *args], env=env, capture_output=True, check=True).stdout

    def enter(self, sid="A", sender="alice"):
        return self.runtime.before_llm(session_id=sid, user_message="review src/api.ts", platform="telegram", sender_id=sender)

    def test_optional_host_identity_and_deterministic_routing(self):
        for sid in ["", None, "unknown"]:
            for name in ["read_file", "terminal", "project_load"]:
                args = {"path": "relative.txt", "command": "pwd"}
                self.assertIsNone(self.runtime.before_tool(name, args, session_id=sid))
                self.assertEqual(args["path"], "relative.txt")
        self.runtime.call("select_root", {"label": str(self.b)}, "known")
        result = self.runtime.call("project_load", {"root": str(self.b)}, "")
        self.assertEqual(result["structuredContent"]["root"], str(self.b))
        self.assertNotIn("", self.runtime.sessions)
        default = self.runtime.call("project_load", {}, "fresh")
        self.assertEqual(default["structuredContent"]["root"], str(self.a))
        self.assertEqual(self.runtime.session("known").root, self.b)
        self.runtime.before_llm("known", "dd:no-load", platform="desktop", sender_id="changed")
        self.assertEqual(self.runtime.session("known").root, self.b)
        self.runtime.before_llm("orphan", "hello", platform="subagent", parent_session_id="absent")
        self.assertIsNone(self.runtime.before_tool("read_file", {"path": "x"}, session_id="orphan"))
        self.runtime.finalize()
        self.runtime.end_turn(interrupted=True)
        self.assertEqual(self.runtime.session("known").root, self.b)
        self.runtime.finalize("known")
        self.assertNotIn("known", self.runtime.sessions)

    def test_anonymous_client_cleanup_and_nested_hook(self):
        module.register(self.ctx)
        # execute_code nested dispatch supplies task_id but no host session_id.
        self.assertIsNone(self.ctx.hooks["pre_tool_call"]("read_file", {"path": "relative.txt"}, task_id="nested"))
        result = json.loads(self.ctx.tools["project_load"]["handler"]({"root": str(self.b)}, task_id="nested"))
        self.assertEqual(result["structuredContent"]["root"], str(self.b))
        with patch("dd_hermes.runtime.Proxy") as proxy:
            proxy.return_value.call.return_value = {"ok": True}
            self.runtime.call("stats", {}, "")
            proxy.return_value.close.assert_called_once()
        self.assertNotIn("", self.runtime.sessions)

    def test_registration_and_no_planning(self):
        module.register(self.ctx)
        self.addCleanup(self.ctx.hooks["on_session_finalize"], session_id="registered")
        self.assertEqual(len(self.ctx.tools), 20)
        self.assertEqual(len(self.ctx.skills), 4)
        self.assertNotIn("plan", " ".join(self.ctx.tools))
        self.ctx.hooks["pre_llm_call"](session_id="registered", user_message="hello", platform="cli")
        self.assertFalse(any(name.startswith("dotdotgod_") for name in self.ctx.tools))
        response = json.loads(self.ctx.tools["doctor"]["handler"]({}, session_id="registered"))
        self.assertTrue(response["structuredContent"]["ok"])
        self.assertIn("## doctor", response["content"][0]["text"])
        self.assertEqual(self.ctx.hooks["pre_tool_call"]("terminal", {"command": "git status"}, session_id="registered")["args"]["workdir"], str(self.a))

    def test_gateway_routing_and_concurrent_mcp(self):
        self.assertIn('"a"', self.enter()["context"])
        self.runtime.call("select_root", {"label": "b"}, "A")
        self.runtime.call("select_root", {"label": "a"}, "A")
        self.enter("B", "bob")
        self.runtime.call("select_root", {"label": "b"}, "B")
        with ThreadPoolExecutor() as pool:
            a = pool.submit(self.runtime.call, "stats", {}, "A")
            b = pool.submit(self.runtime.call, "stats", {}, "B")
            first, second = a.result(), b.result()
        self.assertNotEqual(first["structuredContent"]["sessionId"], second["structuredContent"]["sessionId"])
        self.assertNotEqual(self.runtime.sessions["A"].proxy.process.pid, self.runtime.sessions["B"].proxy.process.pid)
        self.runtime.call("session_resume", {"sessionId": "explicit-own-context"}, "A")
        self.assertEqual(self.runtime.call("stats", {}, "B")["structuredContent"]["sessionId"], second["structuredContent"]["sessionId"])
        self.runtime.call("project_load", {"root": str(self.b)}, "A")
        self.assertEqual(self.runtime.session("A").root, self.b)
        self.ctx.config["gateway_access"]["telegram:alice"] = []
        self.runtime.call("stats", {}, "A")

    def test_absolute_root_selection_without_labels_or_grants(self):
        self.ctx.config["roots"] = {}
        self.ctx.config["gateway_access"] = {}
        self.enter()
        self.runtime.call("select_root", {"label": str(self.a)}, "A")
        self.assertEqual(self.runtime.session("A").root, self.a)
        self.runtime.before_llm("child", "review", platform="subagent", parent_session_id="A")
        self.runtime.call("select_root", {"label": str(self.b)}, "child")
        self.assertEqual(self.runtime.session("child").root, self.b)
        self.assertEqual(self.runtime.session("A").root, self.a)
        self.runtime.call("project_load", {"root": str(self.b)}, "A")
        result = self.runtime.call("execute", {"commands": [{"command": "pwd", "cwd": str(self.a)}]}, "A")
        self.assertTrue(result["structuredContent"]["results"][0]["ok"])
        self.assertEqual(self.runtime.session("A").root, self.b)

    def test_unselected_host_tools_and_dotdotgod_guards(self):
        cases = [{}, {"roots": {"a": str(self.a)}}, self.ctx.config]
        for config in cases:
            with self.subTest(config=config):
                runtime = Runtime(Context(config))
                self.addCleanup(runtime.close_all)
                context = runtime.before_llm("unselected", "hello", platform="telegram", sender_id="alice")["context"]
                self.assertIn("inactive", context)
                self.assertNotIn("Call project_load", context)
                self.assertIn("select_root", context)
                self.assertIsNone(runtime.before_tool("select_root", {"label": str(self.a)}, session_id="unselected"))
                with patch.object(runtime, "pending", side_effect=AssertionError("must not scan")):
                    for name in ["web_search", "web_extract", "skill_view", "tool_describe", "terminal", "read_file", "write_file", "delegate_task", "process"]:
                        args = {"command": "git push", "path": str(self.b), "workdir": str(self.b)}
                        original = dict(args)
                        self.assertIsNone(runtime.before_tool(name, args, session_id="unselected"))
                        self.assertEqual(args, original)
                    self.assertIsNone(runtime.before_tool("project_initialize", {}, session_id="unselected"))
                    for name in ["doctor", "execute", "project_load"]:
                        self.assertIsNone(runtime.before_tool(name, {}, session_id="unselected"))
                self.assertIsNone(runtime.before_tool("web_search", {}, session_id="missing"))

    def test_unselected_initialization_is_one_shot(self):
        self.ctx.config["roots"] = {}
        self.ctx.config["gateway_access"] = {}
        self.enter()
        args = {"root": str(self.b)}
        dry = self.runtime.call("project_initialize", args, "A")
        self.assertTrue(dry["structuredContent"]["ok"])
        self.assertFalse((self.b / "AGENTS.md").exists())
        denied = self.runtime.call("project_initialize", {**args, "dryRun": False}, "A")
        self.assertTrue(denied["isError"])
        self.assertFalse((self.b / "AGENTS.md").exists())
        written = self.runtime.call("project_initialize", {**args, "dryRun": False, "confirmWrite": True}, "A")
        self.assertTrue(written["structuredContent"]["ok"])
        self.assertTrue((self.b / "AGENTS.md").exists())
        session = self.runtime.sessions["A"]
        self.assertIsNone(session.root)
        self.assertIsNone(session.proxy)
        self.assertFalse(session.loaded)
        self.assertEqual(self.ctx.state, {})
        for target in [None, "relative", str(self.b / "missing"), str(self.b / "AGENTS.md")]:
            with self.assertRaises((ValueError, FileNotFoundError)):
                self.runtime.call("project_initialize", {"root": target}, "A")
        with patch("dd_hermes.runtime.Proxy") as proxy:
            proxy.return_value.call.side_effect = RuntimeError("initialization failed")
            with self.assertRaises(RuntimeError):
                self.runtime.call("project_initialize", args, "A")
            proxy.return_value.close.assert_called_once()
        self.assertTrue(self.runtime.call("stats", {}, "A")["structuredContent"]["sessionId"])
        self.ctx.config["roots"] = {"b": str(self.b)}
        self.ctx.config["gateway_access"] = {"telegram:alice": ["b"]}
        self.runtime.call("select_root", {"label": "b"}, "A")
        self.assertEqual(self.runtime.session("A").root, self.b)
        self.ctx.config["gateway_access"] = {}
        for name in ["web_search", "project_initialize"]:
            self.assertIsNone(self.runtime.before_tool(name, args, session_id="A"))
        self.assertTrue(self.runtime.call("project_initialize", args, "A")["structuredContent"]["ok"])

    def test_same_root_session_search_and_reconnect(self):
        self.ctx.config["gateway_access"]["telegram:bob"] = ["a"]
        for sid, sender in [("A", "alice"), ("B", "bob")]:
            self.enter(sid, sender)
            self.runtime.call("select_root", {"label": "a"}, sid)
        indexed = self.runtime.call("index", {"path": "src/api.ts", "scope": "session"}, "A")
        source = indexed["structuredContent"]["id"]
        search = {"query": "value", "sessionOnly": True, "source": source}
        self.assertEqual(len(self.runtime.call("search", search, "A")["structuredContent"]["results"]), 1)
        self.assertEqual(self.runtime.call("search", search, "B")["structuredContent"]["results"], [])
        proxy = self.runtime.sessions["A"].proxy
        previous = proxy.process.pid
        proxy.close()
        self.assertEqual(len(self.runtime.call("search", search, "A")["structuredContent"]["results"]), 1)
        self.assertNotEqual(proxy.process.pid, previous)

    def test_load_opt_out_restore_references_and_fallback(self):
        result = self.runtime.before_llm(session_id="cli", user_message="dd:no-load inspect", platform="cli")
        self.assertNotIn("Call project_load once", (result or {}).get("context", ""))
        result = self.runtime.before_llm(session_id="cli", user_message="review [[src/api.ts]]", platform="cli")
        self.assertIn("Call project_load once", result["context"])
        self.assertIn("Reference evidence", result["context"])
        with patch.object(self.runtime, "cli", side_effect=FileNotFoundError("missing CLI")):
            loaded = self.runtime.call("project_load", {}, "cli")
        self.assertIn("fallback", loaded["structuredContent"]["documentationMap"])
        self.assertTrue(self.runtime.sessions["cli"].loaded)
        result = self.runtime.before_llm(session_id="cli", user_message="continue", platform="cli")
        self.assertNotIn("Call project_load once", (result or {}).get("context", ""))
        self.runtime.finalize("cli")
        result = self.runtime.before_llm(session_id="cli", user_message="resume", platform="cli")
        self.assertIn("Call project_load once", result["context"])

    def test_impact_failure_subset_normalization_reedit_and_nested_gates(self):
        self.runtime.before_llm(session_id="cli", user_message="inspect", platform="cli")
        (self.a / "src/api.ts").write_text("changed\n")
        (self.a / "src/new.ts").write_text("new\n")
        blocked = self.runtime.before_tool("terminal", {"command": "git -C . commit -m test"}, session_id="cli")
        self.assertEqual(blocked["action"], "block")
        with self.assertRaises(PermissionError):
            self.runtime.call("execute", {"commands": [{"command": "pnpm run verify"}]}, "cli")
        with self.assertRaises(PermissionError):
            self.runtime.call("execute_file", {"path": "src/api.ts", "code": "opaque", "language": "javascript"}, "cli")
        proxy = self.runtime.client(self.runtime.sessions["cli"])
        with patch.object(proxy, "call", return_value={"isError": True, "structuredContent": {"ok": False}}):
            self.runtime.call("project_impact", {"paths": ["src/api.ts"]}, "cli")
        self.assertIn("src/api.ts", self.runtime.pending(self.runtime.sessions["cli"]))
        self.runtime.call("project_impact", {"paths": ["./src/api.ts"]}, "cli")
        self.assertEqual(list(self.runtime.pending(self.runtime.sessions["cli"])), ["src/new.ts"])
        self.runtime.call("project_impact", {"paths": ["src/new.ts"]}, "cli")
        self.assertNotEqual((self.runtime.before_tool("terminal", {"command": "git push"}, session_id="cli") or {}).get("action"), "block")
        (self.a / "src/api.ts").write_text("re-edited\n")
        self.assertEqual(self.runtime.before_tool("terminal", {"command": "git push"}, session_id="cli")["action"], "block")
        self.assertEqual(self.runtime.before_tool("process", {"action": "write", "data": "opaque"}, session_id="cli")["action"], "block")
        self.assertEqual(self.runtime.before_tool("delegate_task", {"goal": "git push"}, session_id="cli")["action"], "block")

    def test_context_batch_jobs_confirmations_and_initializer(self):
        self.runtime.before_llm(session_id="cli", user_message="inspect", platform="cli")
        batch = self.runtime.call("execute", {"commands": [
            {"command": "printf hello", "outputMode": "indexed"},
            {"command": "printf failure >&2; exit 7"},
        ]}, "cli")
        runs = batch["structuredContent"]["results"]
        self.assertEqual(runs[1]["code"], 7)
        self.assertIn("failure", runs[1]["stderr"])
        source = runs[0]["indexed"]["id"]
        self.assertEqual(len(self.runtime.call("search", {"source": source, "query": "hello"}, "cli")["structuredContent"]["results"]), 1)
        denied = self.runtime.call("purge", {"confirm": True}, "cli")
        self.assertTrue(denied["isError"])
        job = self.runtime.call("ingestion_job_start", {"kind": "index", "input": {"path": "src/api.ts"}}, "cli")["structuredContent"]["job"]
        status = self.runtime.call("ingestion_job_status", {"id": job["id"]}, "cli")
        self.assertIn(status["structuredContent"]["job"]["state"], ["queued", "running", "completed"])
        self.runtime.call("ingestion_job_cancel", {"id": job["id"]}, "cli")
        invalid = self.runtime.call("fetch_and_index", {"url": "file:///forbidden"}, "cli")
        self.assertTrue(invalid["isError"])
        escaped = self.runtime.call("index", {"path": str(self.b / "src/api.ts")}, "cli")
        self.assertFalse(escaped.get("isError", False))
        for name in ["read_file", "write_file"]:
            routed = self.runtime.before_tool(name, {"path": str(self.b / "src/api.ts")}, session_id="cli")
            self.assertIsNone(routed)
        routed = self.runtime.before_tool("terminal", {"command": "pwd", "workdir": str(self.b)}, session_id="cli")
        self.assertIsNone(routed)
        dry = self.runtime.call("project_initialize", {"dryRun": True}, "cli")
        self.assertTrue(dry["structuredContent"]["ok"])
        self.assertFalse((self.a / "AGENTS.md").exists())
        initialized = self.runtime.call("project_initialize", {"dryRun": False, "confirmWrite": True}, "cli")
        self.assertTrue(initialized["structuredContent"]["ok"])
        self.assertTrue((self.a / "AGENTS.md").exists())
        self.assertEqual((self.a / "src/api.ts").read_text(), "export const value = 1;\n")

    def test_delegate_parent_root_unknown_session_and_cancellation(self):
        self.enter()
        self.runtime.call("select_root", {"label": "a"}, "A")
        self.runtime.before_llm(session_id="child", parent_session_id="A", platform="subagent", user_message="review")
        self.assertEqual(self.runtime.session("child").root, self.a)
        self.assertIsNot(self.runtime.client(self.runtime.session("A")), self.runtime.client(self.runtime.session("child")))
        self.assertIsNone(self.runtime.before_tool("terminal", {"command": "pwd"}, session_id="unknown"))
        proxy = self.runtime.client(self.runtime.session("child"))
        errors = []
        def run():
            try:
                proxy.call("execute", {"commands": [{"command": "echo $$ > cancel.pid; sleep 20"}]})
            except Exception as error:
                errors.append(str(error))
        thread = threading.Thread(target=run)
        thread.start()
        import time
        for _ in range(100):
            if (self.a / "cancel.pid").exists():
                break
            time.sleep(0.05)
        pid = int((self.a / "cancel.pid").read_text())
        self.runtime.end_turn("A", interrupted=True)
        thread.join(timeout=5)
        self.assertFalse(thread.is_alive())
        self.assertTrue(errors)
        import os
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)
        self.ctx.config["gateway_access"]["telegram:bob"] = ["a"]
        self.enter("A", "bob")
        self.runtime.call("select_root", {"label": "a"}, "A")
        self.assertTrue(self.runtime.call("stats", {}, "child")["structuredContent"]["sessionId"])


if __name__ == '__main__':
    unittest.main()
