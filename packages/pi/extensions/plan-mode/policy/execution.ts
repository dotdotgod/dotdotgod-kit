import { quoteArguments, resolveInvocation, type ExecutionInput, type Invocation } from "./invocation.ts";
import { PolicyRuntime, type ApprovalChoice, type CommandApprovalBatch, type Decision } from "./runtime.ts";
import { basename } from "node:path";

export function guardGit(value: Invocation): Invocation {
 const program=basename(value.executable);
 if(program==="rg")return {...value,args:["--no-config",...value.args],command:quoteArguments([value.executable,"--no-config",...value.args])};
 if(program!=="git")return value;
 const args=["--no-pager","-c","core.fsmonitor=false","-c","core.pager=cat",value.args[0]!,...(["diff","show","log"].includes(value.args[0]??"")?["--no-ext-diff","--no-textconv"]:[]),...value.args.slice(1)];
 return {...value,args,command:quoteArguments([value.executable,...args])};
}
// Policy evaluates the requested command; these forced read-only Git options are never user grants.
export async function authorizeExecution(runtime:PolicyRuntime,input:ExecutionInput,source:"native"|"mcp",ask?:(value:Invocation)=>Promise<ApprovalChoice>,batch?:CommandApprovalBatch):Promise<{decision:Decision;invocation:Invocation;executed:Invocation}>{
 const invocation=resolveInvocation(input,runtime.root,source);
 const decision=await runtime.authorize(invocation,ask,batch);
 return {decision,invocation,executed:guardGit(invocation)};
}
