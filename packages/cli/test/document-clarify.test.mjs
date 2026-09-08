import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('all document-clarify adapters preserve canonical writing guidance and safeguards', () => {
  const source = read('packages/shared/workflows/doc-clarify.md').trim();
  for (const adapter of ['pi', 'claude-code', 'codex']) {
    const skill = read(`packages/${adapter}/skills/document-clarify/SKILL.md`);
    assert.ok(skill.includes(source), `${adapter} must embed the complete shared workflow`);
    assert.ok(skill.includes('excludePaths'), `${adapter} must honor memory exclusions`);
  }
  for (const phrase of ['Google Technical Writing One', '**Audience:**', '**Terminology:**', '**Sentences:**', '**Paragraphs:**', '**Lists and tables:**', '**Language:**', 'never invent an unknown actor', 'Preserve meaningful prohibitions', 'unverified status', 'Accuracy takes priority over brevity']) {
    assert.ok(source.includes(phrase), `missing principle or safeguard: ${phrase}`);
  }
});
