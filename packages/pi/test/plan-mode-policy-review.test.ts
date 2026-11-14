import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveInvocation } from '../extensions/plan-mode/policy/invocation.ts';
import { PolicyRuntime } from '../extensions/plan-mode/policy/runtime.ts';

function fixture() {
 const root=mkdtempSync(join(tmpdir(),'plan-review-'));
 const executable=join(root,'inspect-review');
 writeFileSync(executable,'#!/bin/sh\necho inspection\n');chmodSync(executable,0o755);
 const input={executable,args:['--help'],cwd:root};
 const invocation=resolveInvocation(input,root);
 const rule={effect:'allow',executable:invocation.executable,args:invocation.args,cwd:invocation.cwd};
 const save=(commands:unknown[]=[])=>writeFileSync(join(root,'dotdotgod.config.json'),JSON.stringify({planMode:{commands}}));
 save();
 const runtime=new PolicyRuntime();runtime.refresh(root);
 return {root,input,invocation,rule,runtime,save,close:()=>rmSync(root,{recursive:true,force:true})};
}

for(const change of ['config','environment'] as const) test(`command approval rejects ${change} changed while dialog open`,async()=>{
 const f=fixture();const key='DD_PLAN_REVIEW_ENV';const previous=process.env[key];
 try {
  const result=await f.runtime.authorize(f.invocation,async()=>{
   if(change==='config')f.save([{...f.rule,effect:'deny'}]);else process.env[key]='changed-during-dialog';
   return 'session';
  });
  assert.equal(result.allow,false);
 } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;f.close();}
});

for(const change of ['config','environment'] as const) test(`Markdown approval rejects ${change} changed while dialog open`,async()=>{
 const f=fixture();const key='DD_PLAN_REVIEW_ENV';const previous=process.env[key];
 try {
  const result=await f.runtime.authorizePath('notes.md',async()=>{
   if(change==='config')writeFileSync(join(f.root,'dotdotgod.config.json'),JSON.stringify({planMode:{markdown:{deny:['notes.md']}}}));else process.env[key]='changed-during-path-dialog';
   return 'session';
  });
  assert.equal(result.allow,false);
 } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;f.close();}
});

test('environment A/B/A cannot resurrect command or Markdown session grants',async()=>{
 const key='DD_PLAN_REVIEW_ENV';const previous=process.env[key];process.env[key]='A';const f=fixture();
 try {
  assert.equal((await f.runtime.authorize(resolveInvocation(f.input,f.root),async()=> 'session')).allow,true);
  assert.equal((await f.runtime.authorizePath('notes.md',async()=> 'session')).allow,true);
  process.env[key]='B';f.runtime.refresh(f.root);
  process.env[key]='A';f.runtime.refresh(f.root);
  assert.equal((await f.runtime.authorize(resolveInvocation(f.input,f.root))).allow,false);
  assert.equal((await f.runtime.authorizePath('notes.md')).allow,false);
 } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;f.close();}
});

test('environment A/B/A invalidates persistent activation until explicit reconfirmation',async()=>{
 const key='DD_PLAN_REVIEW_ENV';const previous=process.env[key];process.env[key]='A';const f=fixture();
 try {
  f.save([f.rule]);f.runtime.refresh(f.root);f.runtime.activateProject();
  assert.equal((await f.runtime.authorize(resolveInvocation(f.input,f.root))).allow,true);
  process.env[key]='B';f.runtime.refresh(f.root);
  process.env[key]='A';f.runtime.refresh(f.root);
  assert.equal((await f.runtime.authorize(resolveInvocation(f.input,f.root))).allow,false);
  f.runtime.activateProject();
  assert.equal((await f.runtime.authorize(resolveInvocation(f.input,f.root))).allow,true);
 } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;f.close();}
});

for(const extra of [{env:{}},{env:{DD_PLAN_REVIEW_ENV:'A'}},{shell:true}] as const) test(`persistent rule cannot authorize explicit non-default context ${JSON.stringify(extra)}`,async()=>{
 const key='DD_PLAN_REVIEW_ENV';const previous=process.env[key];process.env[key]='A';const f=fixture();
 try {
  f.save([f.rule]);f.runtime.refresh(f.root);f.runtime.activateProject();
  const value=resolveInvocation({...f.input,...extra},f.root);
  assert.equal(value.reusable,false);
  assert.equal((await f.runtime.authorize(value)).allow,false);
 } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;f.close();}
});

test('matching-context ceiling preserves persistent rules but excludes parent once and session grants',async()=>{
 const f=fixture();
 try {
  f.save([f.rule]);f.runtime.refresh(f.root);f.runtime.activateProject();
  const once=resolveInvocation({...f.input,args:['once-only']},f.root);
  const session=resolveInvocation({...f.input,args:['session-only']},f.root);
  assert.equal((await f.runtime.authorize(once,async()=> 'once')).allow,true);
  assert.equal((await f.runtime.authorize(session,async()=> 'session')).allow,true);
  assert.equal((await f.runtime.authorizePath('session-notes.md',async()=> 'session')).allow,true);
  const child=new PolicyRuntime();child.refresh(f.root);child.useCeiling(f.runtime.ceiling());
  assert.equal((await child.authorize(resolveInvocation(f.input,f.root))).allow,true);
  assert.equal((await child.authorize(once)).allow,false);
  assert.equal((await child.authorize(session)).allow,false);
  assert.equal((await child.authorizePath('session-notes.md')).allow,false);
 } finally {f.close();}
});

test('inherited persistent activation cannot silently rebind to a different child environment',async()=>{
 const f=fixture();const key='HC_TERMINAL_ID';const previous=process.env[key];
 try {
  f.save([f.rule]);f.runtime.refresh(f.root);f.runtime.activateProject();
  const ceiling=f.runtime.ceiling();
  process.env[key]='review-child-terminal';
  const child=new PolicyRuntime();child.refresh(f.root);child.useCeiling(ceiling);
  const invocation=resolveInvocation(f.input,f.root);
  assert.equal((await child.authorize(invocation)).allow,false,'mismatching inherited activation stays unavailable until a new compatible run is approved');
 } finally {if(previous===undefined)delete process.env[key];else process.env[key]=previous;f.close();}
});
