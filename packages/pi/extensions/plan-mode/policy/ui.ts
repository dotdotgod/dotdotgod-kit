import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type ApprovalChoice, PolicyRuntime } from "./runtime.ts";
import type { Invocation } from "./invocation.ts";

export async function approveCommand(ctx:ExtensionContext,value:Invocation):Promise<ApprovalChoice>{
 if(!ctx.hasUI)return "deny";
 const choice=await ctx.ui.select(`Plan Mode: command approval\nExecutable: ${value.executable}\nArguments: ${JSON.stringify(value.args)}\nDirectory: ${value.cwd}\nShell: ${value.shell?"simple shell":"direct"}\nEnvironment: values hidden${value.reusable?"":"; once only"}\nThis invocation only; host permissions still apply.`,["Deny","Allow once",...(value.reusable?["Allow same invocation this session"]:[])]);
 return choice==="Allow once"?"once":choice==="Allow same invocation this session"?"session":"deny";
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
