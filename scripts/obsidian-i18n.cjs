const messages = {
  en: {
    section: 'dotdotgod Traceability', documentsOnly: 'Documents only',
    showLegend: 'Show color legend', weightedLines: 'Weight-based line width',
    reload: 'Reload traceability', refresh: 'Reload', legend: 'Relationship colors',
    missingGraph: 'Set graphFile in the plugin data.json, then reload the plugin.',
    invalidGraph: 'Invalid traceability data. Export the graph again, then reload.',
    loadError: 'Could not load traceability data. Check the exported file and try again.',
    saveError: 'Could not save graph options. Check file permissions and try again.',
  },
  ko: {
    section: '닷닷갓 추적관계', documentsOnly: '문서만 표시',
    showLegend: '색상 범례 표시', weightedLines: '가중치로 선 두께 표시',
    reload: '추적관계 새로고침', refresh: '새로고침', legend: '관계별 색상',
    missingGraph: '플러그인 data.json에 graphFile을 지정한 뒤 플러그인을 다시 불러오세요.',
    invalidGraph: '추적관계 데이터가 올바르지 않습니다. 그래프를 다시 내보낸 뒤 새로고침하세요.',
    loadError: '추적관계를 불러오지 못했습니다. 내보낸 파일을 확인한 뒤 다시 시도하세요.',
    saveError: '그래프 옵션을 저장하지 못했습니다. 파일 권한을 확인한 뒤 다시 시도하세요.',
  },
};
function translate(language, key) {
  const locale = String(language).toLowerCase().split(/[-_]/)[0];
  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}
module.exports = { translate };
