import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const extensionSource = readFileSync(
	new URL("../extensions/plan-mode/index.ts", import.meta.url),
	"utf8",
);

describe("plan-mode command registration", () => {
	it("registers only the namespaced plan command", () => {
		assert.match(extensionSource, /registerCommand\("dd:plan"/);
		assert.doesNotMatch(extensionSource, /registerCommand\("plan"/);
		assert.doesNotMatch(extensionSource, /registerCommand\("todos"/);
	});
});
