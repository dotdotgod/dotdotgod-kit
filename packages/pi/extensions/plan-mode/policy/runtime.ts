import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyPlanCommand } from "../tools.ts";
import { canonicalPath, markdownDecision } from "./markdown.ts";
import { loadPolicyFile, type PlanPolicy, type PolicySnapshot } from "./storage.ts";
import { environmentFingerprint, executableIdentity, invocationKey, resolveInvocation, type Invocation } from "./invocation.ts";

import { DurableApprovals, durableKeys, secretArguments } from "./durable.ts";
export type ApprovalChoice = "deny" | "once" | "session" | "project" | "global";
export interface CommandApprovalBatch { rows: string[]; sessions: string[]; checks: Array<() => boolean> }
export interface Decision { allow: boolean; reason?: string }
export class PolicyRuntime {
 private readonly durable: DurableApprovals;
 constructor(durable = new DurableApprovals()) { this.durable = durable; }
 batch(): CommandApprovalBatch { return {rows: [], sessions: [], checks: []}; }
 scopes(value: Invocation): Array<"project" | "global"> { return !this.fixedCeiling && durableKeys(value, this.root) ? ["project", "global"] : []; }
 async finalize(batch: CommandApprovalBatch): Promise<Decision> {
  const valid = () => { if (!this.fixedCeiling) this.refresh(this.root); return batch.checks.every(check => check()); };
  try {
   if (!valid()) return {allow:false, reason:"Plan policy: approval context changed."};
   if (batch.rows.length) await this.durable.save(batch.rows, valid);
   for (const key of batch.sessions) this.grants.add(key);
   return {allow:true};
  } catch { return {allow:false, reason:"Plan mode: approval could not be saved; command denied."}; }
 }
 generation = 0;
 root = "";
 projectActive = false;
 project!: PolicySnapshot;
 user!: PolicySnapshot;
 roots: string[] = [];
 error: string | undefined;
 private signature = "";
 private environment = "";
 private fixedCeiling=false;
 private grants = new Set<string>();
 private activations = new Map<string, string>();
 private pathGrants = new Set<string>();
 private excludedRoots: string[] = [];
 clear(): void { this.generation++; this.grants.clear(); this.pathGrants.clear(); }
 reset():void{this.clear();this.projectActive=false;this.activations.clear();this.signature="";}
 refresh(root: string): void {
  const canonical=canonicalPath(root,".");
  const project=loadPolicyFile(join(canonical,"dotdotgod.config.json"), {allowAbsolutePaths:false});
  const user=loadPolicyFile(join(homedir(),".dotdotgod/config.json"));
  const signature=JSON.stringify([canonical,project.revision,user.revision,project.error,user.error]);
  const environment=environmentFingerprint(process.env);
  if(this.environment && environment!==this.environment){this.clear();this.projectActive=false;for(const key of this.activations.keys())this.activations.set(key,"unavailable");}
  this.environment=environment;
  if(signature!==this.signature){this.clear();this.projectActive=false;this.activations.clear();this.signature=signature;}
  this.root=canonical;this.project=project;this.user=user;this.error=project.error ?? user.error;
  this.roots=["docs/plan/**","docs/plan/README.md","docs/archive/report/**","docs/archive/README.md"];
  this.excludedRoots=[];
  if(this.projectActive){
   const data=project.data;
   const documentation=data.documentation as {root?: string}|undefined;
   const docRoot=documentation?.root ?? "docs";
   const areas=(data.memory as {areas?: Array<{role?:string;paths?:string[];excludePaths?:string[]}>}|undefined)?.areas;
   const plans=areas?.filter(a=>a.role==="active-task-intent").flatMap(a=>a.paths??[]).filter(p=>p.endsWith("/**")||p.endsWith(".md"));
   const planRoots=plans?.length?plans:[`${docRoot}/plan/**`];
   this.excludedRoots=areas?.filter(a=>a.role==="active-task-intent").flatMap(a=>a.excludePaths??[])??[];
   this.roots=[...planRoots,...planRoots.filter(p=>p.endsWith("/**")).map(p=>`${p.slice(0,-3)}/README.md`),`${docRoot}/archive/report/**`,`${docRoot}/archive/README.md`];
  }
 }
 activateProject(): void { this.projectActive=true;this.clear();this.activations.clear();this.refresh(this.root); this.bindRules(); }
 private bindRules():void {
  for(const policy of this.policies())for(const rule of policy.commands){
   const key=this.ruleKey(rule);if(this.activations.has(key))continue;
   try{const v=resolveInvocation({executable:rule.executable,args:rule.args,cwd:rule.cwd},this.root);this.activations.set(key,JSON.stringify([v.environmentFingerprint,v.fileIdentity]));}catch{this.activations.set(key,"unavailable");}
  }
 }
 ceiling():{policies:PlanPolicy[];roots:string[];activations:Array<[string,string]>}{
  this.bindRules();const policies=structuredClone(this.policies());
  policies[0]!.markdown.deny.push(...this.excludedRoots);
  return {policies,roots:[...this.roots],activations:[...this.activations]};
 }
 useCeiling(value:{policies:PlanPolicy[];roots:string[];activations:Array<[string,string]>}):void{
  this.fixedCeiling=true;
  this.user.policy={commands:value.policies.flatMap(p=>p.commands),markdown:{allow:value.policies.flatMap(p=>p.markdown.allow),deny:value.policies.flatMap(p=>p.markdown.deny)}};
  this.projectActive=false;this.roots=value.roots;this.activations=new Map(value.activations);
 }
 policies(): PlanPolicy[] { return [this.user.policy,...(this.projectActive?[this.project.policy]:[])]; }
 private ruleKey(rule: PlanPolicy["commands"][number]): string { return JSON.stringify([rule.executable,rule.args,rule.cwd]); }
 private matching(invocation: Invocation, effect: "allow"|"deny"): boolean {
  return this.policies().some(policy=>policy.commands.some(rule=>{
   if(rule.effect!==effect||rule.executable!==invocation.executable||rule.cwd!==invocation.cwd||JSON.stringify(rule.args)!==JSON.stringify(invocation.args))return false;
   const key=this.ruleKey(rule); const identity=JSON.stringify([invocation.environmentFingerprint,invocation.fileIdentity]);
   const activated=this.activations.get(key);
   if(effect==="allow"&&activated!==identity&&activated!=="unavailable")this.activations.set(key,"unavailable");
   return effect==="deny"||activated===identity;
  }));
 }
 async authorize(invocation:Invocation, ask?: (value:Invocation)=>Promise<ApprovalChoice>, staged?: CommandApprovalBatch):Promise<Decision>{
  this.bindRules();
  if(this.fixedCeiling && executableIdentity(invocation.executable)!==invocation.fileIdentity)return {allow:false,reason:"Inherited executable changed."};
  if(this.error)return {allow:false,reason:`Plan policy invalid: ${this.error}`};
  const classification=classifyPlanCommand(invocation.command);
  if(classification.kind==="deny")return {allow:false,reason:classification.reason ?? "Plan mode: prohibited operation."};
  if(this.matching(invocation,"deny"))return {allow:false,reason:"Plan policy: explicit deny."};
  if(classification.kind==="safe"||(invocation.reusable&&(this.matching(invocation,"allow")||this.grants.has(invocationKey(invocation)))))return {allow:true};
  const batch = staged ?? this.batch();
  const generation=this.generation;
  const keys = !this.fixedCeiling ? durableKeys(invocation, this.root) : undefined;
  const valid = () => {
   try { return generation === this.generation && realpathSync(invocation.cwd) === invocation.cwd && executableIdentity(invocation.executable) === invocation.fileIdentity && (this.fixedCeiling || JSON.stringify(durableKeys(invocation, this.root)) === JSON.stringify(keys)); } catch { return false; }
  };
  batch.checks.push(valid);
  try { if (keys && this.durable.has(keys)) return staged ? {allow:true} : this.finalize(batch); }
  catch { return {allow:false, reason:"Plan mode: approval store unavailable; command denied."}; }
  const choice=await ask?.(invocation);
  if(!this.fixedCeiling)this.refresh(this.root);
  if(generation!==this.generation || executableIdentity(invocation.executable)!==invocation.fileIdentity)return {allow:false,reason:"Plan policy: approval context changed."};
  if (!valid()) return {allow:false,reason:"Plan policy: approval context changed."};
  if(choice==="session"&&invocation.reusable&&!secretArguments(invocation.args))batch.sessions.push(invocationKey(invocation));
  else if ((choice === "project" || choice === "global") && keys) batch.rows.push(`${choice}:${keys[choice]}`);
  else if (choice !== "once") return {allow:false,reason:"Plan mode: command approval denied or unavailable."};
  return staged ? {allow:true} : this.finalize(batch);
 }
 async authorizePath(path:string,ask?: (path:string)=>Promise<ApprovalChoice>):Promise<Decision>{
  if(this.error)return {allow:false,reason:`Plan policy invalid: ${this.error}`};
  const policies=this.policies(); const policy={commands:[],markdown:{allow:policies.flatMap(p=>p.markdown.allow),deny:[...policies.flatMap(p=>p.markdown.deny),...this.excludedRoots]}};
  const decision=markdownDecision(this.root,path,this.roots,policy);
  if(decision==="deny")return {allow:false,reason:"Plan mode: only permitted Markdown planning documents can be changed; instruction/source/config writes require execution mode."};
  const target=canonicalPath(this.root,path);
  if(decision==="allow"||this.pathGrants.has(target))return {allow:true};
  const generation=this.generation;const choice=await ask?.(target);
  if(!this.fixedCeiling)this.refresh(this.root);
  if(generation!==this.generation || canonicalPath(this.root,path)!==target)return {allow:false,reason:"Plan policy: approval context changed."};
  if(choice==="session")this.pathGrants.add(target);
  return choice==="once"||choice==="session"?{allow:true}:{allow:false,reason:"Plan mode: additional Markdown planning path approval denied or unavailable."};
 }
 deniesInvocation(value:Invocation):boolean{return this.matching(value,"deny");}
}
