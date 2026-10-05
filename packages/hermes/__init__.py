"""dotdotgod native Hermes plugin; no Plan Mode and no shared-profile MCP connection."""
import json
from pathlib import Path

from .runtime import Runtime

NAMES = {
    "index": "dotdotgod_context_index", "search": "dotdotgod_context_search",
    "stats": "dotdotgod_context_stats", "doctor": "dotdotgod_context_doctor",
    "purge": "dotdotgod_context_purge", "session_resume": "dotdotgod_context_session_resume",
}


def register(ctx):
    runtime = Runtime(ctx)
    for skill in sorted((Path(__file__).parent / "skills").glob("*/SKILL.md")):
        ctx.register_skill(skill.parent.name, skill)
    tools = json.loads((Path(__file__).parent / "mcp" / "tools.json").read_text())
    for tool in tools:
        remote = tool["name"]
        name = NAMES.get(remote, remote if remote.startswith("dotdotgod_") else "dotdotgod_" + remote)

        def handle(args, session_id="", _remote=remote, **kwargs):
            try:
                return json.dumps(runtime.call(_remote, args, session_id), ensure_ascii=False)
            except Exception as error:
                return json.dumps({"error": str(error), "ok": False}, ensure_ascii=False)

        ctx.register_tool(name=name, toolset="dotdotgod", schema={
            "name": name, "description": tool["description"], "parameters": tool["inputSchema"],
        }, handler=handle, description=tool["description"])

    for name, schema, description in [
        ("dotdotgod_select_root", {"type": "object", "properties": {"label": {"type": "string"}}, "required": ["label"], "additionalProperties": False}, "Select an operator-authorized repository for this host session."),
        ("dotdotgod_impact_status", {"type": "object", "properties": {}, "additionalProperties": False}, "Read pending impact paths for the selected repository; does not clear them."),
    ]:
        def handle_local(args, session_id="", _name=name, **kwargs):
            try:
                return json.dumps(runtime.call(_name, args, session_id), ensure_ascii=False)
            except Exception as error:
                return json.dumps({"error": str(error), "ok": False}, ensure_ascii=False)
        ctx.register_tool(name=name, toolset="dotdotgod", schema={"name": name, "description": description, "parameters": schema}, handler=handle_local, description=description)

    ctx.register_hook("pre_llm_call", runtime.before_llm)
    ctx.register_hook("pre_tool_call", runtime.before_tool)
    ctx.register_hook("on_session_finalize", runtime.finalize)
    ctx.register_hook("on_session_reset", runtime.finalize)
    ctx.register_hook("on_session_end", runtime.end_turn)
