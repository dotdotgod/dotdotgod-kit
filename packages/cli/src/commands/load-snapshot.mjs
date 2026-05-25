import { parseCommon } from '../cli/usage.mjs';
import { buildCommunities } from '../graph/communities.mjs';
import { memoryConfigSummary, readMemoryConfig } from '../memory/config.mjs';
import { buildMemoryAreas, detectCommandGuidance } from '../load-snapshot/summary.mjs';
import { graphSummary, readFreshIndex } from '../index/cache.mjs';

export function runLoadSnapshot(argv) {
  const options = parseCommon(argv);
  const { status, index, metadata } = readFreshIndex(options.root);
  const summary = graphSummary(index);
  const communities = buildCommunities(index, { communities: 5, items: 5 });
  const memoryAreas = buildMemoryAreas(index, { items: 4 });
  const memoryConfig = index.memoryConfig ?? memoryConfigSummary(readMemoryConfig(options.root));
  const memoryPolicy = {
    source: memoryConfig.source ?? 'default',
    sharedAreas: (memoryConfig.areas ?? []).filter((area) => area.scope === 'shared').map((area) => area.id),
    localAreas: (memoryConfig.areas ?? []).filter((area) => area.scope === 'local').map((area) => area.id),
    freshAreas: (memoryConfig.areas ?? []).filter((area) => area.freshness === 'fresh').map((area) => area.id),
    staleAreas: (memoryConfig.areas ?? []).filter((area) => area.freshness === 'stale').map((area) => area.id),
  };
  const bounds = { communities: 5, communityItems: 5, memoryAreaItems: 4, fullGraphIncluded: false, archiveBodiesIncluded: status.archiveBodiesIncluded, archiveMapIncluded: true };
  const quality = {
    indexedFiles: status.indexedFiles,
    currentFiles: status.currentFiles,
    shownCommunities: communities.communities.length,
    totalCommunities: communities.total,
    omittedCommunities: communities.omitted,
    omittedCommunityItems: communities.communities.reduce((sum, community) => sum + (community.omitted ?? 0), 0),
    memoryAreas: memoryAreas.total,
    omittedMemoryAreaItems: memoryAreas.areas.reduce((sum, area) => sum + (area.omitted ?? 0), 0),
    graphNodes: summary.nodes,
    graphEdges: summary.edges,
  };
  const commandGuidance = detectCommandGuidance(options.root);
  let payload = { root: options.root, cache: status, metadata, graph: summary, memoryConfig, memoryPolicy, memoryAreas, communities, bounds, quality, commandGuidance };
  const serialized = JSON.stringify(payload);
  payload = { ...payload, quality: { ...quality, snapshotBytes: Buffer.byteLength(serialized), approxSnapshotTokens: Math.ceil(serialized.length / 4) } };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`dotdotgod load snapshot\n- cache: ${status.status}${metadata.cacheRefreshed ? ' (refreshed)' : ''}\n- indexed files: ${status.indexedFiles}\n- current files: ${status.currentFiles}\n- archive bodies included: ${status.archiveBodiesIncluded ? 'yes' : 'no'}\n- graph: ${summary.nodes} nodes, ${summary.edges} edges\n- memory areas: ${memoryAreas.areas.length}/${memoryAreas.total} shown\n- communities: ${communities.communities.length}/${communities.total} shown, ${communities.omitted} omitted`);
}
