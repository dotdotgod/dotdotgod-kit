# Native Plan Template

`NATIVE_PLAN.md` is the unmodified Plan Mode template from OpenAI Codex
`rust-v0.163.0`, published under Apache-2.0. `CODEX_LICENSE` retains its license.

Source: https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/collaboration-mode-templates/templates/plan.md

`src/native-plan.mjs` replaces two mutation-rule sentences and appends the
project-plan exception at setup time. Mode switching, questions and native
`proposed_plan` finalization are retained. Other versions require renewed host
verification rather than silently applying this template.
