# Decision Config

## Purpose

`decision` controls optional project-memory load triage in initialized repositories: a regular `dotdotgod.config.json` file or `.dotdotgod/` directory marks initialization. Global configuration alone does not activate triage elsewhere. See [Load Project Memory](LOAD_PROJECT.md) and [Cross-Agent Support](CROSS_AGENT_SUPPORT.md) for delivery and host differences. This profile is separate from [embedding configuration](EMBEDDING_CONFIG.md).

## Resolution (A5)

The first configured profile wins: project `dotdotgod.config.json` > `~/.dotdotgod/config.json` > built-in defaults. A profile replaces the lower-priority profile in full; omitted fields use built-in defaults, not values from the other profile. An unreadable or invalid project config does not fall through to global. An invalid selected config fails open to local `advisory`, subject to host delivery (Antigravity uses its static rule).

`dotdotgod validate <root>` validates the project config, not the global decision profile. `dotdotgod config <root> [--json]` reports the effective profile and source (`project`, `global`, `default`, or `invalid`); an invalid selection is reported with a null profile and exit 1. A literal key is shown as `apiKey: "[redacted]"`; `apiKeyEnv` shows the variable name, never its value. Config reads reject symlinks, non-regular files, and files larger than 256 KiB. Malformed JSON diagnostics do not quote source text.

## Schema

`decision` must be an object containing only these fields:

| Field | Contract |
| --- | --- |
| `mode` | `advisory` (default) gives non-forcing, local guidance; `manual` gives no automatic load guidance; `always` requests baseline loading (Pi retains its one-time forced-load prompt); `model` enables triage. |
| `provider` | Required in `model` mode: `ollama`, `openai-compatible`, or `host`. `host` uses the Pi model registry; other adapters use `fallback`. |
| `model` | Non-empty string; required for Ollama and OpenAI-compatible in `model` mode. Optional for Pi `host`, which can use the active model. |
| `baseUrl` | Optional absolute HTTP(S) URL without userinfo, query, or fragment. Trailing slashes are removed. Defaults: `http://127.0.0.1:11434` for Ollama (`/api/chat`); `https://api.openai.com/v1` for OpenAI-compatible (`/chat/completions`). |
| `apiKey` | Optional non-empty literal bearer credential. Prefer `apiKeyEnv` for a trusted profile rather than storing the key in project config. |
| `apiKeyEnv` | Optional environment variable name (`[A-Za-z_][A-Za-z0-9_]*`); mutually exclusive with `apiKey`. If set but unavailable at request time, the request fails open. |
| `delivery` | `advice` (default) recommends a tool call; `prefetch` attaches bounded, read-only load context. Applies to model decisions to load. |
| `fallback` | `advisory` (default), `manual`, or `always`; used on decision failures and at the skip limit. Does not inherit or call another model profile. |
| `timeoutMs` | Integer from 200 to 15000; default 2000. Bounds the provider request; host hooks may impose a separate overall budget. |

`host` rejects `baseUrl`, `apiKey`, and `apiKeyEnv` and uses Pi's `modelRegistry.streamSimple(...).result()`.

```json
{
  "decision": {
    "mode": "model",
    "provider": "ollama",
    "model": "qwen3:4b",
    "delivery": "prefetch"
  }
}
```

## Remote Profile Threat Model (A2)

A project config can select a non-loopback model endpoint. An eligible first prompt can automatically send a prompt excerpt and shared repository path metadata to that endpoint without per-turn confirmation, along with a configured bearer credential. `apiKeyEnv` gives the endpoint the value from the adapter process environment, not just the variable name. Trust the repository **and** the configured endpoint before interacting in `model` mode. `dotdotgod config` prints a one-line warning for a project profile with a remote endpoint (also `decision.warning` in JSON), identifying the endpoint and any `apiKeyEnv` name. This inspection is not an approval gate. Use `advisory` or `manual` in untrusted projects and do not expose sensitive environment credentials to their adapter processes.

- Credentials are forbidden over non-loopback `http://`. URL validation blocks literal link-local/unspecified targets, including IP literals used for instance metadata (IMDS). The check is on the configured hostname, not a DNS or network sandbox; use egress controls where needed.
- HTTP uses `redirect: "error"`, no retries, a request deadline, and a 64 KiB streaming response cap. Provider bodies and raw errors are not printed in decision diagnostics.
- The model receives only a bounded excerpt and a shared Markdown path list (depth 2, up to 100 paths and 4 KiB). The decision map hard-excludes `plan`, `archive`, local-scope memory, hidden entries, and secret-like paths even if ordinary load exclusions are cleared. No repository file bodies are attached to the decision request.
- The excerpt takes at most 4,096 characters before replacing the home directory and redacting recognizable secrets, then limits the result to 2,000 characters. Filtering does not guarantee that secrets pasted directly into a prompt will be detected.

## Triage And Read-Only Prefetch

The model is not called for uninitialized repositories, already-loaded sessions, `manual`/`advisory`, an explicit load command, explicit `[[...]]` references, or request-local `/dd:no-load`, `dd:no-load`, or `/no-load`. Explicit workflow calls remain available. `always` does not call a decision model.

The model returns JSON `{ "load": { "action": "skip|focused|full", "focus": "..." }, "refs": [], "reason": "..." }`. One outer code fence is accepted. `focused` needs a non-empty, sanitized focus; the model is asked for English domain keywords. `refs` keeps at most three distinct exact paths from the shared decision map and drops nonmatches. These are non-authoritative routing hints, not replacements for user references or traceability. `reason` is not injected into the agent context.

A `skip` leaves the session unloaded. It records the last prompt hash to suppress a repeat and allows later prompts to be assessed; the fifth recorded skip claims fallback once. `advice` recommends focused or baseline loading without marking it complete. Successful `prefetch` marks the session loaded; failed prefetch leaves explicit loading available.

Prefetch uses the bounded shared map, a keyword-only `query --no-write --scope shared` when focused, and `expand --no-write --scope shared` for accepted refs. It reads existing outlines and a compatible graph index only; it does not build or refresh caches, download models, use embeddings, or modify source/docs/config. A cold repo can still return shared documentation keywords and empty expansion. Shared query excerpts are delivered locally in the prefetch block, never sent back to the decision model by prefetch. The retrieval is read-only; the adapter can still record session state separately. Injected prefetch is fenced as untrusted data (`instructionAuthority: "none"`), limited to 8,192 UTF-8 bytes including framing (6,144 for Antigravity). See [Reference Expansion](REFERENCE_EXPANSION.md).

## Fail-Open Diagnostics

Triage does not deny editing or execution or replace host approvals. The canonical `DECISION_ERROR_CODES` are `config_invalid`, `provider_unsupported_on_host`, `host_auth_unavailable`, `request_timeout`, `request_failed`, `response_invalid`, `prefetch_failed`, and `state_error`. Decision diagnostics use one line, `dotdotgod decision: <error_code>`, without raw prompt, URL, body, or credential; Pi instead records the code in a branch entry without writing raw stderr. The explicit Load workflow remains available when triage fails.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/decision/config.mjs](../../packages/cli/src/decision/config.mjs)
  - [packages/cli/src/commands/config.mjs](../../packages/cli/src/commands/config.mjs)
  - [packages/cli/src/memory/documentation-map.mjs](../../packages/cli/src/memory/documentation-map.mjs)
  - [packages/cli/src/commands/query.mjs](../../packages/cli/src/commands/query.mjs)
  - [packages/cli/src/reference/resolve.mjs](../../packages/cli/src/reference/resolve.mjs)
  - [packages/context/src/decision.mjs](../../packages/context/src/decision.mjs)
  - [packages/context/src/project.mjs](../../packages/context/src/project.mjs)
  - [packages/context/src/impact-state.mjs](../../packages/context/src/impact-state.mjs)
- Verified by:
  - [packages/cli/test/decision-config.test.mjs](../../packages/cli/test/decision-config.test.mjs)
  - [packages/cli/test/decision-readonly.test.mjs](../../packages/cli/test/decision-readonly.test.mjs)
  - [packages/context/test/decision.test.mjs](../../packages/context/test/decision.test.mjs)
  - [packages/context/test/impact-state.test.mjs](../../packages/context/test/impact-state.test.mjs)
  - [packages/pi/test/project-memory-extension.test.ts](../../packages/pi/test/project-memory-extension.test.ts)
- Related docs:
  - [docs/spec/LOAD_PROJECT.md](LOAD_PROJECT.md)
  - [docs/spec/CROSS_AGENT_SUPPORT.md](CROSS_AGENT_SUPPORT.md)
  - [docs/spec/REFERENCE_EXPANSION.md](REFERENCE_EXPANSION.md)
  - [docs/spec/EMBEDDING_CONFIG.md](EMBEDDING_CONFIG.md)
- Design decisions:
  - [docs/arch/NATURAL_LANGUAGE_BOUNDARIES.md](../arch/NATURAL_LANGUAGE_BOUNDARIES.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/decision/config.mjs","packages/cli/src/commands/config.mjs","packages/cli/src/memory/documentation-map.mjs","packages/cli/src/commands/query.mjs","packages/cli/src/reference/resolve.mjs","packages/context/src/decision.mjs","packages/context/src/project.mjs","packages/context/src/impact-state.mjs"],"verifiedBy":["packages/cli/test/decision-config.test.mjs","packages/cli/test/decision-readonly.test.mjs","packages/context/test/decision.test.mjs","packages/context/test/impact-state.test.mjs","packages/pi/test/project-memory-extension.test.ts"],"relatedDocs":["docs/spec/LOAD_PROJECT.md","docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/REFERENCE_EXPANSION.md","docs/spec/EMBEDDING_CONFIG.md"],"designDecisions":["docs/arch/NATURAL_LANGUAGE_BOUNDARIES.md"]}
```
