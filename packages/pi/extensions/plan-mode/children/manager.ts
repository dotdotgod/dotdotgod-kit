import { resolve } from "node:path";
import type { HcCommand } from "./hc-command.ts";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createParentRegistry, type PendingLaunch, type ChildBinding } from "./parent.ts";
import type { Json } from "./channel.ts";
import { PolicyRuntime } from "../policy/runtime.ts";
import { resolveInvocation, invocationKey, type Invocation } from "../policy/invocation.ts";
import { markdownDecision } from "../policy/markdown.ts";
import { classifyPlanCommand } from "../tools.ts";

interface ManagedChild {terminalId:string;launch:PendingLaunch;generation:number;status:string;runtime:PolicyRuntime;roots:string[];policies:ReturnType<PolicyRuntime["policies"]>;availableRules?:string[];unavailableRules?:string[]}
const readTools=new Set(["read","grep","find","ls"]);
export class ChildManager {
 private children=new Map<string,ManagedChild>();
 private registry:ReturnType<typeof createParentRegistry>|undefined;
 private cleanups=new Map<ManagedChild,Promise<void>>();
 private pending=new Set<{controller:AbortController;launch?:PendingLaunch}>();
 private pi:ExtensionAPI;
 private policy:PolicyRuntime;
 constructor(pi:ExtensionAPI,policy:PolicyRuntime){this.pi=pi;this.policy=policy;}
 private async hc(args:string[],cwd:string,signal?:AbortSignal){
  const result=await this.pi.exec("hc",args,{cwd,timeout:180000,...(signal?{signal}:{})});
  if(result.code!==0||result.killed)throw new Error(result.stderr||`hc ${args[0]} failed (${result.code})`);
  return result.stdout;
 }
 private async decide(binding:ChildBinding,operation:Json){
  const child=this.children.get(binding.terminalId);
  this.policy.refresh(binding.root);
  if(!child||child.generation!==this.policy.generation||child.launch.signal.aborted)return {allow:false,reasonCode:"Parent policy changed or run revoked"};
  if(!operation||typeof operation!=="object"||Array.isArray(operation))return {allow:false,reasonCode:"Invalid child operation"};
  const op=operation as Record<string,unknown>;
  const input=op.input as Record<string,unknown>|undefined;
  if(typeof op.toolName!=="string"||!input)return {allow:false,reasonCode:"Invalid child operation"};
  if(readTools.has(op.toolName))return {allow:true,reasonCode:"Inherited reader"};
  if(op.toolName==="write"||op.toolName==="edit"){
   if(typeof input.path!=="string")return {allow:false,reasonCode:"Missing path"};
   const combined={commands:[],markdown:{allow:child.policies.flatMap(p=>p.markdown.allow),deny:child.policies.flatMap(p=>p.markdown.deny)}};
   return {allow:markdownDecision(binding.root,input.path,child.roots,combined)==="allow",reasonCode:"Inherited Markdown ceiling"};
  }
  if(op.toolName!=="bash")return {allow:false,reasonCode:"Unknown inherited tool"};
  try{
   const actual=op.invocation as Invocation;
   if(typeof input.command!=="string"||!actual||typeof actual.environmentFingerprint!=="string")throw new Error("Missing invocation");
   const expected=resolveInvocation({command:input.command},binding.root);
   if(expected.executable!==actual.executable||JSON.stringify(expected.args)!==JSON.stringify(actual.args)||expected.cwd!==actual.cwd||expected.fileIdentity!==actual.fileIdentity)throw new Error("Invocation identity mismatch");
   const classification=classifyPlanCommand(expected.command);
   if(classification.kind==="deny")return {allow:false,reasonCode:classification.reason??"Prohibited"};
   const ruleMatches=(effect:"allow"|"deny")=>child.policies.some(p=>p.commands.some(r=>r.effect===effect&&r.executable===actual.executable&&r.cwd===actual.cwd&&JSON.stringify(r.args)===JSON.stringify(actual.args)));
   if(ruleMatches("deny"))return {allow:false,reasonCode:"Explicit inherited deny"};
   if(classification.kind==="safe")return {allow:true,reasonCode:"Inherited built-in reader"};
   const decision=await child.runtime.authorize(actual);
   return {allow:decision.allow&&ruleMatches("allow"),reasonCode:decision.reason??"Inherited persistent command"};
  }catch(error){return {allow:false,reasonCode:String(error)};}
 }
 async execute(request:HcCommand,ctx:ExtensionContext,signal?:AbortSignal):Promise<string>{
  signal?.throwIfAborted();
  this.policy.refresh(ctx.cwd);
  if(request.kind==="lifecycle"){
   const child=this.children.get(request.id);
   if(!child||child.status==="cleaned")throw new Error("Not a managed child");
   const cwd=child.launch.binding?.root??child.runtime.root;
   if(request.command==="send"&&(child.launch.signal.aborted||child.generation!==this.policy.generation))throw new Error("Managed child unavailable or stale");
   if(request.command==="kill"||request.command==="rm"){
    const status=child.status;
    child.status="revoking";
    try{await child.launch.revoke("Stopped by parent");}finally{child.status=status;}
    const output=await this.hc(request.args,cwd,signal);
    child.status=request.command==="rm"?"cleaned":"killed";
    return output;
   }
   return this.hc(request.args,cwd,request.command==="send"?(signal?AbortSignal.any([signal,child.launch.signal]):child.launch.signal):signal);
  }
  if(!ctx.hasUI||!ctx.model)throw new Error("Interactive launch approval and a resolved model are required");
  if(this.policy.error)throw new Error(this.policy.error);
  if(process.platform==="win32")throw new Error("Managed children currently require local POSIX sockets");
  const task=request.task;
  const generation=this.policy.generation;
  const root=this.policy.root;
  if(request.cwd&&resolve(ctx.cwd,request.cwd)!==root)throw new Error("Managed child cwd must match the policy root");
  const sessionId=ctx.sessionManager.getSessionId();
  const parentModel={provider:ctx.model.provider,id:ctx.model.id};
  const model={provider:request.provider??parentModel.provider,id:request.model??parentModel.id};
  const pending:{controller:AbortController;launch?:PendingLaunch}={controller:new AbortController()};
  this.pending.add(pending);
  const abort=()=>pending.controller.abort(signal?.reason);
  signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted)abort();
  const check=()=>{
   this.policy.refresh(ctx.cwd);
   if(pending.controller.signal.aborted||generation!==this.policy.generation||root!==this.policy.root||sessionId!==ctx.sessionManager.getSessionId()||parentModel.provider!==ctx.model?.provider||parentModel.id!==ctx.model?.id)throw new Error("Launch context changed or revoked");
  };
  try{
  if(!await ctx.ui.confirm("Launch restricted planning child?",`Task: ${task}\nModel: ${model.provider}/${model.id}\nWrite roots: ${JSON.stringify(this.policy.roots)}\nPolicies: ${JSON.stringify(this.policy.policies())}\nAudited plugin loadout; no discovered extensions/MCP or further delegation.\nTrusted tool boundary, not OS isolation. In-flight cancellation is best effort.`))throw new Error("Managed child launch declined");
  check();
  this.registry??=createParentRegistry({parentSessionId:sessionId,authorize:(binding,op)=>this.decide(binding,op),verifyReady:(binding,fingerprint)=>{
   const child=this.children.get(binding.terminalId);
   if(!child||!/^[a-f0-9]{64}$/.test(fingerprint))throw new Error("Invalid child environment fingerprint");
   const activations=child.runtime.ceiling().activations;
   child.availableRules=[];child.unavailableRules=[];
   for(const [key,identity] of activations){
    let environment:string|undefined;
    try{environment=(JSON.parse(identity) as string[])[0];}catch{/* Unavailable activation stays unavailable. */}
    (environment===fingerprint?child.availableRules:child.unavailableRules).push(key);
   }
  }});
  const ceiling=this.policy.ceiling();const {policies,roots}=ceiling;
  const launch=await this.registry.createPendingLaunch({root,policyGeneration:generation,ceiling:ceiling as unknown as Json});
  pending.launch=launch;
  const cancel=()=>{void launch.revoke("Parent launch cancelled");};
  pending.controller.signal.addEventListener("abort",cancel,{once:true});
  let child:ManagedChild|undefined;
  try{
   const entry=fileURLToPath(new URL("./entry.ts",import.meta.url));
   check();
   const piExecutable=resolveInvocation({executable:"pi"},root).executable;
   const raw=await this.hc(["run","--bg","--cwd",root,...(request.name?["--name",request.name]:[]),piExecutable,"--no-extensions","--no-tools","--no-mcp","-e",entry,"--dd-plan","--dd-plan-parent",launch.credentialLocator,"--provider",model.provider,"--model",model.id,...(request.thinking?["--thinking",request.thinking]:[])],root,pending.controller.signal);
   const result=JSON.parse(raw) as {address?:string};if(!result.address)throw new Error("hc launch missing terminal identity");
   const runtime=new PolicyRuntime();runtime.refresh(root);runtime.useCeiling(ceiling);
   child={terminalId:result.address,launch,generation,status:"verifying",runtime,roots,policies};this.children.set(child.terminalId,child);
   check();
   launch.attachTerminal(child.terminalId);
   launch.signal.addEventListener("abort",()=>{if(child&&child.status!=="revoking")void this.cleanup(child,String(launch.signal.reason)).catch(()=>{/* Retained for explicit cleanup retry. */});},{once:true});
   await launch.waitReady();check();
   if(launch.signal.aborted||generation!==this.policy.generation)throw new Error("Launch revoked before task delivery");
   child.status="ready";
   if(child.unavailableRules?.length){
    if(!await ctx.ui.confirm("Continue with limited child command authority?",`${child.unavailableRules.length} persistent command rules are unavailable in the child environment. Continue only if this task can use built-in reads, approved Markdown and available commands?`))throw new Error("Child environment mismatch: task delivery declined");
    check();if(launch.signal.aborted)throw new Error("Launch revoked during environment approval");
   }
   // No initial task is passed to hc; only authenticated restriction readiness releases work.
   if(task!==undefined){await this.hc(["send",child.terminalId,task],root,launch.signal);check();if(launch.signal.aborted)throw new Error("Launch revoked during task send");child.status="working";}
   return JSON.stringify({...JSON.parse(raw),readiness:true,first_message:{sent:task!==undefined}});
  }catch(error){if(child)await this.cleanup(child,String(error));else await launch.close();throw error;}
  finally{pending.controller.signal.removeEventListener("abort",cancel);}
  }finally{this.pending.delete(pending);signal?.removeEventListener("abort",abort);}
 }
 private cleanup(child:ManagedChild,reason:string):Promise<void>{
  const existing=this.cleanups.get(child);if(existing)return existing;
  const promise=Promise.resolve().then(()=>this.performCleanup(child,reason));this.cleanups.set(child,promise);
  void promise.catch(()=>{if(this.cleanups.get(child)===promise)this.cleanups.delete(child);});return promise;
 }
 private async performCleanup(child:ManagedChild,reason:string){
  if(child.status==="cleaned")return;
  await child.launch.revoke(reason);
  if(child.status!=="killed"){await this.hc(["kill",child.terminalId],child.launch.binding?.root??child.runtime.root);child.status="killed";}
  await this.hc(["rm",child.terminalId],child.launch.binding?.root??child.runtime.root);child.status="cleaned";
 }
 async revokeAll(reason:string){
  const registry=this.registry;this.registry=undefined;
  for(const pending of this.pending)pending.controller.abort(new Error(reason));
  await registry?.close();
  await Promise.all([...this.pending].flatMap(p=>p.launch?[p.launch.revoke(reason)]:[]));
  await Promise.all([...this.children.values()].map(c=>this.cleanup(c,reason)));
 }
}
