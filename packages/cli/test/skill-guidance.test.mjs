import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('generated initializer paths and impact guidance preserve host contracts', () => {
  for (const agent of ['pi', 'codex']) {
    const skill = read(`packages/${agent}/skills/project-initializer/SKILL.md`);
    assert.match(skill, /sh <resolved-skill-directory>\/scripts\/init_project\.sh/);
    assert.match(skill, /missing local-memory\/cache entries may be appended/);
  }
  for (const agent of ['claude-code', 'codex', 'hermes']) {
    const skill = read(`packages/${agent}/skills/impact-review/SKILL.md`);
    assert.match(skill, /Call the host-registered project_impact/);
    assert.match(skill, /without claiming it clears host pending state/);
  }
  assert.match(read('packages/opencode/skills/impact-review/SKILL.md'), /only successful reviews of covered unchanged revisions/);
  assert.match(read('packages/opencode/skills/project-load/SKILL.md'), /project_load reports mapUnavailable/);
});

test('standalone task and report guidance separates investigation, implementation and scope', () => {
  const base = 'packages/skills/skills/ddg-planning/';
  for (const path of ['SKILL.md', 'references/TEMPLATES.md']) {
    assert.match(read(base + path), /config\.areas/);
  }
  const template = read(base + 'references/TEMPLATES.md');
  assert.match(template, /태스크 유형: 조사 \/ 구현 \/ 검증/);
  assert.match(template, /보고 대상: 계획 작성 \/ 구현 배치 \/ 전체 작업/);
  assert.match(template, /BATCH_<ID>\.md/);
  assert.doesNotMatch(template, /## 수행 역할: implementer/);
  const reporter = read(base + 'roles/completion-reporter.md');
  assert.doesNotMatch(reporter, /구현 완료 보고서나 실행 승인으로 표현하지 않는다/);
  assert.match(read(base + 'references/COMMON.md'), /설계 확정 후에는 아래 단계별 자율 결정 규칙/);
  assert.match(template, /- 실제 보고서:.*PLANNING\.md.*BATCH_<ID>\.md.*FINAL\.md/);
  assert.match(template, /- 보고 목차:.*README\.md/);
  assert.doesNotMatch(template, /- 보고서:.*README\.md/);
  assert.match(template, /반복 보고는 같은 파일을 갱신하되.*시각이 있는 이력/);
  assert.match(reporter, /보고서 양식의 이력 규칙을 따른다/);
  assert.match(reporter, /작업 범위에 포함되고 승인된 경우에만 머지 예정/);
  assert.match(reporter, /범위 밖 \/ 미승인 \/ 미수행/);
});
