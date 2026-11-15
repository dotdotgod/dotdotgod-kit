import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type ApprovalChoice, PolicyRuntime } from "./runtime.ts";
import { secretArguments } from "./durable.ts";
import type { Invocation } from "./invocation.ts";

const preview = (text: string) => text.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`);
export async function approveCommand(ctx:ExtensionContext,value:Invocation,scopes:Array<"project"|"global">=[]):Promise<ApprovalChoice>{
 if(!ctx.hasUI)return "deny";
 const sensitive = secretArguments(value.args);
 const reusable = value.reusable && !sensitive;
 if (!reusable) scopes = [];
 const choice=await ctx.ui.select(`Plan Mode: command approval\nExecutable: ${preview(value.executable)}\nArguments: ${sensitive?"[redacted: secret-like arguments; once only]":preview(JSON.stringify(value.args))}\nDirectory: ${preview(value.cwd)}\nShell: ${value.shell?"simple shell":"direct"}\nEnvironment: values hidden${reusable?"":"; once only"}\nExact command, arguments, relative cwd and identified entry bytes only. Not a sandbox: imports, external configuration and environment-dependent behavior are not covered. Host permissions still apply.${scopes.length?"":" Persistent scopes unavailable for this target/context."}`,["Deny","Allow once",...(reusable?["Allow same invocation this session"]:[]),...(scopes.includes("project")?["Always this project"]:[]),...(scopes.includes("global")?["Always all projects"]:[])]);
 return choice==="Allow once"?"once":choice==="Allow same invocation this session"?"session":choice==="Always this project"?"project":choice==="Always all projects"?"global":"deny";
}
export async function approvePath(ctx:ExtensionContext,path:string):Promise<ApprovalChoice>{
 if(!ctx.hasUI)return "deny";
 const choice=await ctx.ui.select(`Additional planning Markdown\nTarget: ${path}\nOnly this target's planning edit/write, not sibling files.`,["Deny","Allow once","Allow target for this session"]);
 return choice==="Allow once"?"once":choice==="Allow target for this session"?"session":"deny";
}
// Prompt bookkeeping only; PolicyRuntime owns all activation authority.
const prompts = new WeakMap<PolicyRuntime, string>();

export async function ensureProjectPolicy(ctx: ExtensionContext, runtime: PolicyRuntime): Promise<void> {
 if (!ctx.hasUI || !ctx.isProjectTrusted() || runtime.error || runtime.projectActive) return;
 const { policy, data, revision } = runtime.project;
 const documentation = data.documentation as { root?: string } | undefined;
 const areas = (data.memory as { areas?: Array<{ role?: string; paths?: string[]; excludePaths?: string[] }> } | undefined)?.areas;
 const customRoots = documentation?.root && documentation.root !== "docs" ||
  areas?.some(area => area.role === "active-task-intent" && (area.paths?.length || area.excludePaths?.length));
 if (!policy.commands.length && !policy.markdown.allow.length && !policy.markdown.deny.length && !customRoots) return;
 const root = runtime.root, generation = runtime.generation;
 const context = JSON.stringify([root, revision, generation]);
 if (prompts.get(runtime) === context) return;
 prompts.set(runtime, context);
 const approved = await ctx.ui.confirm("Activate project Plan Mode policy?",
  `Project: ${root}\nRevision: ${revision}\n${JSON.stringify(data, null, 2)}\nCancel leaves project policy inactive. Confirm to Activate this exact revision.`);
 runtime.refresh(ctx.cwd);
 if (runtime.root !== root || runtime.generation !== generation || runtime.project.revision !== revision ||
     !ctx.isProjectTrusted() || runtime.error || runtime.projectActive) return;
 if (approved) runtime.activateProject();
}
