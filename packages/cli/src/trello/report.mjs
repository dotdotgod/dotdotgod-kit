function plural(value, label) {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function pushMessages(lines, label, messages, indent = '') {
  if ((messages ?? []).length === 0) return;
  lines.push(`${indent}${label}:`);
  for (const message of messages) lines.push(`${indent}  - ${message.code}: ${message.message}`);
}

export function formatTrelloDryRunReport(report) {
  const lines = ['Trello docs sync dry-run'];
  lines.push(`Root: ${report.root}`);
  lines.push(`Scan paths: ${report.scanPaths.join(', ')}`);
  lines.push(`Matched: ${plural(report.totals.matchedFiles, 'file')}; planned: ${plural(report.totals.plannedUpdates, 'update')}; warnings: ${report.totals.warnings}; errors: ${report.totals.errors}`);
  pushMessages(lines, 'Warnings', report.warnings);
  pushMessages(lines, 'Errors', report.errors);
  for (const file of report.files) {
    lines.push('');
    lines.push(`File: ${file.file}`);
    lines.push(`  Trello URL: ${file.trelloUrl || '(missing)'}`);
    if (file.shortLink) lines.push(`  Trello short link: ${file.shortLink}`);
    lines.push(`  GitHub URL: ${file.githubUrl || '(unresolved)'}`);
    if (file.repositoryKey) lines.push(`  Repository entry: ${file.repositoryKey}`);
    lines.push(`  Planned attachment: ${file.plannedAttachmentAction}`);
    lines.push(`  Planned custom field: ${file.plannedCustomFieldAction}`);
    lines.push(`  Sync status: ${file.syncStatus}`);
    lines.push(`  Traceability: ${file.traceability.state}${file.traceability.details.length ? ` (${file.traceability.details.join(', ')})` : ''}`);
    pushMessages(lines, 'Warnings', file.warnings, '  ');
    pushMessages(lines, 'Errors', file.errors, '  ');
  }
  return `${lines.join('\n')}\n`;
}

export function formatTrelloWriteReport(report) {
  const lines = ['Trello docs sync write'];
  lines.push(`Root: ${report.root}`);
  lines.push(`Scan paths: ${report.scanPaths.join(', ')}`);
  lines.push(`Matched: ${plural(report.totals.matchedFiles, 'file')}; written: ${report.totals.written}; unchanged: ${report.totals.unchanged}; blocked: ${report.totals.blocked}; conflict: ${report.totals.conflict}; api-failed: ${report.totals.apiFailed}; warnings: ${report.totals.warnings}; errors: ${report.totals.errors}`);
  pushMessages(lines, 'Warnings', report.warnings);
  pushMessages(lines, 'Errors', report.errors);
  for (const file of report.files) {
    lines.push('');
    lines.push(`File: ${file.file}`);
    lines.push(`  Trello URL: ${file.trelloUrl || '(missing)'}`);
    if (file.shortLink) lines.push(`  Trello short link: ${file.shortLink}`);
    lines.push(`  GitHub URL: ${file.githubUrl || '(unresolved)'}`);
    if (file.repositoryKey) lines.push(`  Repository entry: ${file.repositoryKey}`);
    lines.push(`  Attachment: ${file.attachment?.status ?? 'not-run'}`);
    const customFieldAction = file.customField?.action ? ` (${file.customField.action})` : '';
    lines.push(`  Custom field: ${file.customField?.status ?? 'not-run'}${customFieldAction}`);
    if (file.customField?.name) lines.push(`  Custom field name: ${file.customField.name}`);
    if (file.customField?.preservedRepositoryEntries > 0) lines.push(`  Preserved repository entries: ${file.customField.preservedRepositoryEntries}`);
    lines.push(`  Final status: ${file.finalStatus ?? file.syncStatus}`);
    lines.push(`  Traceability: ${file.traceability.state}${file.traceability.details.length ? ` (${file.traceability.details.join(', ')})` : ''}`);
    pushMessages(lines, 'Warnings', file.warnings, '  ');
    pushMessages(lines, 'Errors', file.errors, '  ');
  }
  return `${lines.join('\n')}\n`;
}
