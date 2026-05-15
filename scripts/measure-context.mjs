#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const asMarkdown = args.includes('--markdown') || !asJson;
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
const includeArchive = args.includes('--include-archive');

const markerFiles = ['AGENTS.md','CLAUDE.md','CODEX.md','README.md','docs/README.md','docs/spec/README.md','docs/test/README.md','docs/arch/README.md','docs/plan/README.md','docs/archive/README.md'];
const memoryDirectories = ['docs/spec','docs/test','docs/arch','docs/plan'];

function walkMarkdown(dir, limit = Infinity) {
  const out = [];
  const walk = (current) => {
    if (out.length >= limit || !existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (out.length >= limit) return;
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(relative(root, full));
    }
  };
  walk(join(root, dir));
  return out.sort();
}
function read(path) { try { return readFileSync(join(root, path), 'utf8'); } catch { return ''; } }
function measureFiles(name, files, notes) {
  const existing = [...new Set(files)].filter((f) => existsSync(join(root, f)));
  const text = existing.map(read).join('\n');
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { name, files: existing.length, characters: chars, words, approxTokens: Math.ceil(chars / 4), notes };
}
function listMarkdownFiles(directory, limit = 20) { return walkMarkdown(directory, limit); }
function buildLoadPrompt() {
  const present = markerFiles.filter((f) => existsSync(join(root, f)));
  const missing = markerFiles.filter((f) => !existsSync(join(root, f)));
  const directories = memoryDirectories.map((directory) => ({ path: directory, exists: existsSync(join(root, directory)), markdownFiles: listMarkdownFiles(directory) }));
  const presentText = present.length ? present.map((f) => `- ${f}`).join('\n') : '- none';
  const missingText = missing.length ? missing.map((f) => `- ${f}`).join('\n') : '- none';
  const directorySummary = directories.map((d) => !d.exists ? `- ${d.path}: missing` : d.markdownFiles.length === 0 ? `- ${d.path}: no markdown files` : `- ${d.path}:\n${d.markdownFiles.map((f) => `  - ${f}`).join('\n')}`).join('\n');
  return `Load the dotdotgod project memory.\nCurrent working directory: ${root}\n\nLoad snapshot:\n- Measurement placeholder: runtime /dd:load uses dotdotgod load-snapshot when available and falls back to this lightweight summary.\n\nDetected memory files:\n${presentText}\n\nMissing baseline files:\n${missingText}\n\nDocumentation directory summary:\n${directorySummary}\n\nInstructions:\n1. Use the Load snapshot section first when present. Treat it as the bounded project-memory map for cache status, graph size, related communities, and archive inclusion policy.\n2. Use only read-only tools such as read, ls, grep, and find to inspect project memory files.\n3. Start with AGENTS.md, README.md, and docs/README.md when they are not already clear from the loaded context.\n4. Inspect docs/spec, docs/arch, and docs/test selectively based on the user request, the load snapshot communities, and README indexes. Do not re-scan every listed file unless the task needs a full refresh.\n5. Follow README.md indexes, including domain directories such as docs/<area>/<domain>/README.md and expanded convention directories such as docs/arch/conventions/README.md.\n6. For docs/plan, list entries first and selectively read only the relevant README.md or markdown files.\n7. For docs/archive, do not scan it as part of the documentation directory summary. Use docs/archive/README.md as the history map, and use targeted archive paths only when the user request or current task makes completed plans/reports relevant.\n8. Summarize the result concisely.\n\nResponse format:\n- Project summary\n- Key working rules\n- Available commands and verification methods\n- Documentation map\n- Active plans\n- Relevant archive notes\n- Open TODO/TBD items or questions to clarify\n\nDo not modify files. Only load and summarize project memory.`;
}
function git(cmd) { try { return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { return undefined; } }
const docsIndexes = walkMarkdown('docs').filter((f) => f.endsWith('/README.md') || f === 'docs/README.md').filter((f) => includeArchive || !f.startsWith('docs/archive/plan/') && !f.startsWith('docs/archive/report/'));
const defaultDocs = memoryDirectories.flatMap((d) => walkMarkdown(d));
const archiveAll = walkMarkdown('docs/archive');
const archiveIndex = archiveAll.filter((f) => f === 'docs/archive/README.md');
const archiveBody = archiveAll.filter((f) => f !== 'docs/archive/README.md');
const loadPrompt = buildLoadPrompt();
const groups = [
  { name: 'Load prompt', files: 1, characters: loadPrompt.length, words: loadPrompt.trim().split(/\s+/).length, approxTokens: Math.ceil(loadPrompt.length / 4), notes: 'Generated from current /dd:load prompt shape' },
  measureFiles('Baseline memory', markerFiles, 'AGENTS/CLAUDE/CODEX/root/docs indexes'),
  measureFiles('Docs indexes', docsIndexes, 'README indexes; archive bodies excluded by default'),
  measureFiles('Default docs surface', defaultDocs, 'spec/arch/test/plan; archive excluded from directory summary'),
  measureFiles('Archive index', archiveIndex, 'Available history map'),
  measureFiles('Full archive', archiveAll, 'Not loaded by default'),
  measureFiles('Archive body excluded', archiveBody, 'Historical memory kept out of default summary'),
];
const result = { measuredAt: new Date().toISOString(), commit: git('rev-parse --short HEAD') ?? null, dirty: Boolean(git('status --short')), approximation: 'approxTokens = ceil(characters / 4)', includeArchive, groups };
function markdown(r) {
  const rows = r.groups.map((g) => `| ${g.name} | ${g.files} | ${g.characters} | ${g.words} | ${g.approxTokens} | ${g.notes} |`).join('\n');
  return `# Context Measurement Snapshot\n\nMeasured on: ${r.measuredAt}\nCommit: ${r.commit ?? 'unknown'}\nDirty worktree: ${r.dirty ? 'yes' : 'no'}\nApproximation: ${r.approximation}\n\n| Group | Files | Characters | Words | Approx tokens | Notes |\n| --- | ---: | ---: | ---: | ---: | --- |\n${rows}\n`;
}
const content = asJson ? JSON.stringify(result, null, 2) + '\n' : markdown(result);
if (outputPath) { mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, content); }
else process.stdout.write(content);
