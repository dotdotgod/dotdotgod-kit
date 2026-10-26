# Release 0.6.7

## Scope

Fix repeated passage embedding when documentation-only impact analysis follows
mixed document/code search. Document and code snapshots now preserve the other
corpus and prune stale chunks only in the refreshed corpus. Current selected
chunks alone become retrieval candidates.

Successful batches checkpoint for retry after interruption. A project build lock
serializes processes, with bounded waits and confirmed-dead-owner recovery.
Sanitized diagnostics expose cache validity reasons and per-corpus reuse,
embedding and recovery counts. Compatible legacy vectors migrate without new
passage embedding requests.

## Upgrade Notes And Limits

No configuration change or forced cache deletion is required. Model/profile or
schema incompatibility and corrupt caches can still require rebuilding. Query
vectors remain separate provider calls. Code implementation bodies are not
embedding passages.

Snapshots and checkpoints currently serialize vectors as JSON and rewrite the
state file per batch; large-corpus performance needs measurement. Atomic rename
is not fsync-backed power-loss durability. Malformed locks, PID reuse and an
abandoned recovery directory fail closed and may require manual inspection.
Do not remove a lock belonging to a running process.

## Verification

Offline focused tests, scope switching, batch recovery, corruption and
multiprocess serialization passed. Workspace verification and document/index
validation passed before version bump; repeat release gates after generation.
No live remote-provider or power-loss acceptance is claimed.

Publish seven public packages dependency-first: CLI, context, Pi, Claude Code,
Codex, Hermes, OpenCode. Root and shared remain private.
