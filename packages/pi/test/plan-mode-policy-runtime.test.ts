import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { invocationKey, resolveInvocation } from "../extensions/plan-mode/policy/invocation.ts";
import { PolicyRuntime } from "../extensions/plan-mode/policy/runtime.ts";

test("session grants bind executable contents/context and stale approvals cannot grant", async () => {
 const root = mkdtempSync(join(tmpdir(), "plan-policy-"));
 try {
  const program = join(root, "inspect"); writeFileSync(program, "#!/bin/sh\necho inspect\n"); chmodSync(program, 0o755);
  const first = resolveInvocation({executable:program,args:["--help"]},root);
  const runtime = new PolicyRuntime(); runtime.refresh(root);
  let prompts = 0;
  const ask = async () => { prompts++; return "session" as const; };
  assert.equal((await runtime.authorize(first,ask)).allow,true);
  assert.equal((await runtime.authorize(first,ask)).allow,true); assert.equal(prompts,1);
  writeFileSync(program,"#!/bin/sh\necho changed\n");
  const changed = resolveInvocation({executable:program,args:["--help"]},root);
  assert.notEqual(invocationKey(first),invocationKey(changed));
  assert.equal((await runtime.authorize(changed,async()=>"deny")).allow,false);
  runtime.clear();
  assert.equal((await runtime.authorize(changed,async()=>{runtime.clear();return "session";})).allow,false);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test("MCP unknown invocations cannot reuse Pi environment grants", async () => {
 const root=mkdtempSync(join(tmpdir(),"plan-mcp-once-"));
 try {
  const program=join(root,"inspect");writeFileSync(program,"#!/bin/sh\necho inspect\n");chmodSync(program,0o755);
  const runtime=new PolicyRuntime();runtime.refresh(root);
  const value=resolveInvocation({executable:program,args:["--help"]},root,"mcp");
  assert.equal(value.reusable,false);
  assert.equal((await runtime.authorize(value,async()=>"once")).allow,true);
  assert.equal((await runtime.authorize(value)).allow,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("unactivated project rules cannot grant or deny; activation is exact revision", async () => {
 const root = mkdtempSync(join(tmpdir(), "plan-policy-"));
 try {
  const invocation=resolveInvocation({executable:process.execPath,args:["--version"]},root);
  const rule={effect:"deny",executable:invocation.executable,args:invocation.args,cwd:invocation.cwd};
  writeFileSync(join(root,"dotdotgod.config.json"),JSON.stringify({planMode:{commands:[rule]}}));
  const runtime=new PolicyRuntime();runtime.refresh(root);
  assert.equal((await runtime.authorize(invocation)).allow,true);
  runtime.activateProject(); assert.equal((await runtime.authorize(invocation)).allow,false);
  writeFileSync(join(root,"dotdotgod.config.json"),JSON.stringify({planMode:{commands:[]}}));
  runtime.refresh(root); assert.equal(runtime.projectActive,false);
 } finally {rmSync(root,{recursive:true,force:true});}
});
