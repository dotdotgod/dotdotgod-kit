import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPlanCommand, getDotdotgodCliArgs, shouldAllowPlanModeBashCommand, tokenizeShellCommand } from "../extensions/plan-mode/tools.ts";

test("simple tokens preserve quoting, escaping and empty arguments", () => {
	assert.deepEqual(tokenizeShellCommand(`grep '' "a b" c\\ d 'rm'`), ["grep", "", "a b", "c d", "rm"]);
	assert.deepEqual(tokenizeShellCommand(`echo "a\\qb"`), ["echo", "a\\qb"]);
	for (const command of ["ls; pwd", "ls | cat", "echo > out", "echo $(id)", 'echo "`id`"', "echo $HOME", "ls\npwd", "ls \\", "echo 'oops", "echo *", "echo #comment"]) assert.equal(tokenizeShellCommand(command), undefined, command);
});

test("argument-aware safe and prohibited commands", () => {
	for (const command of ["grep 'rm' README.md", "find docs -name README.md", "git status --short", "npm view pkg version", "sed -n '1,10p' README.md", "dotdotgod index .", "dotdotgod query . 'install rm'"]) assert.equal(classifyPlanCommand(command).kind, "safe", command);
	for (const command of ["rm file", "/bin/rm file", "npm --prefix . install", "pnpm run build", "git -C . reset --hard", "git branch new", "git remote add x url", "git config key value", "git diff --output=x", "find . -exec echo x \\;", "find . -delete", "sort -o out file", "rg --pre tool foo", "fd -x tool", "sed -n '1e id' file", "awk 'BEGIN {system(\"id\")}'", "curl -o file https://example.com", "env ls", "bash -c ls", "node -e '1'", "python script.py", "pi", "hc run pi", "dotdotgod init .", "dotdotgod config init ."]) assert.equal(classifyPlanCommand(command).kind, "deny", command);
	for (const command of ["custom-inspect --help", "hc ls", "dotdotgod validate ."]) assert.equal(classifyPlanCommand(command).kind, "approval", command);
});

test("approval is one-shot, unavailable headlessly, and never overrides hard denial", async () => {
	let calls = 0;
	const approval = { hasUI: true, confirm: () => { calls++; return true; } };
	assert.deepEqual(await shouldAllowPlanModeBashCommand("custom-inspect --help", approval), { allow: true });
	assert.equal((await shouldAllowPlanModeBashCommand("rm file", approval)).allow, false);
	assert.equal((await shouldAllowPlanModeBashCommand("hc run pi", approval)).allow, false);
	assert.equal(calls, 1);
	assert.equal((await shouldAllowPlanModeBashCommand("custom-inspect", { ...approval, hasUI: false })).allow, false);
	assert.equal((await shouldAllowPlanModeBashCommand("custom-inspect", { hasUI: true, confirm: () => false })).allow, false);
});

test("canonical CLI executables retain the bounded script match", () => {
	for (const command of ["'/opt/node bin/node' '/repo/packages/cli/bin/dotdotgod.mjs' status .", "'/opt/bin/dotdotgod' status ."]) {
		assert.deepEqual(getDotdotgodCliArgs(command), ["status", "."]);
		assert.equal(classifyPlanCommand(command).kind, "safe");
	}
	for (const command of ["/opt/bin/node /tmp/dotdotgod.mjs status .", "/opt/bin/not-node /repo/packages/cli/bin/dotdotgod.mjs status ."]) assert.equal(getDotdotgodCliArgs(command), undefined);
});

test("hc only exposes read-only inspection to approval", () => {
	for (const command of ["hc update", "hc keep t1", "hc server status", "hc read t1 --unknown", "hc get t1 --keep", "hc ls --exec pi", "hc unknown"]) assert.equal(classifyPlanCommand(command).kind, "deny", command);
	for (const command of ["hc ls", "hc get t1", "hc read --lines 20 t1", "hc --help", "hc templates"]) assert.equal(classifyPlanCommand(command).kind, "approval", command);
});

test("explicit git external execution options never inherit read permission", () => {
	for (const command of ["git -p status", "git -c core.pager=evil log", "git diff --ext-diff", "git show --textconv", "git log --config-env=core.pager=EVIL", "git status -c core.fsmonitor=evil"]) assert.equal(classifyPlanCommand(command).kind, "deny", command);
	for (const command of ["git status --short", "git log -5", "git diff --stat", "git config --get core.pager"]) assert.equal(classifyPlanCommand(command).kind, "safe", command);
});
