import { ImpactState, impactReminder } from '../mcp/runtime.mjs';
import { isInitializedLocalSession } from './load.mjs';

export function editedPaths(tool, input) {
  if (!input || typeof input !== 'object') return [];
  if (['write', 'edit'].includes(tool)) return [input.path ?? input.filePath ?? input.file_path].filter(path => typeof path === 'string');
  if (tool === 'patch' || tool === 'apply_patch') {
    const patch = input.patch ?? input.patchText;
    return typeof patch === 'string' ? [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(match => match[1]) : [];
  }
  return [];
}

export async function registerImpact(ctx, root) {
  await ctx.tool.hook('execute.after', async event => {
    if (event.status !== 'completed') return;
    const paths = editedPaths(event.tool, event.input);
    if (paths.length && await isInitializedLocalSession(ctx, root, event.sessionID)) new ImpactState(root, event.sessionID).mark(paths);
  });
  await ctx.session.hook('context', async event => {
    if (!await isInitializedLocalSession(ctx, root, event.sessionID)) return;
    const reminder = impactReminder(new ImpactState(root, event.sessionID).status());
    if (reminder) event.system.push({ type: 'text', text: reminder });
  });
}
