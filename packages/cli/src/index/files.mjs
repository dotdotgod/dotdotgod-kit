import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, extname, join } from 'node:path';
import { rel } from '../common/paths.mjs';
import { defaultMemoryConfig, readMemoryConfig, resolveMemoryArea } from '../memory/config.mjs';

const CACHE_DIR = '.dotdotgod';
const MANIFEST_FILE = 'manifest.json';
const INDEX_TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc', '.org',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.pyw', '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.rb', '.php', '.cs', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.m', '.mm', '.scala', '.clj', '.cljs', '.ex', '.exs', '.erl', '.hrl', '.lua', '.pl', '.pm', '.r', '.R', '.sql',
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.xml', '.html', '.htm', '.css', '.scss', '.sass', '.less', '.svg',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.tf', '.tfvars', '.hcl', '.nix', '.cue',
]);
const INDEX_TEXT_FILENAMES = new Set([
  'AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'README', 'README.md', 'LICENSE', 'NOTICE', 'CHANGELOG', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'AUTHORS', 'CODEOWNERS', '.gitignore', '.editorconfig',
  'dotdotgod.config.json', '.dotdotgodrc.json', 'package.json', 'pnpm-workspace.yaml', 'tsconfig.json', 'jsconfig.json',
  'Dockerfile', 'Containerfile', 'Makefile', 'Justfile', 'Procfile', 'Rakefile', 'Gemfile', 'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'pyproject.toml', 'requirements.txt', 'Pipfile', 'Pipfile.lock', 'poetry.lock', 'deno.json', 'deno.jsonc', 'bunfig.toml',
  '.env.example', '.env.sample', '.env.template',
]);
const INDEX_EXCLUDED_DIRS = new Set(['.git', CACHE_DIR, 'node_modules', 'vendor', '.venv', 'venv', 'target', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache', '.pytest_cache', '__pycache__']);

function isExcludedIndexDir(path) {
  return path.split('/').some((part) => INDEX_EXCLUDED_DIRS.has(part));
}

function isSecretIndexPath(path) {
  const name = basename(path);
  return name === '.env' || (/^\.env\./.test(name) && !INDEX_TEXT_FILENAMES.has(name));
}

function isGeneratedIndexPath(path) {
  const name = basename(path);
  return name.endsWith('.min.js') || name.endsWith('.snap') || name.endsWith('.lockb');
}

function isSupportedIndexFile(path) {
  const name = basename(path);
  return INDEX_TEXT_FILENAMES.has(name) || INDEX_TEXT_EXTENSIONS.has(extname(name));
}

export function shouldIndexPath(path, config = defaultMemoryConfig()) {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.endsWith('/placeholder')) return false;
  if (isExcludedIndexDir(normalized) || isSecretIndexPath(normalized) || isGeneratedIndexPath(normalized)) return false;
  const area = resolveMemoryArea(normalized, config);
  if (area?.includeBodiesByDefault === false) return false;
  return isSupportedIndexFile(normalized);
}

function gitIndexCandidates(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function walkIndexCandidates(root, config = readMemoryConfig(root)) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const pathRel = rel(root, path);
      if (entry.isDirectory()) {
        const area = resolveMemoryArea(pathRel, config);
        if (!isExcludedIndexDir(pathRel) && area?.includeBodiesByDefault !== false) walk(path);
      } else if (entry.isFile()) files.push(pathRel);
    }
  };
  walk(root);
  return files;
}

function addDotdotgodLocalMemoryCandidates(root, candidates) {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'README.md', 'docs/README.md', 'docs/spec/README.md', 'docs/test/README.md', 'docs/arch/README.md', 'docs/plan/README.md', 'docs/archive/README.md']) {
    if (existsSync(join(root, file))) candidates.add(file);
  }
  const planRoot = join(root, 'docs/plan');
  const walkPlan = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walkPlan(path);
      else if (entry.isFile()) candidates.add(rel(root, path));
    }
  };
  walkPlan(planRoot);
}

export function collectIndexFiles(root, config = readMemoryConfig(root)) {
  const candidates = new Set(gitIndexCandidates(root) ?? walkIndexCandidates(root, config));
  addDotdotgodLocalMemoryCandidates(root, candidates);
  return [...candidates].filter((path) => shouldIndexPath(path, config)).map((path) => join(root, path)).filter(existsSync).sort();
}

export function fingerprint(file) {
  const content = readFileSync(file);
  return createHash('sha256').update(content).digest('hex');
}

export function cacheFile(root) {
  return join(root, CACHE_DIR, MANIFEST_FILE);
}

