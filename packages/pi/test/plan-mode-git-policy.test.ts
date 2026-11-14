import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { guardGit } from "../extensions/plan-mode/policy/execution.ts";
import { quoteArguments, resolveInvocation } from "../extensions/plan-mode/policy/invocation.ts";

test("Git guard inserts execution protections before path separators", () => {
	const root = mkdtempSync(join(tmpdir(), "plan-git-args-"));
	try {
		for (const subcommand of ["diff", "show", "log"]) {
			const original = resolveInvocation({ executable: "git", args: [subcommand, "--", "file.txt"] }, root);
			const guarded = guardGit(original);
			assert.deepEqual(guarded.args, ["--no-pager", "-c", "core.fsmonitor=false", "-c", "core.pager=cat", subcommand, "--no-ext-diff", "--no-textconv", "--", "file.txt"]);
			assert.equal(guarded.command, quoteArguments([guarded.executable, ...guarded.args]));
			assert.deepEqual(original.args, [subcommand, "--", "file.txt"]);
		}
		const rg = { ...resolveInvocation({ executable: process.execPath }, root), executable: "/test/bin/rg", args: ["needle", "--", "file.txt"] };
		const guardedRg = guardGit(rg);
		assert.deepEqual(guardedRg.args, ["--no-config", "needle", "--", "file.txt"]);
		assert.equal(guardedRg.command, quoteArguments([guardedRg.executable, ...guardedRg.args]));
		const node = resolveInvocation({ executable: process.execPath, args: ["--version"] }, root);
		assert.equal(guardGit(node), node);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("guarded ripgrep ignores inherited executable preprocessing config", (context) => {
	if (spawnSync("rg", ["--version"]).error) {
		context.skip("ripgrep is not installed on PATH");
		return;
	}
	const root = mkdtempSync(join(tmpdir(), "plan-rg-config-"));
	try {
		const marker = join(root, "preprocessor.ran");
		const script = join(root, "preprocessor.sh");
		const config = join(root, "ripgrep.conf");
		writeFileSync(script, `#!/bin/sh\nprintf ran > ${quoteArguments([marker])}\ncat "$1"\n`);
		chmodSync(script, 0o755);
		writeFileSync(config, `--pre=${script}\n`);
		writeFileSync(join(root, "file.txt"), "needle\n");
		const env = { PATH: process.env.PATH, RIPGREP_CONFIG_PATH: config };
		const original = resolveInvocation({ executable: "rg", args: ["needle", "--", "file.txt"] }, root, "native", env);
		const guarded = guardGit(original);
		const result = spawnSync(guarded.executable, guarded.args, { cwd: root, env, encoding: "utf8", timeout: 10000 });
		assert.equal(result.error, undefined);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "needle\n");
		assert.equal(existsSync(marker), false);
		// Verify the fixture actually executes when the guard is absent.
		const unguarded = spawnSync(original.executable, original.args, { cwd: root, env, encoding: "utf8", timeout: 10000 });
		assert.equal(unguarded.error, undefined);
		assert.equal(unguarded.status, 0, unguarded.stderr);
		assert.equal(existsSync(marker), true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("guarded Git preserves diff output without running configured external programs", () => {
	const root = mkdtempSync(join(tmpdir(), "plan-git-hooks-"));
	const home = join(root, "empty-home");
	const env: NodeJS.ProcessEnv = {
		PATH: process.env.PATH,
		HOME: home,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		LC_ALL: "C",
	};
	const git = (args: string[], guarded = false) => {
		const invocation = resolveInvocation({ executable: "git", args }, root, "native", env);
		const executed = guarded ? guardGit(invocation) : invocation;
		const result = spawnSync(executed.executable, executed.args, { cwd: root, env, encoding: "utf8", timeout: 10000 });
		assert.equal(result.error, undefined);
		assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
		return result.stdout;
	};
	try {
		git(["init", "--quiet"]);
		writeFileSync(join(root, "file.txt"), "before\n");
		git(["add", "file.txt"]);
		git(["-c", "user.name=Plan Test", "-c", "user.email=plan@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture"]);
		writeFileSync(join(root, "file.txt"), "after\n");
		const markers: string[] = [];
		const script = (name: string) => {
			const path = join(root, `${name}.sh`);
			const marker = join(root, `${name}.ran`);
			markers.push(marker);
			writeFileSync(path, `#!/bin/sh\nprintf ran > ${quoteArguments([marker])}\nexit 1\n`);
			chmodSync(path, 0o755);
			return path;
		};
		const diff = script("external-diff");
		const textconv = script("textconv");
		const fsmonitor = script("fsmonitor");
		const pager = script("pager");
		git(["config", "diff.external", diff]);
		git(["config", "diff.test.command", diff]);
		git(["config", "diff.test.textconv", textconv]);
		git(["config", "core.fsmonitor", fsmonitor]);
		git(["config", "core.pager", pager]);
		writeFileSync(join(root, ".gitattributes"), "file.txt diff=test\n");
		env.GIT_EXTERNAL_DIFF = diff;
		env.GIT_PAGER = pager;
		env.PAGER = pager;
		const output = git(["diff", "--", "file.txt"], true);
		assert.match(output, /-before\n\+after/);
		assert.match(git(["status", "--short"], true), /file\.txt/);
		assert.match(git(["show", "HEAD", "--", "file.txt"], true), /before/);
		assert.match(git(["log", "-1", "--", "file.txt"], true), /fixture/);
		for (const marker of markers) assert.equal(existsSync(marker), false, marker);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
