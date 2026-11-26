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

export async function registerImpact(ctx, root, runtime) {
  const { ImpactState, impactReminder } = runtime;
  await ctx.tool.hook('execute.after', async event => {
    try {
      if (event.status !== 'completed') return;
      const paths = editedPaths(event.tool, event.input);
      if (paths.length && await isInitializedLocalSession(ctx, root, event.sessionID, runtime)) new ImpactState(root, event.sessionID).mark(paths);
    } catch {
      // Advisory bookkeeping must not fail the host edit.
    }
  });
  await ctx.session.hook('context', async event => {
    try {
      if (!await isInitializedLocalSession(ctx, root, event.sessionID, runtime)) return;
      const reminder = impactReminder(new ImpactState(root, event.sessionID).status());
      if (reminder) event.system.push({ type: 'text', text: reminder });
    } catch {
      // Advisory state may be unavailable during a host turn.
    }
  });
}
