import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { usage } from '../cli/usage.mjs';
import { rel } from '../common/paths.mjs';
import { extractAnchors, extractFirstHeading, extractLinks, isKebabCase, isNumberedSeriesFilename, isUpperSnakeMarkdown, suggestFilenameFromHeading } from '../docs/markdown.mjs';
import { extractDotdotgodTraceabilityBlocks, stripTraceabilityLinksRegion, syncTraceabilityLinksInContent, traceabilityExample, validateTraceabilityBlock, validateTraceabilityLinksRegion, validateTraceabilityPlacement } from '../docs/traceability.mjs';
import { DEFAULT_VALIDATION_POLICY, cloneValidationPolicy, isMarkdownSizeExcluded, matchPathPattern, readMemoryConfig, requiresTraceability, resolveMemoryArea } from '../memory/config.mjs';
import { cacheFile, collectIndexFiles, fingerprint } from '../index/files.mjs';
import { CACHE_DIR, CACHE_VERSION } from '../index/constants.mjs';
import { readIndex } from '../index/cache.mjs';

export function runValidate(argv) {
  const options = { root: '.', includeLocalMemory: false, checkIndex: false, maxLines: null, maxChars: null, linkCheck: true, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--include-local-memory') options.includeLocalMemory = true;
    else if (arg === '--check-index') options.checkIndex = true;
    else if (arg === '--max-lines') options.maxLines = Number(argv[++i]);
    else if (arg === '--max-chars') options.maxChars = Number(argv[++i]);
    else if (arg === '--no-link-check') options.linkCheck = false;
    else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-')) options.root = arg;
    else usage(`Unknown option: ${arg}`, 'validate');
  }

  const root = resolve(options.root);
  const docs = join(root, 'docs');
  const errors = [];
  const warnings = [];
  const markdownFiles = [];
  const fileCache = new Map();
  const addError = (file, code, message, line = null, fix = null, prompt = null) => errors.push({ file: rel(root, file), line, code, message: fix ? `${message}\nFix: ${fix}` : message, ...(prompt ? { prompt } : {}) });
  const addWarning = (file, code, message, metadata = {}) => warnings.push({ file: rel(root, file), code, message, ...metadata });
  const shouldSkipDir = (dir) => {
    const path = rel(root, dir);
    if (!path || path === '.') return false;
    if (path.includes('/node_modules') || path === 'node_modules') return true;
    if (path.includes('/.git') || path === '.git') return true;
    if (path === CACHE_DIR || path.startsWith(`${CACHE_DIR}/`)) return true;
    if (/^docs\/(?:plan|archive\/plan)\/[a-z0-9]+(?:-[a-z0-9]+)*\/\.dotdotgod-plan(?:\/|$)/.test(path)) return true;
    if (!options.includeLocalMemory && (path === 'docs/plan' || path.startsWith('docs/plan/') || path === 'docs/archive' || path.startsWith('docs/archive/'))) return true;
    return false;
  };
  const walk = (dir) => {
    if (!existsSync(dir) || shouldSkipDir(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const docsRel = rel(docs, path);
        if (docsRel && !docsRel.startsWith('..')) {
          const isPlanInternalWorkspaceDir = /^(?:plan|archive\/plan)\/[a-z0-9]+(?:-[a-z0-9]+)*\/\.dotdotgod-plan(?:\/|$)/.test(docsRel);
          if (!isPlanInternalWorkspaceDir) for (const part of docsRel.split('/')) if (part && !isKebabCase(part)) addError(path, 'DIR_NAMING', `Directory must be kebab-case: ${part}`, null, 'rename this docs directory to kebab-case and update any links that reference it.');
        }
        walk(path);
      } else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(path);
    }
  };

  if (!existsSync(docs)) usage(`docs directory not found: ${docs}`);
  const memoryConfig = readMemoryConfig(root);
  const validationPolicy = cloneValidationPolicy(memoryConfig.validation ?? DEFAULT_VALIDATION_POLICY);
  const maxLines = options.maxLines ?? validationPolicy.markdown.maxLines;
  const maxChars = options.maxChars ?? validationPolicy.markdown.maxChars;
  const markdownSizePrompt = (path) => {
    const area = resolveMemoryArea(path, memoryConfig);
    const areaText = area ? `${area.label ?? area.id} (${area.id})` : 'the matching documentation area';
    const roleText = area?.role ?? 'the document role';
    return `Split ${path} into focused documents by documentation area and role. Keep the current ${areaText} area semantics and ${roleText} role intact, move role-specific detail into smaller UPPER_SNAKE_CASE markdown files, and update the nearest README.md index with each new file's purpose.`;
  };
  for (const error of memoryConfig.errors ?? []) errors.push(error);
  const FILENAME_QUALITY_AREAS = new Set(
    (memoryConfig.areas ?? [])
      .filter(area => area.scope === 'shared')
      .flatMap(area => area.paths ?? [])
      .map(p => { const m = p.match(/^docs\/([^/*]+)\/\*\*$/); return m ? m[1] : null; })
      .filter(Boolean)
  );
  const FILENAME_QUALITY_PROMPT =
    'Background: Filenames and paths are LLM/agent context signals used for impact ranking, search, and retrieval. ' +
    'Abstract or sequentially numbered filenames carry low information signal.\n' +
    'Naming principles:\n' +
    '1. Filenames in docs/spec, docs/arch, docs/test should be meaning-based wherever possible.\n' +
    '2. The filename alone should let you infer the primary subject: endpoint, screen, policy, state, or response type.\n' +
    '3. When splitting documents, derive names from headings, API paths, or domain terms rather than sequence numbers or abstract words.\n' +
    'Avoid - numbered splits: API_1.md, API_2.md, API_3_1_*.md, 01_*.md, *_01.md\n' +
    'Avoid - overly abstract: COMMON.md, OVERVIEW.md, DETAILS.md, NOTES.md, MISC.md, PART_1.md, SECTION_1.md\n' +
    'Acceptable exceptions: README.md (directory index), files with clear HTTP status code semantics (e.g. RESPONSE_200_OK.md), ' +
    'files in the project validation.markdown.filename.allow allowlist.\n' +
    'Good renames: API_1.md → BIZ_RESERVATIONS_SCHEDULE.md, COMMON.md → BIZ_AUTH_ERROR_CONVENTIONS.md, OVERVIEW.md → REGISTRATION_HANDOFF_SUMMARY.md';
  walk(docs);
  const dirSiblingMap = new Map();
  for (const f of markdownFiles) {
    const dir = dirname(f);
    if (!dirSiblingMap.has(dir)) dirSiblingMap.set(dir, []);
    dirSiblingMap.get(dir).push(basename(f));
  }
  for (const file of markdownFiles) {
    const name = basename(file);
    const docsRel = rel(docs, file);
    const rootRel = rel(root, file);
    const isPlanInternalWorkspaceFile = /^docs\/(?:plan|archive\/plan)\/[a-z0-9]+(?:-[a-z0-9]+)*\/\.dotdotgod-plan\/(?:[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*|[0-9]{2}_[A-Z0-9]+(?:_[A-Z0-9]+)*)\.md$/.test(rootRel);
    if (docsRel && !docsRel.startsWith('..') && !isPlanInternalWorkspaceFile && !isUpperSnakeMarkdown(name)) addError(file, 'FILE_NAMING', `Markdown file must be UPPER_SNAKE_CASE.md or README.md: ${name}`, null, 'rename the markdown file to UPPER_SNAKE_CASE.md or README.md and update any links that reference it.');
    const content = readFileSync(file, 'utf8');
    fileCache.set(file, content);
    const docArea = docsRel?.split('/')[0];
    if (name !== 'README.md' && !isPlanInternalWorkspaceFile
        && isUpperSnakeMarkdown(name) && FILENAME_QUALITY_AREAS.has(docArea)) {
      const fp = validationPolicy.markdown?.filename ?? {};
      const allow = fp.allow ?? [];
      if (!allow.some((p) => matchPathPattern(rootRel, p)) && (fp.warnNumberedSeries ?? true)) {
        const siblings = dirSiblingMap.get(dirname(file)) ?? [];
        if (isNumberedSeriesFilename(name, siblings)) {
          const heading = extractFirstHeading(content);
          const suggestion = suggestFilenameFromHeading(heading);
          addWarning(file, 'FILE_NAMING_NUMBERED',
            `Numbered series filename: ${name}. Filenames are LLM context signals; use API path, domain, or subject instead of sequence numbers.`,
            { pattern: 'numbered-series', ...(heading ? { heading } : {}), ...(suggestion ? { suggestion } : {}), prompt: FILENAME_QUALITY_PROMPT }
          );
        }
      }
    }
    const budgetContent = stripTraceabilityLinksRegion(content);
    const lines = budgetContent.split('\n').length;
    const chars = budgetContent.length;
    const path = rootRel;
    const skipSizeChecks = isMarkdownSizeExcluded(path, memoryConfig);
    if (!skipSizeChecks && lines > maxLines) addError(file, 'FILE_TOO_LONG', `Markdown file has ${lines} lines excluding generated traceability links and traceability JSON blocks; max is ${maxLines}`, null, 'split the document into focused markdown files and update the nearest README.md index, or add a narrow validation.markdown.exclude entry if this file is intentionally oversized.', markdownSizePrompt(path));
    if (!skipSizeChecks && chars > maxChars) addError(file, 'FILE_TOO_LARGE', `Markdown file has ${chars} characters excluding generated traceability links and traceability JSON blocks; max is ${maxChars}`, null, 'split the document into focused markdown files and update the nearest README.md index, or add a narrow validation.markdown.exclude entry if this file is intentionally oversized.', markdownSizePrompt(path));
    if (requiresTraceability(rel(root, file), memoryConfig)) {
      const blocks = extractDotdotgodTraceabilityBlocks(content);
      if (blocks.length === 0) addError(file, 'TRACEABILITY_MISSING', `Behavior specs must include a fenced \`json dotdotgod\` traceability block as the final section.\nFix: add a final \`## Traceability\` section with the expected \`json dotdotgod\` block and point it at the relevant source, tests, related docs, and verification commands.\n\n${traceabilityExample()}`);
      else for (const error of validateTraceabilityPlacement(content, root, file)) errors.push(error);
      for (const error of validateTraceabilityLinksRegion(content, root, file)) errors.push(error);
      for (const block of blocks) {
        if (block.error) addError(file, 'TRACEABILITY_INVALID_JSON', `Invalid \`json dotdotgod\` block: ${block.error}\nFix: repair the fenced \`json dotdotgod\` block so it is valid JSON and still matches the expected schema.\n\n${traceabilityExample()}`, block.line);
        else {
          for (const error of validateTraceabilityBlock(block.data, root, file, block.line, memoryConfig)) errors.push(error);
          const synced = syncTraceabilityLinksInContent(content, block.data, root, file);
          if (synced.ok && synced.changed) addError(file, 'TRACEABILITY_LINKS_STALE', 'Generated traceability links or compact traceability JSON are missing or stale.', block.line, 'run `dotdotgod traceability links <root> --write` to synchronize the generated Markdown links and compact JSON block.');
        }
      }
    }
  }
  const byDir = new Map();
  for (const file of markdownFiles) byDir.set(dirname(file), [...(byDir.get(dirname(file)) ?? []), file]);
  for (const [dir, files] of byDir) {
    const dirRel = rel(root, dir);
    if (/^docs\/(?:plan|archive\/plan)\/[a-z0-9]+(?:-[a-z0-9]+)*\/\.dotdotgod-plan$/.test(dirRel)) continue;
    if (files.length > 1 && !files.some((file) => basename(file) === 'README.md')) addError(dir, 'MISSING_README', 'Directory with multiple markdown files must include README.md', null, 'add a README.md in this directory that indexes the important markdown files and their purpose.');
  }
  if (options.linkCheck) {
    for (const [file, content] of fileCache) {
      const fileDir = dirname(file);
      for (const { href, line } of extractLinks(content)) {
        const hashIndex = href.indexOf('#');
        const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
        const anchor = hashIndex === -1 ? '' : href.slice(hashIndex + 1);
        const target = pathPart ? resolve(fileDir, pathPart) : file;
        if (pathPart && !existsSync(target)) {
          addError(file, 'BROKEN_LINK', `Local link target does not exist: ${pathPart}`, line, 'update the link target to an existing local file, create the intended file, or remove the stale link.');
          continue;
        }
        if (anchor && extname(target) === '.md') {
          const targetContent = fileCache.get(target) ?? (existsSync(target) ? readFileSync(target, 'utf8') : '');
          if (targetContent && !extractAnchors(targetContent).has(decodeURIComponent(anchor))) addError(file, 'BROKEN_ANCHOR', `Local anchor target does not exist: ${href}`, line, 'update the fragment to a heading that exists in the target markdown file, or add the missing heading.');
        }
      }
    }
  }
  if (options.checkIndex) {
    const index = readIndex(root);
    if (!index) addError(cacheFile(root), 'INDEX_MISSING', 'Expected .dotdotgod index cache.', null, 'run `dotdotgod index <root>` to build the graph index.');
    else {
      const schemaVersion = index.schemaVersion ?? index.version ?? null;
      if (schemaVersion !== CACHE_VERSION) addError(cacheFile(root), 'INDEX_SCHEMA_MISMATCH', `Index schema is ${String(schemaVersion)}; expected ${CACHE_VERSION}.`, null, 'run `dotdotgod index <root>` to rebuild the cache with the current schema.');
      const indexed = new Map((index.files ?? []).map((file) => [file.path, file.sha256]));
      const indexableMarkdownPaths = new Set(collectIndexFiles(root, memoryConfig).map((file) => rel(root, file)).filter((path) => path.endsWith('.md')));
      for (const file of markdownFiles) {
        const path = rel(root, file);
        if (!indexableMarkdownPaths.has(path)) continue;
        const indexedHash = indexed.get(path);
        const currentHash = fingerprint(file);
        if (!indexedHash) addError(file, 'INDEX_MISSING_FILE', 'Markdown file is not present in the current graph index.', null, 'run `dotdotgod index <root>` to refresh the graph index.');
        else if (indexedHash !== currentHash) addError(file, 'INDEX_STALE', 'Markdown fingerprint differs from the current graph index.', null, 'run `dotdotgod index <root>` to refresh the graph index.');
      }
    }
  }
  if (options.includeLocalMemory) {
    for (const area of ['plan', 'archive/plan', 'archive/report']) {
      const areaRoot = join(docs, area);
      if (!existsSync(areaRoot)) continue;
      for (const entry of readdirSync(areaRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!isKebabCase(entry.name)) addError(join(areaRoot, entry.name), 'SLUG_NAMING', `Archive/plan/report slug must be kebab-case: ${entry.name}`, null, 'rename the task/report directory to kebab-case and update any README index links that reference it.');
        const readme = join(areaRoot, entry.name, 'README.md');
        if (!existsSync(readme)) addError(readme, 'MISSING_README', `Expected README.md in docs/${area}/${entry.name}/`, null, 'add a README.md that summarizes the task/report and links any supporting files.');
      }
    }
  }
  const gitignore = join(root, '.gitignore');
  if (!existsSync(gitignore)) addError(gitignore, 'MISSING_GITIGNORE', 'Expected .gitignore', null, 'create .gitignore and include docs/plan, docs/archive, and .dotdotgod entries.');
  else {
    const content = readFileSync(gitignore, 'utf8').split('\n').map((line) => line.trim());
    for (const required of ['docs/plan', 'docs/archive', CACHE_DIR]) if (!content.includes(required)) addError(gitignore, 'MISSING_GITIGNORE_ENTRY', `Expected .gitignore entry: ${required}`, null, `add ${required} to .gitignore so local plans, archives, and cache files stay untracked.`);
  }
  if (options.json) console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2));
  else {
    for (const w of warnings) {
      console.log(`⚠ ${w.file} [${w.code}] ${w.message}`);
      if (w.heading) console.log(`  Heading: "${w.heading}"`);
      if (w.suggestion) console.log(`  Suggestion: rename to ${w.suggestion} and update links`);
      if (w.prompt) console.log(`  Prompt: ${w.prompt}`);
    }
    if (errors.length === 0) {
      const warnNote = warnings.length > 0 ? `, ${warnings.length} warning(s)` : '';
      console.log(`✅ docs validation passed (${markdownFiles.length} markdown files${warnNote})`);
    } else {
      for (const error of errors) console.log(`${error.line ? `${error.file}:${error.line}` : error.file} [${error.code}] ${error.message}${error.prompt ? `\nPrompt: ${error.prompt}` : ''}`);
      console.log(`\n❌ ${errors.length} docs validation error(s)`);
    }
  }
  process.exit(errors.length === 0 ? 0 : 1);
}
