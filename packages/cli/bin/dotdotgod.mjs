#!/usr/bin/env node
const [command, ...args] = process.argv.slice(2);

if (command === 'hook') {
  let formatError;
  try {
    ({ formatHookError: formatError } = await import('../src/primitives.mjs'));
    const [host, rawEvent] = args;
    const event = rawEvent?.trim().toLowerCase();
    const valid = host === 'hermes' ? event === 'decision'
      : host === 'antigravity' ? ['posttooluse', 'preinvocation'].includes(event)
      : ['claude-code', 'codex'].includes(host) && ['sessionstart', 'userpromptsubmit', 'posttooluse', 'pretooluse'].includes(event);
    if (!valid || args.length !== 2) throw new Error('Unknown or missing hook host/event.');
    const { parseHookInput } = await import('../src/context/hook-state.mjs');
    const input = parseHookInput();
    let result;
    if (host === 'hermes') {
      const { runHermesDecision } = await import('../src/context/hermes-decision.mjs');
      result = await runHermesDecision(input);
    } else if (host === 'antigravity') {
      const { runAntigravityHook } = await import('../src/context/hooks-antigravity.mjs');
      result = await runAntigravityHook(event, input);
    } else {
      const { runHook } = await import('../src/context/hooks.mjs');
      result = await runHook(event, input);
    }
    process.stdout.write(`${JSON.stringify(result ?? {})}\n`);
  } catch (error) {
    process.stdout.write('{}\n');
    let diagnostic = 'dotdotgod hook error: runtime unavailable';
    try { if (formatError) diagnostic = formatError(error); }
    catch { /* Diagnostics must not turn a hook failure into a nonzero exit. */ }
    process.stderr.write(`${diagnostic}\n`);
  }
} else if (command === 'mcp') {
  const { startServer } = await import('../src/context/server.mjs');
  await startServer();
} else if (command === 'mcp-bridge') {
  const { runBridge } = await import('../src/context/mcp-bridge.mjs');
  await runBridge(args);
} else {
  const { runCli } = await import('../src/core.mjs');
  await runCli();
}
