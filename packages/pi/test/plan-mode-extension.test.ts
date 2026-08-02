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

	it("registers and reads only the namespaced startup flag", () => {
		assert.match(extensionSource, /registerFlag\("dd-plan"/);
		assert.match(extensionSource, /getFlag\("dd-plan"\)/);
		assert.doesNotMatch(extensionSource, /registerFlag\("plan"/);
		assert.doesNotMatch(extensionSource, /getFlag\("plan"\)/);
	});
});
