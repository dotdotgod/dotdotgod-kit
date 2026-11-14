import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHcCommand } from "../extensions/plan-mode/children/hc-command.ts";
import { ChildManager } from "../extensions/plan-mode/children/manager.ts";
import { PolicyRuntime } from "../extensions/plan-mode/policy/runtime.ts";
import { connectChild } from "../extensions/plan-mode/children/client.ts";
import { deferred } from "../extensions/plan-mode/children/channel.ts";
import { environmentFingerprint } from "../extensions/plan-mode/policy/invocation.ts";

for (const phase of ["spawn", "send", "readiness", "invalid-fingerprint", "signal", "signal-send"]) test(`manager revokes pending ${phase} without unrelated cleanup or task retry`, async () => {
 const root=mkdtempSync(join(tmpdir(),"dd-manager-"));
 const calls:string[][]=[]; const entered=deferred<void>(); const release=deferred<void>();
 let child:Awaited<ReturnType<typeof connectChild>>|undefined;
 const pi={exec:async(_command:string,args:string[],options:{signal?:AbortSignal})=>{
  calls.push(args);
  if(args[0]==="run"){
   assert.ok(args[args.indexOf("--cwd")+2]!.startsWith("/"));
   if(phase==="spawn"){entered.resolve();await release.promise;assert.equal(options.signal?.aborted,true);}
   else {
    const locator=args[args.indexOf("--dd-plan-parent")+1]!;
    void connectChild({locator,terminalId:"owned",sessionId:"child"}).then(async(value)=>{child=value;if(phase==="readiness"||phase==="signal"){entered.resolve();return;}await value.acknowledgeReady(phase==="invalid-fingerprint"?"forged":environmentFingerprint(process.env));if(phase==="invalid-fingerprint")entered.resolve();});
   }
   return {stdout:JSON.stringify({address:"owned"}),stderr:"",code:0,killed:false};
  }
  if(args[0]==="send"){
   entered.resolve();await new Promise<void>((resolve)=>options.signal!.addEventListener("abort",()=>resolve(),{once:true}));
   return {stdout:"",stderr:"cancelled",code:1,killed:true};
  }
  return {stdout:"",stderr:"",code:0,killed:false};
 }};
 const runtime=new PolicyRuntime();runtime.refresh(root);
 const manager=new ChildManager(pi as any,runtime);const controller=new AbortController();
 const ctx={cwd:root,model:{provider:"faux",id:"fixture"},hasUI:true,sessionManager:{getSessionId:()=>"parent"},ui:{confirm:async()=>true,notify(){}}};
 const command=manager.execute(parseHcCommand(["hc","run","--bg","pi","--dd-plan","task"])!,ctx as any,controller.signal);
 const rejected=assert.rejects(command);
 try{
  await entered.promise;
  if(phase==="invalid-fingerprint")await rejected;
  else if(phase==="signal"||phase==="signal-send"){controller.abort();await rejected;}
  else {const revoking=manager.revokeAll("test cancellation");release.resolve();await revoking;await rejected;}
  assert.equal(calls.filter(args=>args[0]==="send").length,phase==="send"||phase==="signal-send"?1:0);
  assert.deepEqual(calls.filter(args=>args[0]==="kill"||args[0]==="rm").map(args=>args.slice(0,2)),[["kill","owned"],["rm","owned"]]);
 }finally{child?.close();await manager.revokeAll("fixture cleanup");rmSync(root,{recursive:true,force:true});}
});

test("registry resets for new parent session and failed scoped cleanup can retry",async()=>{
 const root=mkdtempSync(join(tmpdir(),"dd-reset-"));const calls:string[][]=[];
 let failKill=true;let sessionId="first";let count=0;
 const clients:Array<Awaited<ReturnType<typeof connectChild>>>=[];
 const pi={exec:async(_command:string,args:string[])=>{
  calls.push(args);
  if(args[0]==="run"){
   const id=`owned-${++count}`;const locator=args[args.indexOf("--dd-plan-parent")+1]!;
   void connectChild({locator,terminalId:id,sessionId:id}).then(async child=>{clients.push(child);await child.acknowledgeReady(environmentFingerprint(process.env));});
   return {stdout:JSON.stringify({address:id}),stderr:"",code:0,killed:false};
  }
  if(args[0]==="kill"&&failKill){failKill=false;return {stdout:"",stderr:"kill failed",code:1,killed:false};}
  return {stdout:"",stderr:"",code:0,killed:false};
 }};
 const runtime=new PolicyRuntime();runtime.refresh(root);const manager=new ChildManager(pi as any,runtime);
 const ctx={cwd:root,model:{provider:"faux",id:"fixture"},hasUI:true,sessionManager:{getSessionId:()=>sessionId},ui:{confirm:async()=>true,notify(){}}};
 try{
  await manager.execute(parseHcCommand(["hc","run","--bg","pi","--dd-plan","first"])!,ctx as any);
  await assert.rejects(manager.revokeAll("end first"),/kill failed/);
  await manager.revokeAll("retry cleanup");
  assert.equal(calls.filter(args=>args[0]==="kill"&&args[1]==="owned-1").length,2);
  sessionId="second";
  await manager.execute(parseHcCommand(["hc","run","--bg","pi","--dd-plan","second"])!,ctx as any);
  assert.equal((manager as any).children.get("owned-2").launch.binding.parentSessionId,"second");
  await manager.revokeAll("end second");
  assert.equal(calls.filter(args=>args[0]==="rm"&&args[1]==="owned-2").length,1);
 }finally{for(const child of clients)child.close();await manager.revokeAll("finally");rmSync(root,{recursive:true,force:true});}
});

for(const shutdown of [false,true])test(`ready launch and native lifecycle preserve separate kill/rm (shutdown=${shutdown})`,async()=>{
 const root=mkdtempSync(join(tmpdir(),"dd-native-"));const calls:string[][]=[];let client:Awaited<ReturnType<typeof connectChild>>|undefined;let failKill=true;
 const runtime=new PolicyRuntime();runtime.refresh(root);
 const pi={exec:async(_command:string,args:string[])=>{
  calls.push(args);
  if(args[0]==="run"){
   assert.equal(args.includes("--name"),true);assert.equal(args[args.indexOf("--model")+1],"explicit");
   void connectChild({locator:args[args.indexOf("--dd-plan-parent")+1]!,terminalId:"owned",sessionId:"child"}).then(async child=>{client=child;await child.acknowledgeReady(environmentFingerprint(process.env));});
   return {stdout:'{"address":"owned"}',stderr:"",code:0,killed:false};
  }
  if(args[0]==="kill"){
   assert.equal((manager as any).children.get("owned").launch.signal.aborted,true);
   if(failKill){failKill=false;return {stdout:"",stderr:"retry kill",code:1,killed:false};}
  }
  return {stdout:JSON.stringify(args),stderr:"",code:0,killed:false};
 }};
 const manager=new ChildManager(pi as any,runtime);
 const ctx={cwd:root,model:{provider:"faux",id:"fixture"},hasUI:true,sessionManager:{getSessionId:()=>"parent"},ui:{confirm:async()=>true,notify(){throw new Error("No lifecycle notifications");}}};
 const execute=(...args:string[])=>manager.execute(parseHcCommand(["hc",...args])!,ctx as any);
 try{
  await assert.rejects(execute("run","--bg","--cwd","/other","pi","--dd-plan"),/cwd/);
  const launched=JSON.parse(await execute("run","--bg","--name","review","pi","--dd-plan","--provider","p","--model","explicit",...(shutdown?["literal task"]:[])));
  assert.equal(launched.readiness,true);assert.equal(launched.first_message.sent,shutdown);assert.equal(calls.some(a=>a[0]==="send"),shutdown);
  for(const command of ["get","read","wait","interrupt","kill","rm","send"])await assert.rejects(execute(command,"unrelated",...(command==="send"?["task"]:[])),/Not a managed/);
  for(const args of [["get","owned"],["read","--lines","10","owned"],["wait","owned"],["interrupt","owned"],["send","--wait","owned","--help"]])assert.deepEqual(JSON.parse(await execute(...args)),args);
  await assert.rejects(execute("kill","owned"),/retry kill/);
  assert.equal(calls.some(a=>a[0]==="rm"),false);
  await execute("kill","owned");assert.equal(calls.some(a=>a[0]==="rm"),false);
  await execute("read","owned");
  if(shutdown)await manager.revokeAll("shutdown after native kill");else await execute("rm","owned");
  assert.equal(calls.filter(a=>a[0]==="kill").length,2);
  assert.equal(calls.filter(a=>a[0]==="rm").length,1);
  await assert.rejects(execute("get","owned"),/Not a managed/);
 }finally{client?.close();await manager.revokeAll("done");rmSync(root,{recursive:true,force:true});}
});
