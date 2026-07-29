import { runInit } from './init.mjs';
import { commandUsage, hasHelpToken, helpCommandFromArgs, isHelpToken, isVersionToken, printVersion, usage } from './cli/usage.mjs';
import { runValidate } from './validate/run.mjs';
import { runIndex, runStatus } from './index/cache.mjs';
import { runConfig } from './commands/config.mjs';
import { runQuery } from './commands/query.mjs';
import { runResolve, runExpand } from './reference/resolve.mjs';
import { runTraceability } from './commands/traceability.mjs';
import { runGraph } from './commands/graph.mjs';
import { runPlan } from './commands/plan.mjs';
import { runTrelloSync } from './trello/sync.mjs';

export { CACHE_VERSION } from './index/constants.mjs';
export { commandUsage, hasHelpToken, helpCommandFromArgs, isHelpToken, isVersionToken, parseCommon, printVersion, usage } from './cli/usage.mjs';
export { rel } from './common/paths.mjs';
export { extractAnchors, extractFirstHeading, extractLinks, headingToAnchor, isKebabCase, isNumberedSeriesFilename, isUpperSnakeMarkdown, removeCodeBlocks, suggestFilenameFromHeading } from './docs/markdown.mjs';
export { extractDotdotgodTraceabilityBlocks, findTraceabilityLinksRegion, isLocalRelativeTraceabilityPath, renderCompactTraceabilityBlock, stripTraceabilityLinksRegion, syncTraceabilityLinksInContent, traceabilityExample, validateTraceabilityBlock, validateTraceabilityLinksRegion, validateTraceabilityPlacement } from './docs/traceability.mjs';
export { DEFAULT_IMPACT_RANKING_POLICY, DEFAULT_INTEGRATIONS_POLICY, DEFAULT_LOAD_POLICY, DEFAULT_VALIDATION_POLICY, SEMANTIC_RELATIONS, cloneImpactRankingPolicy, cloneIntegrationsPolicy, cloneLoadPolicy, cloneReferenceExpansionPolicy, cloneValidationPolicy, defaultDotdotgodConfigData, defaultDotdotgodConfigText, defaultMemoryConfig, isMarkdownSizeExcluded, isSecretLikePathPattern, isValidPathPattern, matchPathPattern, memoryAreaForPath, memoryConfigSummary, normalizeLowSignalTerm, readMemoryConfig, requiresTraceability, resolveMemoryArea, trelloSyncPaths, validateMemoryConfigData } from './memory/config.mjs';
export { buildCommunities, relationWeight } from './graph/communities.mjs';
export { addEdge, addNode, compactGraph, expandGraph, graphStats, jsonSize, shardFile, writeJson } from './graph/store.mjs';
export { cacheFile, collectIndexFiles, fingerprint, shouldIndexPath } from './index/files.mjs';
export { buildMemoryAreas, buildPinnedFiles, detectCommandGuidance, detectPackageManager } from './memory/summary.mjs';
export { isReadmeIndexPath, retrievalMetadataForPath } from './graph/metadata.mjs';
export { buildGraph } from './graph/extract.mjs';
export { addDeterministicSemanticEdges } from './graph/semantic.mjs';
export { buildIndex, writeIndex, readIndex, getStatus, runIndex, runStatus, readFreshIndex, graphSummary } from './index/cache.mjs';
export { runValidate } from './validate/run.mjs';
export { buildImpactReport, buildCompactImpactReport } from './impact/report.mjs';
export { formatCompactImpactOutput, formatYmlGraphImpactError, formatYmlImpactOutput } from './impact/format.mjs';
export { runConfig } from './commands/config.mjs';
export { buildVectorIndex, parseQueryOptions, queryDocumentation, runQuery } from './commands/query.mjs';
export { chunkMarkdown, collectDocumentationChunks, collectDocumentationMarkdown, textFingerprint } from './query/chunks.mjs';
export { readVectorCache, VECTOR_DIMENSIONS, VECTOR_MODEL, VECTOR_SCHEMA_VERSION, vectorCachePaths, writeVectorCache } from './query/store.mjs';
export { extractBracketReferences, extractFuzzyReferences, normalizeReferenceAlias } from './reference/extract.mjs';
export { resolveReferenceCandidates, runResolve, runExpand } from './reference/resolve.mjs';
export { parseTraceabilityOptions, runTraceability } from './commands/traceability.mjs';
export { parseGraphOptions, runGraph } from './commands/graph.mjs';
export { buildPlanValidationRepairPrompt, createPlanStageCheckpoint, formatPlanValidationText, PLAN_REQUIRED_HEADERS, PLAN_STAGE_DIRECTORIES, resolvePlanValidationStage, runPlan, validatePlanArtifact } from './commands/plan.mjs';
export { planTrelloDryRun, runTrelloSync } from './trello/sync.mjs';
export { parseTrelloMetadata, extractTrelloShortLink } from './trello/metadata.mjs';
export { normalizeGitHubRemote, resolveGitHubFileUrl, resolveGitHubRepositoryIdentity } from './trello/github-url.mjs';
export { buildLinkedDocsData, summarizeTraceability } from './trello/summary.mjs';
export { formatTrelloDryRunReport, formatTrelloWriteReport } from './trello/report.mjs';
export { createTrelloClient, resolveTrelloCredentials } from './trello/client.mjs';
export { customFieldTextValue, DEFAULT_DOTDOTGOD_CUSTOM_FIELD_NAME, dotdotgodCustomFieldName, mergeLinkedDocsCustomFieldValue, parseLinkedDocsCustomFieldPayload, serializeLinkedDocsCustomFieldPayload } from './trello/custom-fields.mjs';

export async function runCli(argv = process.argv.slice(2)) {
  const [command = 'help', ...args] = argv;
  if (isVersionToken(command)) printVersion();
  if (command === 'help') usage('', helpCommandFromArgs(args));
  if (isHelpToken(command)) usage('');
  if (hasHelpToken(args)) usage('', helpCommandFromArgs([command, ...args]));
  if (command === 'validate') runValidate(args);
  else if (command === 'init') runInit(args, usage);
  else if (command === 'index') runIndex(args);
  else if (command === 'config') runConfig(args);
  else if (command === 'status') runStatus(args);
  else if (command === 'query') await runQuery(args);
  else if (command === 'resolve') runResolve(args);
  else if (command === 'expand') runExpand(args);
  else if (command === 'traceability') runTraceability(args);
  else if (command === 'graph') await runGraph(args);
  else if (command === 'plan') runPlan(args);
  else if (command === 'trello') {
    const result = await Promise.resolve(runTrelloSync(args));
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) {
      console.error(result.stderr);
      console.error(commandUsage('trello'));
    }
    process.exit(result.exitCode);
  } else usage(`Unknown command: ${command}`);
}
