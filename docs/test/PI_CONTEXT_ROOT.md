# Pi Context Root Isolation

`packages/pi/test/context-root-isolation.test.ts` launches a real Pi workflow in
a subprocess with a foreign inherited `DOTDOTGOD_PROJECT_ROOT`. It verifies the
MCP store stays in the Pi session project, observed edits appear in impact
status, and successful review clears the host's pending state after context
resume.

`context-execution-gates.test.ts` retains pending-status, covered-path clearing,
spoofed nested identity, and planning-permission checks. The adapter explicitly
sets connection cwd and environment root at session startup, rather than relying
on ambient parent process variables. Test both direct and context-executor runs.

```bash
pnpm --filter @dotdotgod/pi run verify
```
