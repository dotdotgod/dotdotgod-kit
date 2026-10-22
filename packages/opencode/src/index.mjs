import { resolve } from 'node:path';
import { registerResources } from './resources.mjs';
import { registerMcp } from './mcp.mjs';
import { registerPlan } from './plan.mjs';
import { registerImpact } from './impact.mjs';

export default {
  id: 'dotdotgod',
  async setup(ctx) {
    // Use the active checkout, never the canonical checkout of another worktree.
    const root = resolve(ctx.location.project.directory ?? ctx.location.directory);
    await registerResources(ctx);
    await registerMcp(ctx, root);
    await registerPlan(ctx, root);
    await registerImpact(ctx, root);
  },
};
