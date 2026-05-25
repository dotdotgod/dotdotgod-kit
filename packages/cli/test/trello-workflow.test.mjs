import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const workflow = readFileSync(new URL('../../../.github/workflows/trello-docs-sync.yml', import.meta.url), 'utf8');

describe('Trello docs sync workflow', () => {
  it('uses safe triggers without workflow_dispatch inputs or pull_request_target', () => {
    assert.match(workflow, /^  push:\n    paths:\n      - "docs\/trello\/\*\*"\n      - "packages\/trello-power-up\/\*\*"\n      - "\.github\/workflows\/trello-docs-sync\.yml"/m);
    assert.match(workflow, /^  pull_request:\n    paths:\n      - "docs\/trello\/\*\*"\n      - "packages\/trello-power-up\/\*\*"\n      - "\.github\/workflows\/trello-docs-sync\.yml"/m);
    assert.match(workflow, /^  workflow_dispatch:\s*$/m);
    assert.doesNotMatch(workflow, /pull_request_target:/);
    assert.doesNotMatch(workflow, /inputs:/);
  });

  it('uses read-only workflow permissions and non-canceling concurrency', () => {
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
    const writeStepEnd = workflow.indexOf('\n\n  build-power-up-pages:', writeStepIndex);
    const writeStep = workflow.slice(writeStepIndex, writeStepEnd);
    assert.doesNotMatch(dryRunStep, /TRELLO_API_KEY|TRELLO_TOKEN/);
    assert.match(writeStep, /TRELLO_API_KEY: \$\{\{ secrets\.TRELLO_API_KEY \}\}/);
    assert.match(writeStep, /TRELLO_TOKEN: \$\{\{ secrets\.TRELLO_TOKEN \}\}/);
    assert.doesNotMatch(workflow.slice(writeStepEnd), /TRELLO_API_KEY|TRELLO_TOKEN/);
  });

  it('builds and deploys the Power-Up Pages artifact without deploying from PRs', () => {
    assert.match(workflow, /build-power-up-pages:/);
    assert.match(workflow, /mkdir -p dist\/trello/);
    assert.match(workflow, /cp -R packages\/trello-power-up\/index\.html dist\/trello\/index\.html/);
    assert.match(workflow, /uses: actions\/upload-pages-artifact@v3/);
    assert.match(workflow, /path: dist/);
    assert.match(workflow, /deploy-power-up-pages:/);
    assert.match(workflow, /if: github\.event_name != 'pull_request' && github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
    assert.match(workflow, /permissions:\n      pages: write\n      id-token: write/);
    assert.match(workflow, /uses: actions\/deploy-pages@v4/);
  });
});
