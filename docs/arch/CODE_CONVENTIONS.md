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
