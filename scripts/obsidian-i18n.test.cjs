const { test } = require('node:test');
const assert = require('node:assert/strict');
const { translate } = require('./obsidian-i18n.cjs');
test('Korean variants and English fallback', () => {
  assert.equal(translate('ko', 'documentsOnly'), '문서만 표시');
  assert.equal(translate('ko-KR', 'reload'), '추적관계 새로고침');
  assert.equal(translate('en', 'documentsOnly'), 'Documents only');
  assert.equal(translate('ja', 'section'), 'dotdotgod Traceability');
  assert.equal(translate(undefined, 'refresh'), 'Reload');
});
