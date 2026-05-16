# Code Conventions

Dotdot code conventions for keeping implementation simple and maintainable.

## Abstraction Boundaries

- Do not introduce unnecessary abstractions.
- Do not abstract code that is not reused.
- Do not abstract reused code when the reused behavior is likely to split into separate features or flows later.
- Prefer local, explicit code until a stable reuse pattern appears.

## Source File Size

- Keep source files small enough to read in one focused pass by humans and coding agents.
- If code grows beyond 150 lines, consider splitting or extracting focused units even when it is not reused.
- Review files approaching 250 lines for focused extraction by responsibility.
- Split by behavior or responsibility, not by arbitrary layers.

## Extraction and Testability

- Prefer extracting pure helpers when behavior can be tested without runtime dependencies.
- Keep runtime integration explicit and local until reuse is stable.
- Put testable logic in focused modules before adding broad framework abstractions.
- Preserve plain-text readability: avoid dense clever code, hidden control flow, and large mixed-responsibility files.

## Workspace Verification Scripts

- Every workspace package that defines quality-check scripts named `syntax`, `typecheck`, `test`, `lint`, `check`, or family variants such as `test:unit` must include those checks in that package's `verify` script.
- The root `pnpm run verify` delegates package-specific checks to package `verify` scripts after generated-resource drift and contract checks; do not rely on root `verify:types` or `verify:unit` for required coverage.
- Keep `pack:dry-run` scripts focused on package contents. Generated-resource drift belongs in root `verify:generated` and the safe standalone root `pack:dry-run` wrapper.
- When adding a package or a new check script, run `pnpm run verify:contract` to confirm the package `verify` contract before committing.
