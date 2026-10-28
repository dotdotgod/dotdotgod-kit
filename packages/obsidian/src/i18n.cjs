const messages = {
  en: {
    section: 'dotdotgod Traceability', documentsOnly: 'Documents only',
    showLegend: 'Show color legend', weightedLines: 'Weight-based line width',
    reload: 'Reload traceability', refresh: 'Reload', legend: 'Relationship colors',
    missingGraph: 'Export with dotdotgod graph export ., then reload in the plugin settings.',
    invalidGraph: 'Invalid traceability data. Export the graph again, then reload.',
    loadError: 'Could not load traceability data. Run dotdotgod graph export . in this vault, check the graph file in settings, then reload.',
    saveError: 'Could not save graph options. Check file permissions and try again.',
    graphPath: 'Graph data file', graphPathHelp: 'Vault-relative JSON path. Export with: dotdotgod graph export .',
    invalidPath: 'Choose a relative JSON path inside this vault.',
    unsupported: 'This graph renderer is not supported. Disable dotdotgod Traceability and report your Obsidian version.',
  },
  ko: {
    section: '닷닷갓 추적관계', documentsOnly: '문서만 표시',
    showLegend: '색상 범례 표시', weightedLines: '가중치로 선 두께 표시',
    reload: '추적관계 새로고침', refresh: '새로고침', legend: '관계별 색상',
    missingGraph: 'dotdotgod graph export . 명령으로 내보낸 뒤 플러그인 설정에서 새로고침하세요.',
    invalidGraph: '추적관계 데이터가 올바르지 않습니다. 그래프를 다시 내보낸 뒤 새로고침하세요.',
    loadError: '추적관계를 불러오지 못했습니다. 이 Vault에서 dotdotgod graph export . 명령을 실행하고 설정의 그래프 파일을 확인한 뒤 새로고침하세요.',
    saveError: '그래프 옵션을 저장하지 못했습니다. 파일 권한을 확인한 뒤 다시 시도하세요.',
    graphPath: '그래프 데이터 파일', graphPathHelp: 'Vault 내부 상대 JSON 경로. 내보내기: dotdotgod graph export .',
    invalidPath: 'Vault 내부의 상대 JSON 경로를 지정하세요.',
    unsupported: '지원하지 않는 그래프 렌더러입니다. 플러그인을 끄고 Obsidian 버전을 알려주세요.',
  },
};
function translate(language, key) {
  const locale = String(language).toLowerCase().split(/[-_]/)[0];
  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}
module.exports = { translate };
