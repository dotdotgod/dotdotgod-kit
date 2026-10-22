import { fileURLToPath } from 'node:url';

const prefix = 'dotdotgod_context_';
const readOnly = new Set(['project_load', 'project_impact', 'impact_status', 'embedding_status', 'index', 'search', 'fetch_and_index', 'stats', 'doctor', 'session_resume', 'ingestion_job_start', 'ingestion_job_status']);
const quote = value => /^[\w./:-]+$/.test(String(value)) ? String(value) : `'${String(value).replaceAll("'", "'\\''")}'`;

export async function registerMcp(ctx, root) {
  await ctx.mcp.transform(editor => {
    if (editor.get('dotdotgod_context')) return;
    editor.set('dotdotgod_context', {
      type: 'local', command: ['node', fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))],
      cwd: root, environment: { DOTDOTGOD_PROJECT_ROOT: root }, codemode: true,
    });
  });
  await ctx.tool.transform(editor => {
    for (const tool of editor.list()) {
      if (!tool.id.startsWith(prefix)) continue;
      editor.update(tool.id, draft => {
        const execute = draft.execute;
        const name = tool.id.slice(prefix.length);
        draft.execute = async (input, context) => {
          // Actual executor context, not model-selected session identity. This
          // wrapper also runs when the tool is called through Code Mode.
          if (context.agent === 'plan' && !readOnly.has(name)) throw new Error('Plan mode: this write-capable MCP operation requires switching agents.');
          if (name === 'execute') {
            for (const entry of input.commands ?? []) await ctx.permission.assert({
              sessionID: context.sessionID, agent: context.agent,
              source: { type: 'tool', messageID: context.messageID, id: context.id },
              action: 'shell', resources: [entry.executable ? [entry.executable, ...(entry.args ?? [])].map(quote).join(' ') : entry.command ?? ''],
            });
          }
          return execute({ ...input, contextSessionId: context.sessionID }, context);
        };
      });
    }
  });
}
