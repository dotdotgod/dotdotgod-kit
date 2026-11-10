import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('standalone document-clarify preserves guidance without adapter copies', () => {
  const source = read('packages/shared/workflows/doc-clarify.md').trim();
  const skill = read('packages/skills/skills/document-clarify/SKILL.md');
  assert.ok(skill.includes(source), 'standalone skill must embed the complete shared workflow');
  assert.ok(skill.includes('excludePaths'));
  assert.ok(skill.includes('config.areas'));
  assert.ok(skill.includes('When CLI-backed routing is unavailable'));
  assert.doesNotMatch(skill, /operator-authorized selected repository|OpenCode Code Mode/);
  assert.match(read('packages/skills/skills/document-clarify/agents/openai.yaml'), /Document Clarify/);
  for (const adapter of ['pi', 'claude-code', 'codex', 'hermes', 'opencode']) {
    assert.equal(existsSync(new URL(`../../../packages/${adapter}/skills/document-clarify`, import.meta.url)), false, `${adapter} must not bundle the skill`);
  }
  for (const phrase of ['Reader Decision Check', 'Remove obsolete historical behavior and superseded conditions from current specs', 'maintained source, tests, or confirmed decisions', 'currently supported compatibility behavior', 'when retirement is unverified, ask rather than delete', 'Preserve historical meaning in archives and reports', 'Google Technical Writing One', '**Audience:**', '**Terminology:**', '**Sentences:**', '**Paragraphs:**', '**Lists and tables:**', '**Language:**', 'never invent an unknown actor', 'Preserve meaningful prohibitions', 'unverified status', 'Accuracy takes priority over brevity']) {
    assert.ok(source.includes(phrase), `missing principle or safeguard: ${phrase}`);
  }
});
