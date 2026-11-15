import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
const require=createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const jiti=require("jiti").createJiti(import.meta.url);
const install=await jiti.import(new URL("../extensions/plan-mode/index.ts",import.meta.url).pathname,{default:true}) as (pi:ExtensionAPI)=>void;

for(const route of ["native","user"]){
 for(const change of ["none","command","cwd","session","trust","cancel","wait-session","wait-cwd","wait-trust","ui-cwd","ui-trust"]){
  test(`${route} execution admission: ${change}`,async()=>{
   const root=realpathSync(mkdtempSync(join(tmpdir(),"plan-admit-")));
   const previous=process.env.HOME;process.env.HOME=root;
   const program=join(root,"inspect");writeFileSync(program,"#!/bin/sh\nprintf accepted\n",{mode:0o755});
   const handlers=new Map<string,Function>(),tools=new Map<string,any>();let session="session",trusted=false;
   const pi={on:(n:string,h:Function)=>handlers.set(n,h),registerTool:(t:any)=>tools.set(t.name,t),registerCommand(){},registerFlag(){},registerShortcut(){},getFlag:(n:string)=>n==="dd-plan",getSettings:()=>({}),getActiveTools:()=>[],getAllTools:()=>[{name:"bash"}],setActiveTools(){},appendEntry(){},sendUserMessage(){},sendMessage(){},exec:async()=>({stdout:"{}",stderr:"",code:0,killed:false})};
   const ctx={cwd:root,hasUI:true,mode:"tui",model:{provider:"openai",id:"fixture"},isProjectTrusted:()=>trusted,sessionManager:{getSessionId:()=>session,getEntries:()=>[]},ui:{theme:{fg:(_c:string,t:string)=>t},setStatus(){},setWidget(){},notify(){},select:async()=>{if(change==="ui-cwd")ctx.cwd=tmpdir();if(change==="ui-trust")trusted=true;return "Always this project";}}};
   try{
    install(pi as unknown as ExtensionAPI);await handlers.get("session_start")!({},ctx);
    const event={toolName:"bash",toolCallId:"approved",input:{command:program}};
    let operations:any;
    if(route==="native") { const result=await handlers.get("tool_call")!(event,ctx); if(change==="ui-cwd") { assert.equal(result.block,true); return; } assert.equal(result,undefined); }
    else operations=(await handlers.get("user_bash")!({command:program,cwd:root},ctx)).operations;
    const store=join(root,".dotdotgod/plan-approvals/grants.json");assert.equal(existsSync(store),false,"preflight must not commit");
    if(change==="cwd")ctx.cwd=tmpdir();if(change==="session")session="other";if(change==="trust")trusted=true;
    if(change.startsWith("wait-")) {
     mkdirSync(join(root,".dotdotgod/plan-approvals"),{recursive:true,mode:0o700});
     writeFileSync(join(root,".dotdotgod/plan-approvals/grants.json.lock"),"",{mode:0o600});
     setTimeout(()=>{if(change==="wait-session")session="late";if(change==="wait-cwd")ctx.cwd=tmpdir();if(change==="wait-trust")trusted=true;unlinkSync(join(root,".dotdotgod/plan-approvals/grants.json.lock"));},30);
    }
    const controller=new AbortController();if(change==="cancel")controller.abort();
    const run=()=>route==="native"?tools.get("bash").execute("approved",{...event.input,...(change==="command"?{command:"echo changed"}:{})},controller.signal,()=>{},ctx):operations.exec(change==="command"?"echo changed":program,root,{signal:controller.signal,onData(){},timeout:1000});
    if(change==="none"){await run();assert.equal(existsSync(store),true);}else{await assert.rejects(run());assert.equal(existsSync(store),false);}
   }finally{await handlers.get("session_shutdown")!({},ctx);if(previous===undefined)delete process.env.HOME;else process.env.HOME=previous;rmSync(root,{recursive:true,force:true});}
  });
 }
}
