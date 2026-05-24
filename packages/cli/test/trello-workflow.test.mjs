import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const workflow = readFileSync(new URL('../../../.github/workflows/trello-docs-sync.yml', import.meta.url), 'utf8');

describe('Trello docs sync workflow', () => {
  it('uses safe triggers without workflow_dispatch inputs or pull_request_target', () => {
    assert.match(workflow, /^  push:\n    paths:\n      - "docs\/trello\/\*\*"/m);
    assert.match(workflow, /^  pull_request:\n    paths:\n      - "docs\/trello\/\*\*"/m);
    assert.match(workflow, /^  workflow_dispatch:\s*$/m);
    assert.doesNotMatch(workflow, /pull_request_target:/);
    assert.doesNotMatch(workflow, /inputs:/);
  });

  it('uses read-only permissions and non-canceling concurrency', () => {
    assert.match(workflow, /permissions:\n  contents: read/);
    assert.match(workflow, /concurrency:\n  group: trello-docs-sync-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false/);
  });

  it('keeps manual and PR runs dry-run only', () => {
    assert.match(workflow, /if: github\.event_name == 'pull_request' \|\| github\.event_name == 'workflow_dispatch'/);
    assert.match(workflow, /node packages\/cli\/bin\/dotdotgod\.mjs trello sync \. --dry-run/);
  });

  it('maps Trello secrets only on the default-branch push write step', () => {
    assert.match(workflow, /if: github\.event_name != 'push' \|\| github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
    assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
    const writeStepIndex = workflow.indexOf('name: Trello write sync');
    const dryRunStepIndex = workflow.indexOf('name: Trello dry-run');
    assert(writeStepIndex > dryRunStepIndex);
    const dryRunStep = workflow.slice(dryRunStepIndex, writeStepIndex);
    const writeStep = workflow.slice(writeStepIndex);
    assert.doesNotMatch(dryRunStep, /TRELLO_API_KEY|TRELLO_TOKEN/);
    assert.match(writeStep, /TRELLO_API_KEY: \$\{\{ secrets\.TRELLO_API_KEY \}\}/);
    assert.match(writeStep, /TRELLO_TOKEN: \$\{\{ secrets\.TRELLO_TOKEN \}\}/);
  });
});
