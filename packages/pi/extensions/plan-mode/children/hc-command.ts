import { basename } from "node:path";

export type HcCommand =
 | {kind:"run";cwd?:string;name?:string;provider?:string;model?:string;thinking?:string;task?:string}
 | {kind:"lifecycle";command:"send"|"wait"|"get"|"read"|"interrupt"|"kill"|"rm";id:string;args:string[]};

/** Input is one shell-tokenized simple command, including the hc executable. */
export function parseHcCommand(tokens:string[]):HcCommand|undefined {
 if(!tokens[0]||basename(tokens[0])!=="hc")return;
 const command=tokens[1];
 if(!command||["ls","templates","help","--help","-h","--skill","--version","-V"].includes(command)||(tokens.length===3&&(tokens[2]==="--help"||tokens[2]==="-h")))return;
 const unsafe=():never=>{throw new Error("Unsafe hc command: use a managed local Pi planning launch or a managed child ID");};
 if(command==="run"){
  const request:Extract<HcCommand,{kind:"run"}>={kind:"run"};
  let i=2;let background=false;const seen=new Set<string>();
  while(i<tokens.length&&tokens[i]!=="pi"){
   const flag=tokens[i++]!;if(seen.has(flag))unsafe();seen.add(flag);
   if(flag==="--bg"){background=true;continue;}
   if(flag!=="--cwd"&&flag!=="--name")unsafe();
   const value=tokens[i++];if(!value||value.startsWith("-"))unsafe();
   if(flag==="--cwd")request.cwd=value!;else request.name=value!;
  }
  if(!background||tokens[i++]!=="pi"||tokens[i++]!=="--dd-plan")unsafe();
  while(i<tokens.length){
   const flag=tokens[i++]!;
   if(!flag.startsWith("-")){if(i!==tokens.length)unsafe();request.task=flag;break;}
   if(!["--provider","--model","--thinking"].includes(flag)||seen.has(flag))unsafe();seen.add(flag);
   const value=tokens[i++];if(!value||value.startsWith("-"))unsafe();
   if(flag==="--provider")request.provider=value!;else if(flag==="--model")request.model=value!;else request.thinking=value!;
  }
  if(Boolean(request.provider)!==Boolean(request.model))unsafe();
  return request;
 }
 if(!["send","wait","get","read","interrupt","kill","rm"].includes(command))return unsafe();
 let id:string|undefined;let message=false;const seen=new Set<string>();
 for(let i=2;i<tokens.length;i++){
  const token=tokens[i]!;
  if(command==="send"&&id&&!message&&token!=="--wait"&&token!=="--force"){message=true;continue;}
  if(token.startsWith("-")){
   if(seen.has(token))unsafe();seen.add(token);
   if(token==="--wait"&&command==="send")continue;
   if(token==="--lines"&&command==="read") {if(!/^\d+$/.test(tokens[++i]??""))unsafe();continue;}
   unsafe();
  }
  if(!id){id=token;continue;}
  if(command!=="send"||message)unsafe();message=true;
 }
 if(!id||(command==="send"&&!message))unsafe();
 return {kind:"lifecycle",command:command as Extract<HcCommand,{kind:"lifecycle"}>["command"],id:id!,args:tokens.slice(1)};
}
