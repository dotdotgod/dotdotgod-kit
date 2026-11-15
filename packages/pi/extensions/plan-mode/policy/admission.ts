import type { PolicyRuntime, CommandApprovalBatch } from "./runtime.ts";
import { environmentFingerprint } from "./invocation.ts";

// Both execution routes call this only at their actual execution boundary.
export function stageAdmission(runtime: PolicyRuntime, batch: CommandApprovalBatch, command: string, cwd: string, session: string, active: () => boolean, current: () => {cwd: string; session: string; trusted: boolean}) {
 const generation = runtime.generation;
 const host = current();
 const env = {...process.env};
 const fingerprint = environmentFingerprint(env);
 return async (actualCommand: string, actualCwd: string, actualSession: string, signal?: AbortSignal) => {
  batch.checks.push(() => active() && !signal?.aborted && generation === runtime.generation &&
   actualCommand === command && actualCwd === cwd && actualSession === session && current().cwd === host.cwd && current().session === host.session && current().trusted === host.trusted && fingerprint === environmentFingerprint(process.env));
  const decision = await runtime.finalize(batch);
  if (!decision.allow) throw new Error(decision.reason);
  return env;
 };
}
