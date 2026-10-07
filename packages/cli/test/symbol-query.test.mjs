import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSymbols } from '../src/symbols/parser.mjs';
import { buildOutlines, outlineChunks, outlinePath, outlineStatus } from '../src/symbols/store.mjs';
import { queryProject, parseQueryOptions } from '../src/commands/query.mjs';
import { addOutlineGraph } from '../src/symbols/graph.mjs';

const samples = {
  javascript: '/** Work. */\nexport class Example { /** Run. */ run() { return "}"; } }\nconst arrow = (x) => x + 1;',
  typescript: '/** Work. */\nclass Example { /** Run. */ run(x: string): string { return x; } }',
  tsx: '/** Run. */\nfunction run() { return <div/>; }',
  python: 'class Example:\n    """Work."""\n    def run(self):\n        """Run."""\n        return 1\n',
  go: '// Run works.\nfunc run() int { return 1 }',
  rust: '/// Run works.\nfn run() -> i32 { 1 }',
  java: '/** Work. */\nclass Example { /** Run. */ int run() { return 1; } }',
  ruby: '# Run works.\ndef run\n  1\nend',
  php: '<?php\n/** Run. */\nfunction run() { return 1; }',
  'c-sharp': '/** Work. */\nclass Example { /** Run. */ int run() { return 1; } }',
  cpp: '/** Run. */\nint run() { return 1; }',
  bash: '# Run works.\nrun() { echo yes; }',
  powershell: '# Run works.\nfunction run { return 1 }',
};
for (const [language, source] of Object.entries(samples)) test(`parser capability: ${language}`, async () => {
  const result = await extractSymbols(`sample.${language}`, source, language);
  assert.equal(result.status, 'parsed');
  assert.ok(result.symbols.some((symbol) => symbol.name === 'run'), JSON.stringify(result));
  const run = result.symbols.find((symbol) => symbol.name === 'run');
  assert.ok(run.documentation.includes('Run'), JSON.stringify(run));
  assert.ok(run.startLine >= 1 && run.endLine >= run.startLine);
  assert.ok(!run.signature.includes('return 1') && !run.signature.includes('echo yes'));
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-symbol-query-'));
  mkdirSync(join(root, 'src')); mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'README.md'), '# Documentation\n\nrun retrieves widgets.\n');
  writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n');
  writeFileSync(join(root, 'src', 'service.ts'), '/** Widgets. */\nexport class Example {\n  /** Run retrieves widgets. */\n  run(): number { return 1; }\n  /** Stop widgets. */\n  stop(): void {}\n}\n');
  return root;
}
const embed = async (texts) => texts.map((text) => text.toLowerCase().includes('run') ? [1, 0] : [0, 1]);

test('mixed retrieval, same-file methods, body exclusion and offline keyword independence', async () => {
  const root = fixture();
  try {
    const keyword = await queryProject(root, 'widgets', { search: 'keyword' });
    assert.ok(keyword.results.some((result) => result.kind === 'document'));
    assert.ok(keyword.results.filter((result) => result.path === 'src/service.ts').length >= 2);
    assert.ok(keyword.results.every((result) => !result.text.includes('return 1')));
    const vector = await queryProject(root, 'run', { embed });
    assert.ok(vector.results.some((result) => result.kind === 'symbol'));
    assert.ok(vector.results.some((result) => result.kind === 'document'));
    const docs = await queryProject(root, 'widgets', { scope: 'docs', search: 'keyword' });
    assert.ok(docs.results.every((result) => result.kind === 'document'));
    const fallback = await queryProject(root, 'widgets', { embed: async () => { throw new Error('offline'); } });
    assert.ok(fallback.warnings[0].includes('offline'));
    assert.ok(fallback.results.length);
    await assert.rejects(queryProject(root, 'run', { search: 'vector', profile: { provider: 'openai-compatible', model: 'test' }, embed }), /consent|allow-code-embedding/);
    const denied = await queryProject(root, 'run', { profile: { provider: 'openai-compatible', model: 'test' }, embed: async () => { throw new Error('must not contact provider'); } });
    assert.ok(denied.results.length);
    assert.match(denied.warnings[0], /consent|allow-code-embedding/);
    const allowed = await queryProject(root, 'run', { profile: { provider: 'openai-compatible', model: 'test' }, embed, allowCodeEmbedding: true });
    assert.ok(allowed.results.length);
    assert.equal(parseQueryOptions([root, 'run']).scope, 'all');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('outline freshness: additions, line shifts, body-only edits, deletion, corruption and zero symbols', async () => {
  const root = fixture();
  try {
    assert.equal(outlineStatus(root).ok, false);
    const first = await buildOutlines(root);
    assert.equal(outlineStatus(root).ok, true);
    const before = outlineChunks(first);
    const file = join(root, 'src', 'service.ts');
    writeFileSync(file, '\n' + readFileSync(file, 'utf8'));
    assert.equal(outlineStatus(root).ok, false);
    const shifted = await buildOutlines(root);
    const after = outlineChunks(shifted);
    assert.deepEqual(before.map((item) => item.fingerprint), after.map((item) => item.fingerprint));
    assert.equal(after[0].startLine, before[0].startLine + 1);
    writeFileSync(file, readFileSync(file, 'utf8').replace('return 1', 'return 2'));
    assert.equal(outlineStatus(root).ok, false);
    const body = await buildOutlines(root);
    assert.deepEqual(outlineChunks(body).map((item) => item.fingerprint), after.map((item) => item.fingerprint));
    writeFileSync(join(root, 'src', 'empty.ts'), 'const value = 1;\n');
    assert.equal(outlineStatus(root).ok, false);
    const empty = await buildOutlines(root);
    assert.equal(empty.files.find((item) => item.path.endsWith('empty.ts')).symbols.length, 0);
    rmSync(file); assert.equal(outlineStatus(root).ok, false);
    await buildOutlines(root); assert.equal(outlineStatus(root).ok, true);
    const data = JSON.parse(readFileSync(outlinePath(root), 'utf8'));
    data.extractor = 'old'; writeFileSync(outlinePath(root), JSON.stringify(data));
    assert.equal(outlineStatus(root).ok, false);
    writeFileSync(outlinePath(root), '{broken'); assert.equal(outlineStatus(root).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('overloads, accessors, arrows, Unicode/CRLF offsets and malformed syntax', async () => {
  const source = '/** λ docs */\r\nfunction pick(x: string): string;\r\nfunction pick(x: number): number;\r\nfunction pick(x: unknown) { return x; }\r\nclass Example { get value() { return 1; } handler = (x: number) => x + 1; }\r\n';
  const result = await extractSymbols('forms.ts', source, 'typescript');
  assert.equal(result.status, 'parsed');
  assert.equal(result.symbols.filter((item) => item.name === 'pick').length, 3);
  assert.equal(new Set(result.symbols.map((item) => item.id)).size, result.symbols.length);
  for (const symbol of result.symbols) {
    assert.equal(source.slice(symbol.declarationStartOffset, symbol.bodyStartOffset ?? symbol.declarationEndOffset).trim(), symbol.signature);
  }
  assert.ok(result.symbols.some((item) => item.qualifiedName === 'Example.handler'));
  assert.equal((await extractSymbols('bad.ts', 'function broken( {', 'typescript')).status, 'partial');
});

test('nested default callbacks do not leak implementation into signatures', async () => {
  const result = await extractSymbols('nested.js', '/** Work. */\nfunction run(callback = () => { return "body_only_marker"; }) { return callback(); }', 'javascript');
  assert.ok(!result.symbols.find((symbol) => symbol.name === 'run').signature.includes('body_only_marker'));
  assert.ok(result.symbols.find((symbol) => symbol.name === 'run').signature.includes('…'));
});

test('missing comments keep finite persisted ranges and valid reusable metadata', async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, 'src', 'bare.ts'), 'export function bare() { return 1; }\n');
    const index = await buildOutlines(root);
    const symbol = index.files.find((file) => file.path.endsWith('bare.ts')).symbols[0];
    assert.equal(symbol.documentation, '');
    assert.equal(symbol.startLine, 1);
    assert.equal(outlineStatus(root).ok, true);
    assert.equal((await buildOutlines(root)).refresh.parsed, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('arrow declaration docs and Python literal docstrings are not fabricated', async () => {
  const js = await extractSymbols('arrow.js', '/** Arrow docs. @returns a value */\nexport const arrow = (x) => x + 1;', 'javascript');
  assert.ok(js.symbols.find((symbol) => symbol.name === 'arrow').documentation.includes('@returns'));
  const python = await extractSymbols('literal.py', 'def raw():\n    r"""Real docs."""\n    pass\ndef formatted():\n    f"""Not docs {1}"""\n    pass\n', 'python');
  assert.ok(python.symbols.find((symbol) => symbol.name === 'raw').documentation.includes('Real docs'));
  assert.equal(python.symbols.find((symbol) => symbol.name === 'formatted').documentation, '');
});

test('Gitignore including nested negation works without a Git repository', async () => {
  const root = fixture();
  try {
    writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n*.ts\n!src/service.ts\n');
    writeFileSync(join(root, 'src', '.gitignore'), '!kept.ts\n');
    writeFileSync(join(root, 'src', 'kept.ts'), 'function kept() {}');
    writeFileSync(join(root, 'src', 'ignored.ts'), 'function secret() {}');
    const index = await buildOutlines(root);
    assert.ok(index.files.some((file) => file.path === 'src/kept.ts'));
    assert.ok(!index.files.some((file) => file.path === 'src/ignored.ts'));
    writeFileSync(join(root, 'src', '.gitignore'), '!kept.ts\n# Policy changed\n');
    assert.equal(outlineStatus(root).reason, 'policy-changed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI index and read-only outline validation preserve plain validate', () => {
  const root = fixture();
  const bin = fileURLToPath(new URL('../bin/dotdotgod.mjs', import.meta.url));
  const cli = (args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  try {
    const indexed = cli(['index', root, '--json']);
    assert.equal(indexed.status, 0, indexed.stdout + indexed.stderr);
    assert.equal(cli(['validate', root, '--check-index']).status, 0);
    const before = readFileSync(outlinePath(root), 'utf8');
    writeFileSync(join(root, 'src', 'service.ts'), 'function broken( {');
    const stale = cli(['validate', root, '--check-index', '--json']);
    assert.equal(stale.status, 1);
    assert.ok(JSON.parse(stale.stdout).errors.some((error) => error.code === 'OUTLINE_INDEX_STALE'));
    assert.equal(readFileSync(outlinePath(root), 'utf8'), before);
    assert.equal(cli(['validate', root]).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('imports, ownership, unsupported languages and source containment', async () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'dotdotgod-symbol-outside-'));
  try {
    writeFileSync(join(root, 'src', 'caller.ts'), "import { Example } from './service.js';\nimport missing from 'external';\n");
    writeFileSync(join(root, 'src', 'unsupported.swift'), 'func run() {}');
    writeFileSync(join(outside, 'secret.ts'), 'function secret() {}');
    symlinkSync(join(outside, 'secret.ts'), join(root, 'src', 'escape.ts'));
    const index = await buildOutlines(root);
    assert.ok(!index.files.some((file) => file.path.endsWith('escape.ts')));
    assert.equal(index.files.find((file) => file.path.endsWith('.swift')).status, 'unsupported');
    const graph = addOutlineGraph({ nodes: [], edges: [] }, index);
    assert.ok(graph.edges.some((edge) => edge.relation === 'contains_symbol'));
    assert.ok(graph.edges.some((edge) => edge.relation === 'imports' && edge.target === 'file:src/service.ts' && edge.resolved));
    assert.ok(graph.edges.some((edge) => edge.relation === 'imports' && !edge.resolved));
    assert.ok(!graph.edges.some((edge) => edge.relation === 'calls'));
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
