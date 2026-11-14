import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const require=createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const jiti=require("jiti").createJiti(import.meta.url);
const install=await jiti.import(new URL("../extensions/plan-mode/index.ts",import.meta.url).pathname,{default:true}) as (pi:ExtensionAPI)=>void;

test("existing hc bash lifecycle executes only after tool preflight and rejects foreign targets",async()=>{
 const root=mkdtempSync(join(tmpdir(),"hc-routing-"));
 const hc=join(root,"hc");writeFileSync(hc,"#!/bin/sh\nexit 0\n",{mode:0o755});
 const previousPath=process.env.PATH;process.env.PATH=`${root}:${previousPath??""}`;
 const handlers=new Map<string,Function>();const tools=new Map<string,any>();const commands:string[]=[];
 const calls:string[][]=[];let confirmations=0;
 const pi={on:(name:string,handler:Function)=>handlers.set(name,handler),registerTool:(tool:any)=>tools.set(tool.name,tool),registerCommand:(name:string)=>commands.push(name),registerFlag(){},registerShortcut(){},getFlag:(name:string)=>name==="dd-plan",getSettings:()=>({}),getActiveTools:()=>[],getAllTools:()=>["bash","read","write"].map(name=>({name})),setActiveTools(){},appendEntry(){},sendUserMessage(){},sendMessage(){},exec:async(_cmd:string,args:string[])=>{calls.push(args);return {stdout:"{}",stderr:"",code:0,killed:false};}};
 const ctx={cwd:root,hasUI:true,mode:"tui",model:{provider:"openai",id:"fixture"},isProjectTrusted:()=>false,sessionManager:{getSessionId:()=>"fixture",getEntries:()=>[]},ui:{theme:{fg:(_color:string,text:string)=>text},setStatus(){},setWidget(){},notify(){},confirm:async()=>{confirmations++;return true;}}};
 try{
  install(pi as unknown as ExtensionAPI);await handlers.get("session_start")!({},ctx);
  assert.ok(!commands.includes("dd:plan-child")&&!commands.includes("dd:plan-policy"));
  const event={toolName:"bash",toolCallId:"foreign",input:{command:`'${hc}' send unrelated 'review only'`}};
  const denied=await handlers.get("tool_call")!(event,ctx);
  assert.equal(denied,undefined);assert.deepEqual(calls,[],"preflight must not invoke hc");
  await assert.rejects(tools.get("bash").execute("foreign",event.input,new AbortController().signal,()=>{},ctx),/managed|owned|unknown/i);
  assert.deepEqual(calls,[]);assert.equal(confirmations,0);
  const rejected=await handlers.get("tool_call")!({toolName:"mcp__dotdotgod_context__execute",toolCallId:"batch",input:{commands:[{command:"hc run --bg pi --dd-plan 'task'"}]}},ctx);
  assert.equal(rejected.block,true);assert.match(rejected.reason,/native bash/);assert.deepEqual(calls,[]);
  const unsafe=await handlers.get("tool_call")!({toolName:"bash",toolCallId:"unsafe",input:{command:"hc run --bg sh -c 'touch file'"}},ctx);
  assert.equal(unsafe.block,true);assert.deepEqual(calls,[]);
  mkdirSync(join(root,"other"));const other=join(root,"other/hc");writeFileSync(other,"#!/bin/sh\nexit 0\n",{mode:0o755});
  const mismatched=await handlers.get("tool_call")!({toolName:"bash",toolCallId:"mismatch",input:{command:`'${other}' send unrelated 'task'`}},ctx);
  assert.equal(mismatched.block,true);assert.match(mismatched.reason,/active hc executable/);assert.deepEqual(calls,[]);
 }finally{await handlers.get("session_shutdown")!({},ctx);if(previousPath===undefined)delete process.env.PATH;else process.env.PATH=previousPath;rmSync(root,{recursive:true,force:true});}
});
