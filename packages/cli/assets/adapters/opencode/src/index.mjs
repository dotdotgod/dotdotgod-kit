import { resolve } from 'node:path';
import { registerResources } from './resources.mjs';
import { registerMcp } from './mcp.mjs';
import { registerPlan } from './plan.mjs';
import { registerImpact } from './impact.mjs';
import { registerLoad } from './load.mjs';
import { loadRuntime } from './runtime.mjs';

export default {
  id: 'dotdotgod',
  async setup(ctx) {
    // Use the active checkout, never the canonical checkout of another worktree.
    const root = resolve(ctx.location.project?.directory ?? ctx.location.directory);
    await registerResources(ctx);
    await registerPlan(ctx, root);
    const { argv, advisory } = await loadRuntime();
    await registerMcp(ctx, root, argv, advisory);
    if (advisory) {
      await registerImpact(ctx, root, advisory);
      await registerLoad(ctx, root, advisory);
    }
  },
};
