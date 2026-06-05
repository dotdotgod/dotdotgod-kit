import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { createTrelloClient, formatTrelloDryRunReport, formatTrelloWriteReport, mergeLinkedDocsCustomFieldValue, parseLinkedDocsCustomFieldPayload, parseTrelloMetadata, planTrelloDryRun, readMemoryConfig, resolveGitHubFileUrl, resolveGitHubRepositoryIdentity, resolveTrelloCredentials, runTrelloSync, serializeLinkedDocsCustomFieldPayload, trelloSyncPaths, validateMemoryConfigData } from '../src/core.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-trello-'));
  write(root, '.gitignore', 'docs/plan\ndocs/archive\n.dotdotgod\n');
  write(root, 'package.json', JSON.stringify({ repository: { url: 'https://github.com/example/repo.git' } }, null, 2));
  return root;
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function card(url = 'https://trello.com/c/AbCdEf12/') {
  return `---\ntrelloUrl: "${url}"\n---\n\n# Card\n\nImplement linked docs preview content for the Trello Power-Up.\n`;
}

function trustedCiEnv() {
  return { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_DEFAULT_BRANCH: 'main', GITHUB_REPOSITORY: 'example/repo' };
}

describe('Trello metadata parser', () => {
  it('parses trelloUrl with and without a slug', () => {
    assert.deepEqual(parseTrelloMetadata(card('https://trello.com/c/AbCdEf12/task-title')).shortLink, 'AbCdEf12');
    assert.deepEqual(parseTrelloMetadata(card('https://trello.com/c/AbCdEf12/')).shortLink, 'AbCdEf12');
  });

  it('rejects missing and malformed trelloUrl metadata', () => {
    assert.equal(parseTrelloMetadata('# Missing\n').ok, false);
    assert(parseTrelloMetadata('---\ntrelloUrl: "https://example.com/c/AbCdEf12/"\n---\n').errors.some((error) => error.code === 'TRELLO_METADATA_INVALID_URL'));
    assert(parseTrelloMetadata('---\ntrelloUrl: "https://trello.com/c/AbCdEf12/slug/extra"\n---\n').errors.some((error) => error.code === 'TRELLO_METADATA_INVALID_URL'));
    assert(parseTrelloMetadata('---\ntrelloShortLink: "AbCdEf12"\n---\n').errors.some((error) => error.code === 'TRELLO_METADATA_MISSING_URL'));
  });

  it('warns about unsupported Trello keys but ignores unrelated frontmatter', () => {
    const parsed = parseTrelloMetadata('---\ntrelloUrl: "https://trello.com/c/AbCdEf12/"\ntrelloCardId: "123"\nowner: "me"\n---\n');
    assert.equal(parsed.ok, true);
    assert(parsed.warnings.some((warning) => warning.code === 'TRELLO_UNSUPPORTED_METADATA'));
  });
});

describe('GitHub URL resolver', () => {
  it('uses explicit repository and branch inputs', () => {
    const resolved = resolveGitHubFileUrl({ file: 'docs/trello/a b.md', repositoryUrl: 'git@github.com:owner/repo.git', branch: 'feature/test', git: false });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.url, 'https://github.com/owner/repo/blob/feature%2Ftest/docs/trello/a%20b.md');
  });

  it('warns when using injected remote fallback', () => {
    const resolved = resolveGitHubFileUrl({ file: 'docs/trello/task.md', remoteUrl: 'https://github.com/owner/repo.git', branch: 'main', git: false });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.url, 'https://github.com/owner/repo/blob/main/docs/trello/task.md');
    assert(resolved.warnings.some((warning) => warning.code === 'GITHUB_URL_REMOTE_FALLBACK'));
  });

  it('resolves trusted GitHub Actions repository identity for entry markers', () => {
    const resolved = resolveGitHubRepositoryIdentity({ mode: 'write', env: { GITHUB_REPOSITORY: 'owner/backend' }, git: false });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.repositoryKey, 'owner/backend');
    assert.equal(resolved.repositoryUrl, 'https://github.com/owner/backend');
    assert.equal(resolved.source, 'github-actions');
  });

  it('rejects malformed trusted GitHub Actions repository identity', () => {
    const resolved = resolveGitHubRepositoryIdentity({ mode: 'write', env: { GITHUB_REPOSITORY: 'owner/backend/extra' }, git: false });
    assert.equal(resolved.ok, false);
    assert(resolved.errors.some((error) => error.code === 'GITHUB_REPOSITORY_KEY_INVALID'));
  });

  it('warns when using package repository fallback', () => {
    const root = fixture();
    const resolved = resolveGitHubFileUrl({ root, file: 'docs/trello/task.md', branch: 'main', git: false });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.url, 'https://github.com/example/repo/blob/main/docs/trello/task.md');
    assert(resolved.warnings.some((warning) => warning.code === 'GITHUB_URL_PACKAGE_FALLBACK'));
  });

  it('fails instead of guessing when repository or branch is unresolved', () => {
    const root = mkdtempSync(join(tmpdir(), 'dotdotgod-trello-no-github-'));
    const unresolvedRepo = resolveGitHubFileUrl({ root, file: 'docs/trello/task.md', branch: 'main', git: false });
    assert.equal(unresolvedRepo.ok, false);
    assert(unresolvedRepo.errors.some((error) => error.code === 'GITHUB_URL_UNRESOLVED_REPOSITORY'));
    const unresolvedBranch = resolveGitHubFileUrl({ root, file: 'docs/trello/task.md', repositoryUrl: 'https://github.com/owner/repo.git', git: false });
    assert.equal(unresolvedBranch.ok, false);
    assert(unresolvedBranch.errors.some((error) => error.code === 'GITHUB_URL_UNRESOLVED_BRANCH'));
  });
});

describe('Trello integration config', () => {
  it('resolves default and extra Trello sync paths', () => {
    const root = fixture();
    write(root, 'dotdotgod.config.json', JSON.stringify({ integrations: { trello: { syncPaths: ['docs/issue/**'] } } }, null, 2));
    const config = readMemoryConfig(root);
    assert.deepEqual(config.integrations.trello.syncPaths, ['docs/issue/**']);
    assert.deepEqual(trelloSyncPaths(config), ['docs/trello/**', 'docs/issue/**']);
  });

  it('validates invalid Trello sync path config', () => {
    const errors = validateMemoryConfigData({ integrations: { trello: { syncPaths: ['docs/*/bad', '/tmp/**', '../outside/**', 'docs/secrets/**', '.env'] } } });
    const codes = new Set(errors.map((error) => error.code));
    assert(codes.has('INTEGRATIONS_TRELLO_INVALID_SYNC_PATHS'));
    assert(codes.has('INTEGRATIONS_TRELLO_SECRET_SYNC_PATH'));
    assert(validateMemoryConfigData({ integrations: [] }).some((error) => error.code === 'INTEGRATIONS_CONFIG_INVALID'));
    assert(validateMemoryConfigData({ integrations: { trello: [] } }).some((error) => error.code === 'INTEGRATIONS_TRELLO_CONFIG_INVALID'));
    assert(validateMemoryConfigData({ integrations: { trello: { syncPaths: 'docs/issue/**' } } }).some((error) => error.code === 'INTEGRATIONS_TRELLO_INVALID_SYNC_PATHS'));
  });
});

describe('Trello dry-run planner', () => {
  it('plans attachment and custom field data for default docs/trello path', () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    const { report, exitCode } = planTrelloDryRun(root, { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.equal(exitCode, 0);
    assert.equal(report.totals.matchedFiles, 1);
    assert.equal(report.files[0].plannedAttachmentAction, 'add-or-verify');
    assert.equal(report.files[0].plannedCustomFieldAction, 'sync-linked-docs');
    assert.equal(report.files[0].repositoryKey, 'example/repo');
    assert.equal(report.files[0].linkedDocsData.docsPath, 'docs/trello/task.md');
    assert.equal(report.files[0].linkedDocsData.title, 'Card');
    assert.equal(report.files[0].linkedDocsData.summary, 'Implement linked docs preview content for the Trello Power-Up.');
    assert.equal(report.files[0].traceability.state, 'not_required');
    const text = formatTrelloDryRunReport(report);
    assert.match(text, /File: docs\/trello\/task\.md/);
    assert.match(text, /Trello short link: AbCdEf12/);
    assert.match(text, /Planned attachment: add-or-verify/);
    assert.match(text, /Planned custom field: sync-linked-docs/);
  });

  it('includes configured extra sync paths and ignores other paths', () => {
    const root = fixture();
    write(root, 'dotdotgod.config.json', JSON.stringify({ integrations: { trello: { syncPaths: ['docs/issue/**'] } } }, null, 2));
    write(root, 'docs/issue/card.md', card());
    write(root, 'docs/notes/ignored.md', card());
    const { report } = planTrelloDryRun(root, { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.deepEqual(report.files.map((file) => file.file), ['docs/issue/card.md']);
    assert.deepEqual(report.scanPaths, ['docs/trello/**', 'docs/issue/**']);
  });

  it('reports invalid config and falls back to default sync paths', () => {
    const root = fixture();
    write(root, 'dotdotgod.config.json', JSON.stringify({ integrations: { trello: { syncPaths: ['/tmp/**'] } } }, null, 2));
    write(root, 'docs/trello/default.md', card());
    write(root, 'tmp/card.md', card());
    const { report, exitCode } = planTrelloDryRun(root, { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.equal(exitCode, 1);
    assert.deepEqual(report.scanPaths, ['docs/trello/**']);
    assert.deepEqual(report.files.map((file) => file.file), ['docs/trello/default.md']);
    assert(report.errors.some((error) => error.code === 'INTEGRATIONS_TRELLO_INVALID_SYNC_PATHS'));
    assert.match(formatTrelloDryRunReport(report), /Errors:\n  - INTEGRATIONS_TRELLO_INVALID_SYNC_PATHS:/);
  });

  it('returns warning and exit 0 when no docs match', () => {
    const root = fixture();
    const { report, exitCode } = planTrelloDryRun(root, { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.equal(exitCode, 0);
    assert.equal(report.totals.matchedFiles, 0);
    assert(report.warnings.some((warning) => warning.code === 'TRELLO_NO_MATCHING_DOCS'));
  });

  it('reports duplicate Trello cards during planning', () => {
    const root = fixture();
    write(root, 'docs/trello/a.md', card());
    write(root, 'docs/trello/b.md', card('https://trello.com/c/AbCdEf12/other'));
    const { report, exitCode } = planTrelloDryRun(root, { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.equal(exitCode, 1);
    assert.equal(report.totals.plannedUpdates, 0);
    assert(report.files.every((file) => file.syncStatus === 'conflict'));
  });

  it('reports present and missing traceability states', () => {
    const root = fixture();
    write(root, 'dotdotgod.config.json', JSON.stringify({ traceability: { required: ['docs/trello/required.md'], exclude: [] } }, null, 2));
    write(root, 'docs/trello/present.md', `${card()}\n\n\`\`\`json dotdotgod\n{"kind":"spec","implementedBy":[],"verifiedBy":[],"relatedDocs":[],"verificationCommands":[],"contracts":[{"id":"TRELLO-CONTRACT-001","title":"Trello contract metadata is accepted"}]}\n\`\`\`\n`);
    write(root, 'docs/trello/required.md', card());
    const { report, exitCode } = planTrelloDryRun(root, { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.equal(exitCode, 1);
    const byFile = new Map(report.files.map((file) => [file.file, file]));
    assert.equal(byFile.get('docs/trello/present.md').traceability.state, 'present');
    assert.equal(byFile.get('docs/trello/required.md').traceability.state, 'missing');
    assert(byFile.get('docs/trello/required.md').errors.some((error) => error.code === 'TRELLO_TRACEABILITY_MISSING'));
  });

  it('blocks invalid metadata and invalid traceability', () => {
    const root = fixture();
    write(root, 'docs/trello/bad.md', '---\ntrelloUrl: "https://trello.com/bad/AbCdEf12/"\n---\n\n```json dotdotgod\n{bad}\n```\n');
    const { report, exitCode } = planTrelloDryRun(root, { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.equal(exitCode, 1);
    assert.equal(report.files[0].syncStatus, 'blocked');
    assert(report.files[0].errors.some((error) => error.code === 'TRELLO_METADATA_INVALID_URL'));
    assert(report.files[0].errors.some((error) => error.code === 'TRELLO_TRACEABILITY_INVALID'));
  });

  it('routes successful CLI dry-run with injected GitHub metadata', () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card('https://trello.com/c/AbCdEf12/task-title'));
    const result = runTrelloSync(['sync', root, '--dry-run'], { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false } });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Trello docs sync dry-run/);
    assert.match(result.stdout, /File: docs\/trello\/task\.md/);
    assert.match(result.stdout, /GitHub URL: https:\/\/github.com\/example\/repo\/blob\/main\/docs\/trello\/task\.md/);
  });

  it('runs write mode when --dry-run is omitted', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card('https://trello.com/c/AbCdEf12/task-title'));
    const calls = [];
    const trelloClient = {
      async getCard(shortLink) { calls.push(['getCard', shortLink]); return { id: 'card1', idBoard: 'board1', desc: 'User text', customFieldItems: [] }; },
      async listAttachments(shortLink) { calls.push(['listAttachments', shortLink]); return []; },
      async createAttachment(shortLink, url) { calls.push(['createAttachment', shortLink, url]); return { id: 'att1' }; },
      async listCustomFields(idBoard) { calls.push(['listCustomFields', idBoard]); return []; },
      async createCustomField(idBoard, data) { calls.push(['createCustomField', idBoard, data]); return { id: 'field1', name: data.name, type: 'text' }; },
      async updateCardCustomFieldText(idCard, idCustomField, text) { calls.push(['updateCardCustomFieldText', idCard, idCustomField, text]); return { id: 'item1' }; },
      async updateCardDescription() { throw new Error('description should not be updated'); },
    };
    const result = await runTrelloSync(['sync', root], { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false }, env: trustedCiEnv(), credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } }, trelloClient });
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.files[0].attachment.status, 'written');
    assert.equal(result.report.files[0].customField.status, 'written');
    assert.equal(result.report.files[0].customField.action, 'create-payload');
    assert.equal(result.report.files[0].finalStatus, 'written');
    assert.deepEqual(calls.map((call) => call[0]), ['getCard', 'listAttachments', 'createAttachment', 'listCustomFields', 'createCustomField', 'updateCardCustomFieldText']);
    assert.match(result.stdout, /Trello docs sync write/);
    assert.match(calls[5][3], /"repositoryKey":"example\/repo"/);
    assert.doesNotMatch(calls[5][3], /dotdotgod:trello-sync:start/);
  });

  it('resolves repository and branch from trusted GitHub Actions env in write mode', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    let updated = '';
    const result = await runTrelloSync(['sync', root], {
      github: { git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: {
        async getCard() { return { id: 'card1', idBoard: 'board1', customFieldItems: [] }; },
        async listAttachments() { return []; },
        async createAttachment() {},
        async listCustomFields() { return [{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]; },
        async updateCardCustomFieldText(_idCard, _idCustomField, text) { updated = text; },
        async updateCardDescription() { throw new Error('description should not be updated'); },
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.files[0].repositoryKey, 'example/repo');
    assert.equal(result.report.files[0].githubUrl, 'https://github.com/example/repo/blob/main/docs/trello/task.md');
    assert.match(updated, /"repositoryKey":"example\/repo"/);
  });

  it('uses exact URL attachment matching and reports unchanged write results', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    const githubUrl = 'https://github.com/example/repo/blob/main/docs/trello/task.md';
    const existingPayload = serializeLinkedDocsCustomFieldPayload([{ repositoryKey: 'example/repo', repositoryLabel: 'repo', docsPath: 'docs/trello/task.md', githubUrl, trelloUrl: 'https://trello.com/c/AbCdEf12/', title: 'Card', summary: 'Implement linked docs preview content for the Trello Power-Up.', traceabilityState: 'not_required', traceabilityDetails: [] }]);
    let createCalls = 0;
    let customFieldUpdateCalls = 0;
    let descriptionUpdateCalls = 0;
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: {
        async getCard() { return { id: 'card1', idBoard: 'board1', customFieldItems: [{ idCustomField: 'field1', value: { text: existingPayload } }] }; },
        async listAttachments() { return [{ url: githubUrl }, { url: `${githubUrl}/` }]; },
        async createAttachment() { createCalls += 1; },
        async listCustomFields() { return [{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]; },
        async updateCardCustomFieldText() { customFieldUpdateCalls += 1; },
        async updateCardDescription() { descriptionUpdateCalls += 1; },
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(createCalls, 0);
    assert.equal(customFieldUpdateCalls, 0);
    assert.equal(descriptionUpdateCalls, 0);
    assert.equal(result.report.files[0].attachment.status, 'unchanged');
    assert.equal(result.report.files[0].customField.status, 'unchanged');
    assert.equal(result.report.files[0].finalStatus, 'unchanged');
  });

  it('appends current repository entry in custom field while preserving sibling entry', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    const githubUrl = 'https://github.com/example/repo/blob/main/docs/trello/task.md';
    const existingPayload = serializeLinkedDocsCustomFieldPayload([{ repositoryKey: 'example/frontend', repositoryLabel: 'frontend', docsPath: 'docs/trello/frontend.md', githubUrl: 'https://github.com/example/frontend/blob/main/docs/trello/frontend.md', trelloUrl: 'https://trello.com/c/AbCdEf12/', traceabilityState: 'not_required', traceabilityDetails: [] }]);
    let updated = '';
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: {
        async getCard() { return { id: 'card1', idBoard: 'board1', customFieldItems: [{ idCustomField: 'field1', value: { text: existingPayload } }] }; },
        async listAttachments() { return [{ url: githubUrl }]; },
        async listCustomFields() { return [{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]; },
        async updateCardCustomFieldText(_idCard, _idCustomField, text) { updated = text; },
        async updateCardDescription() { throw new Error('description should not be updated'); },
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.files[0].customField.action, 'append-entry');
    assert.equal(result.report.files[0].customField.preservedRepositoryEntries, 1);
    const parsed = parseLinkedDocsCustomFieldPayload(updated);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.entries.map((entry) => entry.repositoryKey), ['example/frontend', 'example/repo']);
  });

  it('treats similar but non-exact attachment URLs as missing', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    let createCalls = 0;
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: {
        async getCard() { return { id: 'card1', idBoard: 'board1', customFieldItems: [] }; },
        async listAttachments() { return [{ url: 'https://github.com/example/repo/blob/main/docs/trello/task.md/' }]; },
        async createAttachment() { createCalls += 1; },
        async listCustomFields() { return [{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]; },
        async updateCardCustomFieldText() {},
        async updateCardDescription() { throw new Error('description should not be updated'); },
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(createCalls, 1);
    assert.equal(result.report.files[0].attachment.status, 'written');
  });

  it('skips custom field update when attachment creation fails', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    let updateCalls = 0;
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: {
        async getCard() { return { id: 'card1', idBoard: 'board1', customFieldItems: [] }; },
        async listAttachments() { return []; },
        async createAttachment() { throw { code: 'TRELLO_API_FAILED', message: 'Attachment creation failed for Trello card AbCdEf12. Fix: check card access and retry.' }; },
        async listCustomFields() { return [{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]; },
        async updateCardCustomFieldText() { updateCalls += 1; },
        async updateCardDescription() { throw new Error('description should not be updated'); },
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(updateCalls, 0);
    assert.equal(result.report.files[0].attachment.status, 'failed');
    assert.equal(result.report.files[0].customField.status, 'not-run');
    assert.equal(result.report.files[0].finalStatus, 'api-failed');
  });

  it('conflicts duplicate markdown files that point to the same Trello card', async () => {
    const root = fixture();
    write(root, 'docs/trello/a.md', card());
    write(root, 'docs/trello/b.md', card('https://trello.com/c/AbCdEf12/other'));
    let calls = 0;
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: { async getCard() { calls += 1; } },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(calls, 0);
    assert(result.report.files.every((file) => file.finalStatus === 'conflict'));
    assert(result.report.files.every((file) => file.errors.some((error) => error.code === 'TRELLO_DUPLICATE_CARD')));
  });

  it('disables local operator write mode even when no docs match', async () => {
    let calls = 0;
    const result = await runTrelloSync(['sync', fixture()], { trelloClient: { async getCard() { calls += 1; } }, env: {} });
    assert.equal(result.exitCode, 2);
    assert.equal(calls, 0);
    assert.match(result.stderr, /trusted GitHub Actions default-branch push workflow/);
  });

  it('exits 0 without credentials or Trello client when trusted CI write mode finds no docs', async () => {
    let calls = 0;
    const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_DEFAULT_BRANCH: 'main' };
    const result = await runTrelloSync(['sync', fixture()], { trelloClient: { async getCard() { calls += 1; } }, env });
    assert.equal(result.exitCode, 0);
    assert.equal(calls, 0);
    assert.match(result.stdout, /No markdown files matched Trello sync paths/);
  });

  it('requires Actions secrets with actionable guidance in trusted CI write mode', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    const env = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_DEFAULT_BRANCH: 'main' };
    const result = await runTrelloSync(['sync', root], { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false }, env });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /TRELLO_API_KEY/);
    assert.match(result.stderr, /TRELLO_TOKEN/);
    assert.doesNotMatch(result.stderr, /trello-credentials\.json/);
  });

  it('disables local operator write mode', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    const result = await runTrelloSync(['sync', root], { github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false }, env: {} });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /trusted GitHub Actions default-branch push workflow/);
  });

  it('does not let injected credentials or clients bypass the local write guard', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    let calls = 0;
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: {},
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: { async getCard() { calls += 1; } },
    });
    assert.equal(result.exitCode, 2);
    assert.equal(calls, 0);
    assert.match(result.stderr, /trusted GitHub Actions default-branch push workflow/);
  });

  it('keeps dry-run offline even when a Trello client is provided', () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    const result = runTrelloSync(['sync', root, '--dry-run'], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      trelloClient: { async getCard() { throw new Error('should not run'); } },
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Trello docs sync dry-run/);
  });

  it('handles unknown options and missing roots as usage errors', () => {
    assert.equal(runTrelloSync(['sync', fixture(), '--bad']).exitCode, 2);
    assert.equal(runTrelloSync(['sync', join(fixture(), 'missing')]).exitCode, 2);
  });

  it('writes valid files while reporting blocked planning files', async () => {
    const root = fixture();
    write(root, 'docs/trello/good.md', card('https://trello.com/c/AbCdEf12/good'));
    write(root, 'docs/trello/bad.md', '---\ntrelloUrl: "https://example.com/bad"\n---\n');
    let writes = 0;
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: {
        async getCard() { return { id: 'card1', idBoard: 'board1', customFieldItems: [] }; },
        async listAttachments() { return []; },
        async createAttachment() {},
        async listCustomFields() { return [{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]; },
        async updateCardCustomFieldText() { writes += 1; },
        async updateCardDescription() { throw new Error('description should not be updated'); },
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(writes, 1);
    const byFile = new Map(result.report.files.map((file) => [file.file, file]));
    assert.equal(byFile.get('docs/trello/bad.md').finalStatus, 'blocked');
    assert.equal(byFile.get('docs/trello/good.md').finalStatus, 'written');
  });

  it('reports invalid custom field payload conflicts through write orchestration', async () => {
    const root = fixture();
    write(root, 'docs/trello/task.md', card());
    let updateCalls = 0;
    const result = await runTrelloSync(['sync', root], {
      github: { repositoryUrl: 'https://github.com/example/repo.git', branch: 'main', git: false },
      env: trustedCiEnv(),
      credentials: { ok: true, credentials: { apiKey: 'key', token: 'token' } },
      trelloClient: {
        async getCard() { return { id: 'card1', idBoard: 'board1', customFieldItems: [{ idCustomField: 'field1', value: { text: '{bad' } }] }; },
        async listAttachments() { return [{ url: 'https://github.com/example/repo/blob/main/docs/trello/task.md' }]; },
        async createAttachment() {},
        async listCustomFields() { return [{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]; },
        async updateCardCustomFieldText() { updateCalls += 1; },
        async updateCardDescription() { throw new Error('description should not be updated'); },
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(updateCalls, 0);
    assert.equal(result.report.files[0].customField.status, 'conflict');
    assert.equal(result.report.files[0].finalStatus, 'conflict');
  });
});

describe('Trello credentials and custom field helpers', () => {
  it('does not read local credentials when env credentials are absent', () => {
    const root = fixture();
    write(root, '.dotdotgod/trello-credentials.json', JSON.stringify({ apiKey: 'local-key', token: 'local-token' }));
    const resolved = resolveTrelloCredentials({ root, env: {} });
    assert.equal(resolved.ok, false);
    assert.match(resolved.error.message, /TRELLO_API_KEY/);
    assert.doesNotMatch(resolved.error.message, /trello-credentials\.json/);
  });

  it('rejects empty env credentials without falling back', () => {
    const root = fixture();
    write(root, '.dotdotgod/trello-credentials.json', JSON.stringify({ apiKey: 'local-key', token: 'local-token' }));
    const resolved = resolveTrelloCredentials({ root, env: { TRELLO_API_KEY: '', TRELLO_TOKEN: 'token' } });
    assert.equal(resolved.ok, false);
    assert.match(resolved.error.message, /missing or empty/);
  });

  it('merges linked-docs custom field entries by repository key', () => {
    const existing = serializeLinkedDocsCustomFieldPayload([{ repositoryKey: 'example/frontend', docsPath: 'docs/trello/frontend.md', githubUrl: 'https://github.com/example/frontend/blob/main/docs/trello/frontend.md' }]);
    const merged = mergeLinkedDocsCustomFieldValue(existing, { repositoryKey: 'example/backend', docsPath: 'docs/trello/backend.md', githubUrl: 'https://github.com/example/backend/blob/main/docs/trello/backend.md', traceabilityState: 'present', traceabilityDetails: ['implementedBy: 1'] });
    assert.equal(merged.ok, true);
    assert.equal(merged.action, 'append-entry');
    assert.equal(merged.preservedRepositoryEntries, 1);
    const parsed = parseLinkedDocsCustomFieldPayload(merged.text);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.entries.map((entry) => entry.repositoryKey), ['example/frontend', 'example/backend']);
  });

  it('reports conflicts for invalid custom field payloads', () => {
    assert.equal(parseLinkedDocsCustomFieldPayload('{bad').ok, false);
    assert.equal(parseLinkedDocsCustomFieldPayload('{"version":2,"entries":[]}').ok, false);
    const duplicate = serializeLinkedDocsCustomFieldPayload([{ repositoryKey: 'example/repo' }, { repositoryKey: 'example/repo' }]);
    assert.equal(parseLinkedDocsCustomFieldPayload(duplicate).ok, false);
  });

  it('formats write reports without secrets', () => {
    const text = formatTrelloWriteReport({ root: '/tmp/project', scanPaths: ['docs/trello/**'], totals: { matchedFiles: 1, written: 0, unchanged: 0, blocked: 0, conflict: 0, apiFailed: 1, warnings: 0, errors: 1 }, warnings: [], errors: [], files: [{ file: 'docs/trello/task.md', trelloUrl: 'https://trello.com/c/AbCdEf12/', shortLink: 'AbCdEf12', githubUrl: 'https://github.com/example/repo/blob/main/docs/trello/task.md', attachment: { status: 'not-run' }, customField: { status: 'failed', name: 'dotdotgod-view' }, finalStatus: 'api-failed', traceability: { state: 'not_required', details: [] }, warnings: [], errors: [{ code: 'TRELLO_API_FAILED', message: 'Custom field update failed. Fix: retry.' }] }] });
    assert.match(text, /Final status: api-failed/);
    assert.match(text, /Custom field name: dotdotgod-view/);
    assert.doesNotMatch(text, /token/);
  });

  it('builds Trello client requests through injected fetch', async () => {
    const calls = [];
    const client = createTrelloClient({
      credentials: { apiKey: 'key-123', token: 'token-456' },
      fetchImpl: async (url, init) => {
        calls.push([url.pathname, init.method, url.searchParams.get('key'), url.searchParams.get('token'), url.searchParams.get('url'), url.searchParams.get('desc'), init.body ?? '']);
        if (url.pathname.endsWith('/attachments') && init.method === 'GET') return new Response(JSON.stringify([{ url: 'https://example.com/doc' }]), { status: 200 });
        if (url.pathname.endsWith('/attachments') && init.method === 'POST') return new Response(JSON.stringify({ id: 'att1' }), { status: 200 });
        if (url.pathname.endsWith('/customFields') && init.method === 'GET') return new Response(JSON.stringify([{ id: 'field1', name: 'dotdotgod-view', type: 'text' }]), { status: 200 });
        if (url.pathname === '/1/customFields' && init.method === 'POST') return new Response(JSON.stringify({ id: 'field2', name: 'dotdotgod-view', type: 'text' }), { status: 200 });
        if (url.pathname.endsWith('/customField/field1/item') && init.method === 'PUT') return new Response(JSON.stringify({ id: 'item1' }), { status: 200 });
        if (init.method === 'PUT') return new Response(JSON.stringify({ id: 'card1' }), { status: 200 });
        return new Response(JSON.stringify({ id: 'card1', idBoard: 'board1', desc: 'desc', customFieldItems: [] }), { status: 200 });
      },
    });
    assert.equal((await client.getCard('AbCdEf12')).desc, 'desc');
    assert.equal((await client.listAttachments('AbCdEf12')).length, 1);
    await client.createAttachment('AbCdEf12', 'https://example.com/doc');
    assert.equal((await client.listCustomFields('board1')).length, 1);
    await client.createCustomField('board1', { name: 'dotdotgod-view' });
    await client.updateCardCustomFieldText('card1', 'field1', '{"version":1,"entries":[]}');
    assert.deepEqual(calls.map((call) => [call[0], call[1]]), [
      ['/1/cards/AbCdEf12', 'GET'],
      ['/1/cards/AbCdEf12/attachments', 'GET'],
      ['/1/cards/AbCdEf12/attachments', 'POST'],
      ['/1/boards/board1/customFields', 'GET'],
      ['/1/customFields', 'POST'],
      ['/1/cards/card1/customField/field1/item', 'PUT'],
    ]);
    assert(calls.every((call) => call[2] === 'key-123' && call[3] === 'token-456'));
  });

  it('normalizes rate limits and redacts secrets from client errors', async () => {
    const client = createTrelloClient({
      credentials: { apiKey: 'secret-key', token: 'secret-token' },
      fetchImpl: async () => new Response('API_TOKEN_LIMIT_EXCEEDED secret-key secret-token', { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '10' } }),
    });
    await assert.rejects(() => client.getCard('AbCdEf12'), (error) => {
      assert.equal(error.code, 'API_TOKEN_LIMIT_EXCEEDED');
      assert.equal(error.retryAfter, '10');
      assert.doesNotMatch(error.message, /secret-key|secret-token/);
      assert.match(error.message, /Wait and retry after 10 seconds/);
      return true;
    });
  });

  it('normalizes malformed responses and thrown network errors', async () => {
    const malformed = createTrelloClient({ credentials: { apiKey: 'key', token: 'token' }, fetchImpl: async () => new Response('{bad', { status: 200 }) });
    await assert.rejects(() => malformed.getCard('AbCdEf12'), (error) => {
      assert.match(error.message, /Malformed JSON response/);
      return true;
    });
    const network = createTrelloClient({ credentials: { apiKey: 'key', token: 'token' }, fetchImpl: async () => { throw new Error('offline token'); } });
    await assert.rejects(() => network.getCard('AbCdEf12'), (error) => {
      assert.doesNotMatch(error.message, / token/);
      assert.match(error.message, /offline/);
      return true;
    });
  });
});
