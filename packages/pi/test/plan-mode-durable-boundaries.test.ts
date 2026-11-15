import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DurableApprovals, durableKeys } from "../extensions/plan-mode/policy/durable.ts";
import { resolveInvocation } from "../extensions/plan-mode/policy/invocation.ts";
import { PolicyRuntime } from "../extensions/plan-mode/policy/runtime.ts";

test("interpreter bytes invalidate scripts; shared binary identity stays absolute",()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"plan-target-")));
 try{
  const interpreter=join(root,"interpreter");copyFileSync(process.execPath,interpreter);chmodSync(interpreter,0o755);
  const program=join(root,"inspect");writeFileSync(program,`#!${interpreter}\nconsole.log('inspect')\n`,{mode:0o755});
  const value=resolveInvocation({executable:program},root), before=durableKeys(value,root);
  assert.ok(before);writeFileSync(interpreter,"changed interpreter");
  assert.notDeepEqual(durableKeys(value,root),before);
  mkdirSync(join(root,"other"));
  const a=resolveInvocation({executable:process.execPath,args:["--version"]},root);
  const b=resolveInvocation({executable:process.execPath,args:["--version"]},join(root,"other"));
  assert.equal(durableKeys(a,root)?.global,durableKeys(b,join(root,"other"))?.global);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("symlink ancestors and ambiguous binary/script interpreters have no durable authority",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"plan-store-boundary-")));
 try {
  mkdirSync(join(root,"actual"));symlinkSync(join(root,"actual"),join(root,"linked"));
  const store=new DurableApprovals(join(root,"linked/private"));
  await assert.rejects(store.save([`global:${"a".repeat(64)}`],()=>true),/ancestors/);
  const interpreter=join(root,"wrapper");writeFileSync(interpreter,"#!/bin/sh\nexit 0\n",{mode:0o755});
  const program=join(root,"inspect");writeFileSync(program,`#!${interpreter}\nexit 0\n`,{mode:0o755});
  assert.equal(durableKeys(resolveInvocation({executable:program},root),root),undefined);
  const malformed=Buffer.alloc(64,0x20);Buffer.from([127,69,76,70,2,1,1]).copy(malformed);
  Buffer.from("\nprintf marker\n").copy(malformed,32);
  for(const bytes of [malformed,Buffer.from("cafebabe","hex"),Buffer.from("7f454c46","hex"),Buffer.from("cffaedfe","hex")]) {
   writeFileSync(program,bytes);assert.equal(durableKeys(resolveInvocation({executable:program},root),root),undefined);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("stored consent never bypasses explicit deny or interpreter prohibition",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"plan-deny-")));
 try{
  const program=join(root,"inspect");writeFileSync(program,"#!/bin/sh\necho inspect\n",{mode:0o755});
  const store=new DurableApprovals(join(root,"private"));
  const r=new PolicyRuntime(store);r.refresh(root);
  const v=resolveInvocation({executable:program},root);
  assert.equal((await r.authorize(v,async()=>"global")).allow,true);
  writeFileSync(join(root,"dotdotgod.config.json"),JSON.stringify({planMode:{commands:[{effect:"deny",executable:v.executable,args:v.args,cwd:v.cwd}]}}));
  r.refresh(root);r.activateProject();assert.equal((await r.authorize(v,async()=>{throw new Error("must not prompt");})).allow,false);
  const node=resolveInvocation({executable:process.execPath,args:["-e","console.log('unsafe')"]},root);
  const keys=durableKeys(node,root)!;await store.save([`global:${keys.global}`],()=>true);
  assert.equal((await r.authorize(node,async()=>"global")).allow,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
