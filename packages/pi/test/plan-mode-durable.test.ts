import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DurableApprovals, durableKeys } from "../extensions/plan-mode/policy/durable.ts";
import { resolveInvocation } from "../extensions/plan-mode/policy/invocation.ts";
import { PolicyRuntime, type ApprovalChoice } from "../extensions/plan-mode/policy/runtime.ts";
import { approveCommand } from "../extensions/plan-mode/policy/ui.ts";

function fixture() {
 const directory = realpathSync(mkdtempSync(join(tmpdir(), "plan-durable-")));
 const roots = [join(directory, "a"), join(directory, "b")];
 for (const root of roots) { mkdirSync(root); mkdirSync(join(root,"sub")); writeFileSync(join(root,"inspect"), "#!/bin/sh\necho inspect\n", {mode:0o755}); }
 const store = new DurableApprovals(join(directory,"private"));
 const runtime = (root = roots[0]!) => { const r = new PolicyRuntime(store); r.refresh(root); return r; };
 const invocation = (root = roots[0]!, args = ["private-argument"], cwd = ".") => resolveInvocation({executable:join(root,"inspect"),args,cwd},root);
 return {directory, roots, store, runtime, invocation, cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}

for (const choice of ["deny","once","session","project","global"] as const) {
 test(`five outcomes: ${choice}`, async () => {
  const f = fixture(); try {
   const r = f.runtime(), v = f.invocation();
   assert.equal((await r.authorize(v,async()=>choice)).allow,choice!=="deny");
   assert.equal((await r.authorize(v)).allow,["session","project","global"].includes(choice));
   assert.equal((await f.runtime().authorize(f.invocation())).allow,["project","global"].includes(choice));
   assert.equal((await f.runtime(f.roots[1]).authorize(f.invocation(f.roots[1]))).allow,choice==="global");
   if (choice==="project" || choice==="global") {
    const bytes=readFileSync(join(f.store.directory,"grants.json"),"utf8");
    assert.ok(!bytes.includes("private-argument")); assert.ok(!bytes.includes(f.roots[0]!));
   }
  } finally { f.cleanup(); }
 });
}

test("durable identity binds args, relative cwd, entry bytes and known interpreter", async()=>{
 const f=fixture();try{
  const v=f.invocation(); const keys=durableKeys(v,f.roots[0]!)!;
  assert.ok(keys); await f.runtime().authorize(v,async()=>"global");
  assert.equal((await f.runtime().authorize(f.invocation(undefined,["other"]))).allow,false);
  assert.equal((await f.runtime().authorize(f.invocation(undefined,undefined,"sub"))).allow,false);
  writeFileSync(join(f.roots[1]!,"inspect"),"#!/bin/sh\necho changed\n");
  assert.equal((await f.runtime(f.roots[1]).authorize(f.invocation(f.roots[1]))).allow,false);
  writeFileSync(join(f.roots[0]!,"inspect"),"#!/usr/bin/env sh\necho inspect\n");
  assert.equal(durableKeys(f.invocation(),f.roots[0]!),undefined);
  writeFileSync(join(f.roots[0]!,"inspect"),"unidentified executable\n");
  assert.equal(durableKeys(f.invocation(),f.roots[0]!),undefined);
 }finally{f.cleanup();}
});

test("all denied/cancelled/stale contexts, MCP/env and children cannot persist",async()=>{
 const f=fixture();try{
  for(const choice of [undefined,"deny"] as const){assert.equal((await f.runtime().authorize(f.invocation(),choice?async()=>choice:undefined)).allow,false);}
  const stale=f.runtime();assert.equal((await stale.authorize(f.invocation(),async()=>{stale.clear();return "global";})).allow,false);
  for(const source of ["mcp","native"] as const){
   const v=resolveInvocation({executable:join(f.roots[0]!,"inspect"),...(source==="native"?{env:{PRIVATE:"hidden"}}:{})},f.roots[0]!,source);
   const r=f.runtime();assert.deepEqual(r.scopes(v),[]);assert.equal((await r.authorize(v,async()=>"global")).allow,false);
  }
  const r=f.runtime();r.useCeiling(r.ceiling());assert.deepEqual(r.scopes(f.invocation()),[]);
  assert.equal((await r.authorize(f.invocation(),async()=>"global")).allow,false);
  assert.equal(existsSync(f.store.directory),false);
 }finally{f.cleanup();}
});

test("whole-request staging leaves no partial session or persistent grants",async()=>{
 const f=fixture();try{
  const r=f.runtime(), batch=r.batch(), v=f.invocation();
  assert.equal((await r.authorize(v,async()=>"global",batch)).allow,true);
  assert.equal((await r.authorize(f.invocation(undefined,["session"]),async()=>"session",batch)).allow,true);
  assert.equal((await r.authorize(f.invocation(undefined,["denied"]),async()=>"deny",batch)).allow,false);
  assert.equal((await r.authorize(v)).allow,false);
  assert.equal((await r.authorize(f.invocation(undefined,["session"]))).allow,false);
  assert.equal(existsSync(f.store.directory),false);
  const stale=r.batch();await r.authorize(v,async()=>"project",stale);r.clear();
  assert.equal((await r.finalize(stale)).allow,false);assert.equal(existsSync(f.store.directory),false);
 }finally{f.cleanup();}
});

test("atomic store merges concurrent writers and denies precommit failures",async()=>{
 const f=fixture();try{
  const keys=durableKeys(f.invocation(),f.roots[0]!)!;
  mkdirSync(f.store.directory,{mode:0o700});
  writeFileSync(`${f.store.file}.lock`,"",{mode:0o600});
  const release=setTimeout(()=>unlinkSync(`${f.store.file}.lock`),30);
  await Promise.all([f.store.save([`project:${keys.project}`],()=>true),new DurableApprovals(f.store.directory).save([`global:${keys.global}`],()=>true)]);
  clearTimeout(release);
  assert.equal(JSON.parse(readFileSync(join(f.store.directory,"grants.json"),"utf8")).length,2);
  const before=readFileSync(join(f.store.directory,"grants.json"),"utf8");
  await assert.rejects(f.store.save([`global:${"a".repeat(64)}`],()=>false));
  assert.equal(readFileSync(join(f.store.directory,"grants.json"),"utf8"),before);
  chmodSync(f.store.directory,0o755);
  assert.equal((await f.runtime().authorize(f.invocation(),async()=>"once")).allow,false);
 }finally{f.cleanup();}
});

test("save errors deny without once fallback; committed consent survives execution failure",async()=>{
 const f=fixture();try{
  const failing=new DurableApprovals(join(f.directory,"bad"));
  failing.save=async()=>{throw new Error("private secret error");};
  const r=new PolicyRuntime(failing);r.refresh(f.roots[0]!);
  const result=await r.authorize(f.invocation(),async()=>"project");assert.equal(result.allow,false);assert.ok(!result.reason?.includes("secret"));
  const ok=f.runtime();assert.equal((await ok.authorize(f.invocation(),async()=>"project")).allow,true);
  // Execution is outside the consent transaction, including nonzero exit or host refusal.
  assert.equal((await f.runtime().authorize(f.invocation())).allow,true);
 }finally{f.cleanup();}
});

test("secret-like arguments redact preview and remove all reusable authority",async()=>{
 const f=fixture();try {
  const v=f.invocation(undefined,["--token","super-private-value"]);
  assert.equal(durableKeys(v,f.roots[0]!),undefined);
  assert.equal((await f.runtime().authorize(v,async()=>"session")).allow,false);
  const ctx={hasUI:true,ui:{select:async(title:string,choices:string[])=>{assert.ok(!title.includes("super-private-value"));assert.deepEqual(choices,["Deny","Allow once"]);return "Allow once";}}} as unknown as ExtensionContext;
  assert.equal(await approveCommand(ctx,v,["project","global"]),"once");
 }finally{f.cleanup();}
});

test("five-choice selector sanitizes control characters and no UI cancels",async()=>{
 const f=fixture();try{
  const v={...f.invocation(),args:["\x1b[31m\nspoof"]};
  let selection:string|undefined;
  const ctx={hasUI:true,ui:{select:async(title:string,choices:string[])=>{assert.equal(choices.length,5);assert.ok(!title.includes("\x1b"));assert.match(title,/Not a sandbox/);return selection;}}} as unknown as ExtensionContext;
  for(const [label,outcome] of [["Deny","deny"],["Allow once","once"],["Allow same invocation this session","session"],["Always this project","project"],["Always all projects","global"],[undefined,"deny"]] as const){selection=label;assert.equal(await approveCommand(ctx,v,["project","global"]),outcome as ApprovalChoice);}
  assert.equal(await approveCommand({hasUI:false} as ExtensionContext,v,["project","global"]),"deny");
 }finally{f.cleanup();}
});
