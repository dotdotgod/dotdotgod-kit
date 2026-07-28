/** Compatibility exports for project memory loading helpers. */

export type { LoadCommandInfo, ProjectMemorySnapshot } from "./snapshot.ts";
export { DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE, MARKER_FILES, estimateTextMetrics, pathExists, listMarkdownFiles, listReadmeFiles, collectSnapshot, hasOtherLoadCommand } from "./snapshot.ts";
export type { LoadPromptMode, LoadPromptOptions, QueryResultItem, QueryRunResult } from "./prompt.ts";
export { buildLoadPrompt, documentationSummaryDirectories, extractDocsPathMentions, formatDocumentationTree } from "./prompt.ts";
export { runDotdotgodQuery } from "./query.ts";
