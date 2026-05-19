# Validation Architecture

Validation architecture is now documented as a focused domain under [`validation/`](validation/README.md).

Use this file as the compatibility route for existing links. The split keeps architecture rationale discoverable while making cache, rules, dependencies, and verification details loadable independently.

## Domain Files

- [`validation/README.md`](validation/README.md): overview and package boundary.
- [`validation/RULE_BOUNDARIES.md`](validation/RULE_BOUNDARIES.md): validator-owned rules and markdown budget policy.
- [`validation/CACHE_AND_INDEX.md`](validation/CACHE_AND_INDEX.md): cache, stale-index, lazy refresh, graph storage, and extraction.
- [`validation/VERIFICATION.md`](validation/VERIFICATION.md): dependency policy, TypeScript/unit tests, and workspace verification.
