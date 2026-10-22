import { realpathSync } from 'node:fs';

// Server-wide hooks can see sessions from other loaded locations.
export async function isLocalSession(ctx, sessionID) {
  const session = await ctx.session.get({ sessionID });
  return realpathSync(session.location.directory) === realpathSync(ctx.location.directory);
}
