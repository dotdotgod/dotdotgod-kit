import { statSync } from "node:fs";
import { resolve } from "node:path";
import {
	clearPendingImpactForPath,
	formatMultiImpactSummary,
	getChangedPathFromDotdotgodImpactCommand,
	isBroadVerificationCommand,
	isCommitLikeCommand,
	mergeImpactCheckPaths,
	normalizeImpactPath,
	pendingImpactSummary,
	shouldTrackImpactPath,
	upsertPendingImpact,
	type PendingImpactItem,
} from "../impact.ts";

export interface ImpactCliResult {
	ok: boolean;
	data?: unknown;
	stdout?: string;
	error?: string;
}

export interface GateSnapshot {
	pendingImpactItems: PendingImpactItem[];
}

export class GateController {
	pendingImpactItems: PendingImpactItem[] = [];

	private fingerprintPath(cwd: string, path: string): string | undefined {
		try {
			const stat = statSync(resolve(cwd, path));
			return `${stat.size}:${Math.round(stat.mtimeMs)}`;
		} catch {
			return undefined;
		}
	}

	trackPendingImpact(
		cwd: string,
		path: string,
		reason: PendingImpactItem["reason"],
		now = new Date(),
	): boolean {
		const normalized = normalizeImpactPath(cwd, path);
		if (!normalized || !shouldTrackImpactPath(normalized)) return false;
		const fingerprint = this.fingerprintPath(cwd, normalized);
		this.pendingImpactItems = upsertPendingImpact(this.pendingImpactItems, {
			path: normalized,
			...(fingerprint ? { fingerprint } : {}),
			reason,
			touchedAt: now.toISOString(),
		});
		return true;
	}

	clearPendingImpact(
		cwd: string,
		path: string,
		checkedFingerprint?: string,
	): boolean {
		const normalized = normalizeImpactPath(cwd, path);
		if (!normalized) return false;
		const fingerprint = this.fingerprintPath(cwd, normalized);
		if (!checkedFingerprint || !fingerprint || checkedFingerprint === fingerprint) {
			this.pendingImpactItems = clearPendingImpactForPath(this.pendingImpactItems, normalized);
			return true;
		}
		return false;
	}

	mergeImpactCheckPaths(cwd: string, gitChangedPaths: readonly string[]): string[] {
		return mergeImpactCheckPaths(cwd, this.pendingImpactItems, gitChangedPaths);
	}

	runImpactChecks(
		cwd: string,
		paths: readonly string[],
		runImpact: (path: string) => ImpactCliResult,
	): { summary: string; checked: string[]; failed: string[] } {
		const normalizedPaths = [
			...new Set(
				paths
					.map((path) => normalizeImpactPath(cwd, path))
					.filter((path): path is string => Boolean(path))
					.filter(shouldTrackImpactPath),
			),
		];
		const results: Array<{ path: string; data?: unknown; error?: string; summary?: string }> = [];
		const checked: string[] = [];
		const failed: string[] = [];
		const checkedFingerprints = new Map<string, string | undefined>();
		for (const path of normalizedPaths) {
			checkedFingerprints.set(path, this.fingerprintPath(cwd, path));
			const result = runImpact(path);
			if (result.ok) {
				results.push({
					path,
					data: result.data,
					...(result.stdout ? { summary: result.stdout } : {}),
				});
				checked.push(path);
			} else {
				results.push({ path, error: result.error ?? "unknown error" });
				failed.push(path);
			}
		}
		const summary = formatMultiImpactSummary(results);
		for (const path of checked) {
			this.clearPendingImpact(cwd, path, checkedFingerprints.get(path));
		}
		return { summary, checked, failed };
	}

	buildPendingImpactReminder(): string | undefined {
		if (this.pendingImpactItems.length === 0) return undefined;
		return `[DOTDOTGOD IMPACT CHECK PENDING]\nYou changed these files but have not run dotdotgod graph impact:\n${pendingImpactSummary(this.pendingImpactItems)}\nBefore broad tests, more edits, commit, push, or publish, run dotdotgod_graph_impact or /impact-check and review related docs/tests/files.`;
	}

	buildCommitBlockReason(command: string): string | undefined {
		if (this.pendingImpactItems.length === 0 || !isCommitLikeCommand(command)) return undefined;
		return `Blocked: impact not checked for changed files.\nRun /impact-check or dotdotgod_graph_impact first.\nPending:\n${pendingImpactSummary(this.pendingImpactItems)}`;
	}

	buildBroadVerificationPrompt(command: string): string | undefined {
		if (this.pendingImpactItems.length === 0 || !isBroadVerificationCommand(command)) return undefined;
		return `Pending dotdotgod graph impact checks:\n${pendingImpactSummary(this.pendingImpactItems)}\n\nContinue with this verification command anyway?`;
	}

	clearFromImpactCommandResult(cwd: string, command: string, output: string): boolean {
		const changed = getChangedPathFromDotdotgodImpactCommand(command);
		if (!changed || output.includes('"ok": false')) return false;
		return this.clearPendingImpact(cwd, changed);
	}

	snapshot(): GateSnapshot {
		return { pendingImpactItems: [...this.pendingImpactItems] };
	}

	restore(snapshot: GateSnapshot | undefined): void {
		if (!snapshot) return;
		this.pendingImpactItems = [...snapshot.pendingImpactItems];
	}
}
