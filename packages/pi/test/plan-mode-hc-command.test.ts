import assert from "node:assert/strict";
import test from "node:test";
import { parseHcCommand } from "../extensions/plan-mode/children/hc-command.ts";

test("managed run parses literal task and optional readiness-only launch",()=>{
 assert.deepEqual(parseHcCommand(["hc","run","--bg","pi","--dd-plan"]),{kind:"run"});
 assert.deepEqual(parseHcCommand(["/tmp/bin/hc","run","--bg","pi","--dd-plan"]),{kind:"run"});
 assert.deepEqual(parseHcCommand(["hc","send","t1","--help"]),{kind:"lifecycle",command:"send",id:"t1",args:["send","t1","--help"]});
 assert.deepEqual(parseHcCommand(["hc","run","--bg","--cwd","/repo","--name","review","pi","--dd-plan","--provider","p","--model","m","--thinking","high","literal ; $(task)"]),{kind:"run",cwd:"/repo",name:"review",provider:"p",model:"m",thinking:"high",task:"literal ; $(task)"});
});
test("unsafe launches and lifecycle overrides fail closed",()=>{
 for(const args of [
  ["run","pi","--dd-plan"],["run","--bg","template"],["run","--bg","sh","-c","pi"],
  ...["--on","--outlive-parent","--keep","--unknown"].map(flag=>["run","--bg",flag,"pi","--dd-plan"]),
  ...["-p","--resume","-e","--provider","--model"].map(flag=>["run","--bg","pi","--dd-plan",flag,"value"]),
  ["run","--bg","sh","--help","payload"],["kill","t1","--force","--help"],
  ["kill","--force","t1"],["wait","--children","all"],["read","t1","--lines","-1"],["send","t1","a","b"],
 ])assert.throws(()=>parseHcCommand(["hc",...args]),/Unsafe/);
});
test("native lifecycle argv is preserved and inspections stay generic",()=>{
 for(const args of [["send","--wait","t1","hello world"],["read","--lines","0","t1"],["get","t1"],["wait","t1"],["interrupt","t1"],["kill","t1"],["rm","t1"]])assert.deepEqual(parseHcCommand(["hc",...args]),{kind:"lifecycle",command:args[0],id:"t1",args});
 for(const args of [["hc","ls"],["hc","templates"],["hc","help"],["hc","--skill"],["/tmp/bin/hc","--skill"],["/tmp/bin/hc","--version"],["hc","-V"],["hc","run","--help"],["git","status"]])assert.equal(parseHcCommand(args),undefined);
});
