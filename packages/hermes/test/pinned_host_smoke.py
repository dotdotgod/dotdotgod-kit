"""Opt-in: <host-venv>/python test/pinned_host_smoke.py <pinned-host> <extracted-package>.
Uses the real Hermes loader, registry, hook dispatcher and durable plugin state.
No model calls or messaging API credentials; chat events are injected at the host hook boundary.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PIN = "19b57f11d6eefb17e3e8a58e40b0b16aeb8b83b9"
host, package = map(lambda value: Path(value).resolve(), sys.argv[1:3])
assert subprocess.check_output(["git", "-C", str(host), "rev-parse", "HEAD"], text=True).strip() == PIN
sys.path.insert(0, str(host))

with tempfile.TemporaryDirectory(prefix="dd-hermes-host-") as tmp:
    base = Path(tmp).resolve()
    home = base / "profile"
    plugin = home / "plugins" / "dotdotgod"
    shutil.copytree(package, plugin, ignore=shutil.ignore_patterns("node_modules", "test", "__pycache__"))
    assert not (plugin / "node_modules").exists()
    roots = {}
    for label in ("a", "b"):
        root = base / label
        (root / "src").mkdir(parents=True)
        (root / "src/api.ts").write_text("export const value = 1;\n")
        (root / ".gitignore").write_text(".dotdotgod/\ndocs/plan/\ndocs/archive/\n")
        for args in (["init", "-q"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", "commit", "-qm", "fixture"]):
            subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True)
        roots[label] = str(root)
    os.environ["HERMES_HOME"] = str(home)
    os.environ["HERMES_BUNDLED_PLUGINS"] = str(base / "no-bundled-plugins")
    os.chdir(roots["a"])
    import hermes_yaml
    config = {"plugins": {"enabled": ["dotdotgod"], "entries": {"dotdotgod": {"settings": {
        "roots": roots, "gateway_access": {"telegram:alice": ["a"], "telegram:bob": ["b"]},
    }}}}}
    (home / "config.yaml").write_text(hermes_yaml.safe_dump(config))
    from hermes_cli.plugins import PluginManager
    from tools.registry import registry
    manager = PluginManager()
    manager.discover_and_load()
    assert len(manager._plugin_tool_names) == 20, [(name, item.error) for name, item in manager._plugins.items()]
    assert len(manager._plugin_skills) == 4

    def hook(name, **kwargs):
        return manager.invoke_hook(name, **kwargs)

    def call(name, args, sid):
        return json.loads(registry.dispatch(name, args, scope=manager.scope_key, session_id=sid))

    try:
        hook("pre_llm_call", session_id="cli", platform="cli", sender_id="", user_message="review", turn_id="1")
        cli = call("dotdotgod_context_doctor", {}, "cli")
        assert cli["structuredContent"]["ok"], cli
        for sid, sender, label in [("A", "alice", "a"), ("B", "bob", "b")]:
            prompt = hook("pre_llm_call", session_id=sid, platform="telegram", sender_id=sender, user_message="review", turn_id="1")
            assert prompt and "Select a repository" in prompt[0]["context"], prompt
            result = call("dotdotgod_select_root", {"label": label}, sid)
            assert result["structuredContent"]["ok"], result
        assert call("dotdotgod_select_root", {"label": "b"}, "A")["ok"] is False
        with ThreadPoolExecutor() as pool:
            a = pool.submit(call, "dotdotgod_context_stats", {}, "A")
            b = pool.submit(call, "dotdotgod_context_stats", {}, "B")
            values = [a.result(), b.result()]
        ids = [v["structuredContent"]["sessionId"] for v in values]
        assert ids[0] != ids[1]
        call("dotdotgod_context_session_resume", {"sessionId": "own-context"}, "A")
        assert call("dotdotgod_context_stats", {}, "B")["structuredContent"]["sessionId"] == ids[1]
        hook("pre_llm_call", session_id="child", platform="subagent", parent_session_id="A", user_message="review")
        assert call("dotdotgod_context_doctor", {}, "child")["structuredContent"]["ok"]
        load = call("dotdotgod_project_load", {}, "A")
        assert load["structuredContent"]["ok"], load
        again = hook("pre_llm_call", session_id="A", platform="telegram", sender_id="alice", user_message="continue", turn_id="2")
        assert all("Call dotdotgod_project_load once" not in item.get("context", "") for item in again)
        Path(roots["a"], "src/api.ts").write_text("changed\n")
        blocked = hook("pre_tool_call", session_id="A", tool_name="terminal", args={"command": "git push"}, task_id="A")
        assert any(item.get("action") == "block" for item in blocked), blocked
        impact = call("dotdotgod_project_impact", {"paths": ["src/api.ts"]}, "A")
        assert impact["structuredContent"]["ok"], impact
        allowed = hook("pre_tool_call", session_id="A", tool_name="terminal", args={"command": "git push"}, task_id="A")
        assert all(item.get("action") != "block" for item in allowed), allowed
        Path(roots["a"], "src/api.ts").write_text("changed again\n")
        assert any(item.get("action") == "block" for item in hook("pre_tool_call", session_id="A", tool_name="terminal", args={"command": "git push"}, task_id="A"))
        print(json.dumps({"pin": PIN, "installation": "extracted package, isolated real PluginManager profile",
                          "registeredTools": 20, "registeredSkills": 4, "cliAndGatewayHooks": "passed",
                          "concurrentRootsAndSessions": "passed", "impactDenyClearReedit": "passed",
                          "externalMessagingAndModelCalls": "not performed"}, indent=2))
    finally:
        for sid in ("child", "cli", "A", "B"):
            hook("on_session_finalize", session_id=sid)
