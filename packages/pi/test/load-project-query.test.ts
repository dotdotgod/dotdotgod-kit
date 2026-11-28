import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { queryFailureDetail, runDotdotgodQuery } from "../extensions/load-project/query.ts";

const failure = { stdout: "", stderr: "", status: 1 };

it("surfaces supported stdout error JSON rather than exit status", () => {
	assert.equal(queryFailureDetail({ ...failure, stdout: JSON.stringify({ ok: false, error: "dotdotgod query failed: fetch failed" }), stderr: "other detail" }), "dotdotgod query failed: fetch failed");
});

it("falls back for empty, malformed and unsupported JSON without dumping stdout", () => {
	for (const stdout of ["", "not JSON", "null", JSON.stringify({ ok: true, error: "hidden" }), JSON.stringify({ ok: false, error: { stack: "hidden" } })]) {
		assert.equal(queryFailureDetail({ ...failure, stdout, stderr: "stderr reason" }), "stderr reason");
		assert.equal(queryFailureDetail({ ...failure, stdout }), "exit 1");
	}
});

it("preserves process errors and bounds every diagnostic", () => {
	assert.equal(queryFailureDetail({ ...failure, error: { message: "spawn failed" }, stdout: JSON.stringify({ ok: false, error: "other" }) }), "spawn failed");
	for (const result of [
		{ ...failure, stdout: JSON.stringify({ ok: false, error: "x".repeat(2000) }) },
		{ ...failure, stderr: "x".repeat(2000) },
		{ ...failure, error: { message: "x".repeat(2000) } },
	]) assert.equal(queryFailureDetail(result), `${"x".repeat(1000)}…`);
	assert.equal(queryFailureDetail({ ...failure, stdout: "x".repeat(65537) }), "exit 1");
});

it("runs a prepared-only source-checkout query with literal flag-like focus", () => {
	const root = mkdtempSync(join(tmpdir(), "dotdotgod-query-test-"));
	try {
		mkdirSync(join(root, "packages/cli/bin"), { recursive: true });
		writeFileSync(join(root, "packages/cli/bin/dotdotgod.mjs"), 'console.log(JSON.stringify({ok:true,results:[{path:"docs/README.md",text:JSON.stringify(process.argv.slice(2))}]}));');
		const result = runDotdotgodQuery(root, "--help");
		assert.equal(result.ok, true);
		assert.equal(result.command, "local workspace CLI");
		assert.equal(result.data?.results?.[0]?.path, "docs/README.md");
		assert.equal(result.data?.results?.[0]?.text, JSON.stringify(["query", root, "--limit", "30", "--prepared-only", "--json", "--", "--help"]));
	} finally { rmSync(root, { recursive: true, force: true }); }
});
