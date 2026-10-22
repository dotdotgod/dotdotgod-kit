import { mcpTool } from "../../shared/mcp.ts";

export const NORMAL_MODE_TOOLS = [
	"read",
	"bash",
	mcpTool("project_impact"),
	mcpTool("impact_status"),
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
	"subagent",
];
