import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { rel } from '../common/paths.mjs';
import { matchPathPattern, readMemoryConfig, trelloSyncPaths } from '../memory/config.mjs';
import { parseTrelloMetadata } from './metadata.mjs';
import { resolveGitHubFileUrl } from './github-url.mjs';
import { buildLinkedDocsData, summarizeTraceability } from './summary.mjs';
import { formatTrelloDryRunReport, formatTrelloWriteReport } from './report.mjs';
import { createTrelloClient, resolveTrelloCredentials } from './client.mjs';
import { customFieldTextValue, dotdotgodCustomFieldName, mergeLinkedDocsCustomFieldValue } from './custom-fields.mjs';

function shouldSkipDir(path) {
  return path === '.git' || path === 'node_modules' || path === '.dotdotgod';
}

function walkMarkdown(root, dir = root, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) walkMarkdown(root, join(dir, entry.name), files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) files.push(join(dir, entry.name));
  }
  return files;
}

function matchedByPatterns(path, patterns) {
  return patterns.some((pattern) => matchPathPattern(path, pattern));
}

function fileReport({ file, trelloUrl = '', shortLink = '', githubUrl = '', repositoryKey = '', syncStatus = 'blocked', traceability = { state: 'not_required', details: [] }, warnings = [], errors = [], linkedDocsData = null }) {
  return { file, trelloUrl, shortLink, githubUrl, repositoryKey, plannedAttachmentAction: errors.length > 0 ? 'blocked' : 'add-or-verify', plannedCustomFieldAction: errors.length > 0 ? 'blocked' : 'sync-linked-docs', syncStatus, traceability, linkedDocsData, warnings, errors };
}

function actionableError(error, fallback = 'Trello API request failed. Fix: check credentials, card access, and Trello response details, then retry.') {
  if (error && typeof error === 'object' && error.code && error.message) return error;
  return { code: 'TRELLO_API_FAILED', message: error?.message ? `${error.message} Fix: check credentials, card access, and Trello response details, then retry.` : fallback };
}

function duplicateErrors(files) {
  const byShortLink = new Map();
  for (const file of files.filter((item) => item.syncStatus === 'planned')) {
    byShortLink.set(file.shortLink, [...(byShortLink.get(file.shortLink) ?? []), file]);
  }
  const duplicateShortLinks = new Set([...byShortLink.entries()].filter(([, group]) => group.length > 1).map(([shortLink]) => shortLink));
  for (const shortLink of duplicateShortLinks) {
    const paths = byShortLink.get(shortLink).map((file) => file.file).join(', ');
    for (const file of byShortLink.get(shortLink)) {
      file.errors.push({ code: 'TRELLO_DUPLICATE_CARD', message: `Multiple markdown files point to Trello card ${shortLink}: ${paths}. Fix: keep only one markdown file linked to this Trello card, then retry sync.` });
      file.syncStatus = 'conflict';
      file.plannedAttachmentAction = 'conflict';
      file.plannedCustomFieldAction = 'conflict';
    }
  }
  return duplicateShortLinks.size;
}

export function planTrelloDryRun(rootInput = '.', options = {}) {
  const root = resolve(rootInput);
  const config = options.config ?? readMemoryConfig(root);
  const scanPaths = trelloSyncPaths(config);
  const reportWarnings = [];
  const reportErrors = [];
  if (config.errors?.length) reportErrors.push(...config.errors.map((error) => ({ code: error.code, message: error.message })));
  const allFiles = walkMarkdown(root).map((file) => ({ abs: file, rel: rel(root, file) })).filter((file) => matchedByPatterns(file.rel, scanPaths)).sort((a, b) => a.rel.localeCompare(b.rel));
  const files = [];
  if (allFiles.length === 0) reportWarnings.push({ code: 'TRELLO_NO_MATCHING_DOCS', message: 'No markdown files matched Trello sync paths.' });
  for (const item of allFiles) {
    const content = readFileSync(item.abs, 'utf8');
    const metadata = parseTrelloMetadata(content);
    const warnings = [...metadata.warnings];
    const errors = [...metadata.errors];
    let githubUrl = '';
    let repositoryKey = '';
    if (errors.length === 0) {
      const resolved = resolveGitHubFileUrl({ root, file: item.rel, env: options.env ?? process.env, mode: options.mode ?? 'dry-run', ...(options.github ?? {}) });
      warnings.push(...resolved.warnings);
      if (resolved.ok) {
        githubUrl = resolved.url;
        repositoryKey = resolved.repositoryKey;
      } else errors.push(...resolved.errors);
    }
    const traceability = summarizeTraceability({ content, root, file: item.rel, config });
    if (traceability.errors.length > 0) errors.push(...traceability.errors);
    const syncStatus = errors.length > 0 ? 'blocked' : 'planned';
    const linkedDocsData = buildLinkedDocsData({ file: item.rel, content, githubUrl, trelloUrl: metadata.trelloUrl, syncStatus, traceability, repositoryKey });
    files.push(fileReport({ file: item.rel, trelloUrl: metadata.trelloUrl, shortLink: metadata.shortLink, githubUrl, repositoryKey, syncStatus, traceability: { state: traceability.state, details: traceability.details }, warnings, errors, linkedDocsData }));
  }
  duplicateErrors(files);
  const warningCount = reportWarnings.length + files.reduce((sum, file) => sum + file.warnings.length, 0);
  const errorCount = reportErrors.length + files.reduce((sum, file) => sum + file.errors.length, 0);
  const report = { ok: errorCount === 0, command: 'trello sync', mode: 'dry-run', root, scanPaths, totals: { matchedFiles: files.length, plannedUpdates: files.filter((file) => file.syncStatus === 'planned').length, warnings: warningCount, errors: errorCount }, warnings: reportWarnings, errors: reportErrors, files };
  return { report, exitCode: errorCount > 0 ? 1 : 0 };
}

function trustedCiWriteContext(env = process.env) {
  const defaultBranch = env.GITHUB_DEFAULT_BRANCH || env.DOTDOTGOD_DEFAULT_BRANCH || env.GITHUB_EVENT_REPOSITORY_DEFAULT_BRANCH;
  return env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'push' && Boolean(defaultBranch) && env.GITHUB_REF === `refs/heads/${defaultBranch}`;
}

async function runTrelloWrite(rootInput = '.', options = {}) {
  const env = options.env ?? process.env;
  const { report: dryRunReport } = planTrelloDryRun(rootInput, { ...options, mode: 'write', env });
  const report = { ...dryRunReport, mode: 'write', customFieldName: dotdotgodCustomFieldName({ env, name: options.customFieldName }), files: dryRunReport.files.map((file) => ({ ...file, attachment: { status: 'not-run' }, customField: { status: 'not-run' }, finalStatus: file.syncStatus === 'blocked' ? 'blocked' : 'pending' })) };

  if (!trustedCiWriteContext(env)) {
    return { exitCode: 2, stderr: 'Trello write mode is only allowed from the trusted GitHub Actions default-branch push workflow. Fix: run dotdotgod trello sync <root> --dry-run locally or merge docs to the default branch so the workflow can write to Trello.', report };
  }

  if (report.files.length === 0) {
    report.totals = { matchedFiles: 0, written: 0, unchanged: 0, blocked: 0, conflict: 0, apiFailed: 0, warnings: report.totals.warnings, errors: report.totals.errors };
    report.ok = report.totals.errors === 0;
    return { report, exitCode: report.ok ? 0 : 1 };
  }

  const credentials = options.credentials ?? resolveTrelloCredentials({ env });
  if (!credentials.ok) return { exitCode: 2, stderr: credentials.error.message, report };

  const client = options.trelloClient ?? createTrelloClient({ credentials: credentials.credentials, fetchImpl: options.fetch, baseUrl: options.trelloBaseUrl });

  for (const file of report.files) {
    if (file.syncStatus === 'blocked') {
      file.finalStatus = 'blocked';
      continue;
    }
    if (file.syncStatus === 'conflict') {
      file.finalStatus = 'conflict';
      continue;
    }
    let step = 'card';
    try {
      const card = await client.getCard(file.shortLink);
      step = 'attachments';
      const attachments = await client.listAttachments(file.shortLink);
      if (attachments.some((attachment) => attachment?.url === file.githubUrl)) {
        file.attachment.status = 'unchanged';
      } else {
        step = 'attachment-create';
        await client.createAttachment(file.shortLink, file.githubUrl);
        file.attachment.status = 'written';
      }
      step = 'custom-field-definition';
      const fields = await client.listCustomFields(card.idBoard);
      let field = fields.find((item) => item?.name === report.customFieldName && item?.type === 'text');
      if (!field) field = await client.createCustomField(card.idBoard, { name: report.customFieldName, type: 'text' });
      if (!field?.id) throw { code: 'TRELLO_CUSTOM_FIELD_INVALID', message: 'Trello custom field creation returned no field id. Fix: check board custom field permissions and retry.' };
      const merged = mergeLinkedDocsCustomFieldValue(customFieldTextValue(card, field.id), file.linkedDocsData);
      if (!merged.ok) {
        file.customField.status = 'conflict';
        file.errors.push(merged.error);
        file.finalStatus = 'conflict';
        continue;
      }
      file.customField.action = merged.action;
      file.customField.preservedRepositoryEntries = merged.preservedRepositoryEntries ?? 0;
      file.customField.name = report.customFieldName;
      if (merged.status === 'unchanged') {
        file.customField.status = 'unchanged';
      } else {
        step = 'custom-field-update';
        await client.updateCardCustomFieldText(card.id, field.id, merged.text);
        file.customField.status = 'written';
      }
      file.finalStatus = file.attachment.status === 'written' || file.customField.status === 'written' ? 'written' : 'unchanged';
    } catch (error) {
      const normalized = actionableError(error);
      if (step === 'attachment-create') file.attachment.status = 'failed';
      else if (step.startsWith('custom-field')) file.customField.status = 'failed';
      file.finalStatus = 'api-failed';
      file.errors.push(normalized);
    }
  }

  const counts = { written: 0, unchanged: 0, blocked: 0, conflict: 0, apiFailed: 0 };
  for (const file of report.files) {
    if (file.finalStatus === 'written') counts.written += 1;
    else if (file.finalStatus === 'unchanged') counts.unchanged += 1;
    else if (file.finalStatus === 'blocked') counts.blocked += 1;
    else if (file.finalStatus === 'conflict') counts.conflict += 1;
    else if (file.finalStatus === 'api-failed') counts.apiFailed += 1;
  }
  const warningCount = report.warnings.length + report.files.reduce((sum, file) => sum + file.warnings.length, 0);
  const errorCount = report.errors.length + report.files.reduce((sum, file) => sum + file.errors.length, 0);
  report.totals = { matchedFiles: report.files.length, ...counts, warnings: warningCount, errors: errorCount };
  report.ok = counts.blocked === 0 && counts.conflict === 0 && counts.apiFailed === 0 && errorCount === 0;
  return { report, exitCode: report.ok ? 0 : 1 };
}

export function runTrelloSync(argv = [], options = {}) {
  if (argv[0] !== 'sync') return { exitCode: 2, stderr: `Unknown Trello command: ${argv[0] ?? ''}`.trim() };
  const args = argv.slice(1);
  let root = '.';
  let dryRun = false;
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('-')) return { exitCode: 2, stderr: `Unknown option: ${arg}` };
    else root = arg;
  }
  const resolvedRoot = resolve(root);
  if (!existsSync(resolvedRoot) || !statSync(resolvedRoot).isDirectory()) return { exitCode: 2, stderr: `Project root not found: ${resolvedRoot}` };
  if (dryRun) {
    const { report, exitCode } = planTrelloDryRun(resolvedRoot, options);
    return { exitCode, stdout: formatTrelloDryRunReport(report), report };
  }
  return runTrelloWrite(resolvedRoot, options).then((result) => ({ ...result, stdout: result.stdout ?? (result.report ? formatTrelloWriteReport(result.report) : '') }));
}
