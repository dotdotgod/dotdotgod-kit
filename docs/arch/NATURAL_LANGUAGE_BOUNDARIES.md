# Natural Language Boundaries

## Decision

Code must not decide plan quality, blocker state, actionability, or user intent by interpreting ordinary prose with keyword or regular-expression semantics. Natural-language judgment belongs to the LLM layer.

Rule-based code may parse explicit structure, enums, paths, command shapes, file names, headings, checkboxes, JSON fields, and other machine-readable markers. It must not infer meaning from words such as `pending`, `unresolved`, `because`, `required`, `recommended`, `implementation`, or similar prose unless those words are part of a documented structured field value.

## Rationale

Keyword-based semantic checks create brittle blockers. They can reject valid work because a harmless sentence contains a trigger word, or accept weak work because it contains expected vocabulary. The repository should keep deterministic code responsible for deterministic contracts and leave qualitative judgment to LLM prompts, reviews, and stage evaluators.

This keeps validation predictable:

- Code validates shape, presence, safety, and allowed values.
- LLMs evaluate whether prose is sufficient, clear, risky, or actionable.
- Specs and plans use explicit fields when runtime code needs a reliable state.

## Allowed Rule-Based Parsing

Code may enforce rules such as:

- required headings or sections exist
- required JSON fields exist and have valid types
- enum fields use allowed values such as `Status: completed`
- checkboxes are checked or unchecked
- paths stay inside allowed directories
- filenames follow naming conventions
- commands match safe allowlists or blocked mutation patterns
- generated markers and traceability blocks are present and well-formed

These checks are structural. They do not infer whether a sentence is persuasive, complete, or semantically resolved.

## Disallowed Semantic Keyword Gates

Avoid code patterns that classify prose by searching for ordinary-language meaning, including:

- treating any sentence with `pending`, `unknown`, `unresolved`, or `needs user` as a blocker
- treating `resolved`, `answered`, `deferred`, or `not needed` as proof that a decision is resolved
- requiring words such as `purpose`, `validation`, `dependency`, `because`, or `parallel` as evidence that a plan is actionable
- classifying broad user intent from free-form prose when a command, UI choice, or structured runtime state can be used instead

If code needs to block on a state, introduce a structured marker instead of a prose heuristic.

## Preferred Structured Markers

Use explicit fields for machine decisions. Examples:

```md
Status: completed
```

```md
DecisionState: unresolved
DecisionOwner: user
```

```md
- [ ] Q1 user-decision: Choose deployment target.
  - Status: unresolved
```

```json
{"status":"blocked","blockerType":"user-decision"}
```

The code may validate the field names and allowed enum values. The LLM remains responsible for deciding what state to write based on prose context and user intent.

## Migration Guidance

When editing existing validators or runtime gates:

1. Keep structural parsing and safety checks.
2. Remove prose keyword heuristics that create blockers or state transitions.
3. Replace them with documented fields, checkboxes, or enum values.
4. Update prompts so the LLM writes the required structured state.
5. Add tests that prove harmless prose trigger words do not block execution.

This decision applies especially to Plan Generator checkpoints, Plan Mode request handling, plan validation, and any future documentation quality gates.
