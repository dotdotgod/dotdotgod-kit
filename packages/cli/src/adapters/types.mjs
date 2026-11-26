export const ADAPTER_SCHEMA_VERSION = 1;
export const ADAPTER_HOSTS = Object.freeze(['claude-code', 'codex', 'antigravity', 'opencode', 'hermes', 'pi']);
export const ADAPTER_STATUSES = Object.freeze([
  'installed', 'not-installed', 'broken-runtime', 'version-drift', 'partial', 'modified', 'legacy-coexist',
]);

export const UNSAFE_PATH_CHARS = /[\x00-\x1f\x7f-\x9f]/u;

/**
 * @typedef {{cwd: string, homeDir: string, env: NodeJS.ProcessEnv, nodeExecPath: string,
 *   cliEntryPath: string, coreVersion: string, signal?: AbortSignal}} AdapterExecutionContext
 * @typedef {{mode: 'pinned', nodePath: string, cliEntry: string} | {mode: 'path', command: 'dotdotgod'}} RuntimeBinding
 * @typedef {{comment?: string, argv: string[]}} RecoveryCommand
 * @typedef {(typeof ADAPTER_HOSTS)[number]} HostId
 * @typedef {'user' | 'project'} AdapterScope
 * @typedef {(typeof ADAPTER_STATUSES)[number]} AdapterStatus
 * @typedef {{code: string, detail: string}} AdapterWarning
 * @typedef {{schemaVersion: 1, ok: true, command: 'status', coreVersion: string, nodeVersion: string,
 *   opencodeInspected: {scope: AdapterScope, root: string} | null,
 *   hosts: {host: HostId, scope: AdapterScope, status: AdapterStatus, recovery: RecoveryCommand[]}[],
 *   warnings: AdapterWarning[]}} AdapterStatusResult
 * @typedef {{schemaVersion: 1, ok: false, command: string, host?: string, error: {
 *   code: string, target?: string, detail: string, affectedPaths?: string[], recovery: RecoveryCommand[]
 * }}} AdapterErrorResult
 */
