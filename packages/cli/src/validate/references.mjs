import { statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { findTraceabilityLinksRegion } from '../docs/traceability.mjs';
import { resolveMemoryArea } from '../memory/config.mjs';

const blank = (text) => text.replace(/[^\n\r]/g, ' ');
const unescape = (text) => text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
const labelKey = (text) => unescape(text).trim().replace(/\s+/g, ' ').toLowerCase();
const escaped = (text, index) => {
  let count = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count % 2 === 1;
};

function visibleContent(content) {
  const region = findTraceabilityLinksRegion(content);
  let text = region.status === 'present'
    ? content.slice(0, region.start) + blank(content.slice(region.start, region.end)) + content.slice(region.end)
    : content;
  const tokens = /<!--[\s\S]*?(?:-->|(?![\s\S]))|^ {0,3}(`{3,}|~{3,})[^\n]*/gm;
  let token;
  while ((token = tokens.exec(text))) {
    let end = tokens.lastIndex;
    if (token[1]) {
      const closing = new RegExp(`^ {0,3}${token[1][0]}{${token[1].length},}[ \\t]*\\r?$`, 'gm');
      closing.lastIndex = end + 1;
      end = closing.exec(text) ? closing.lastIndex : text.length;
    }
    text = text.slice(0, token.index) + blank(text.slice(token.index, end)) + text.slice(end);
    tokens.lastIndex = end;
  }
  return text;
}

// Read Markdown destinations with balanced parentheses and optional angle brackets.
function destination(text, start) {
  let i = start;
  while (/\s/.test(text[i] ?? '') && i < text.length) i++;
  const begin = i;
  if (text[i] === '<') {
    for (++i; i < text.length; i++) {
      if (text[i] === '>' && !escaped(text, i)) return { href: text.slice(begin + 1, i), end: i + 1 };
      if (text[i] === '\n') return null;
    }
    return null;
  }
  let depth = 0;
  for (; i < text.length; i++) {
    if (escaped(text, i)) continue;
    if (/\s/.test(text[i]) || (text[i] === ')' && depth === 0)) break;
    if (text[i] === '(') depth++;
    if (text[i] === ')') depth--;
  }
  return depth === 0 && i > begin ? { href: text.slice(begin, i), end: i } : null;
}

export function extractMemoryReferences(content) {
  let text = visibleContent(content);
  const references = [];
  const code = [];
  const lineAt = (offset) => content.slice(0, offset).split('\n').length;
  // Mask code before link parsing so literal Markdown inside code is not a link.
  text = text.replace(/(`+)([\s\S]*?)\1(?!`)/g, (match, ticks, value, offset) => {
    if (escaped(text, offset)) return match;
    code.push({ href: value.trim(), offset, end: offset + match.length, kind: 'inline-code', line: lineAt(offset) });
    return blank(match);
  });
  const definitions = new Map();
  text = text.replace(/^ {0,3}\[([^\]\n]+)\]:[ \t]*(.*)$/gm, (match, label, value) => {
    const parsed = destination(value, 0);
    if (parsed && !definitions.has(labelKey(label))) definitions.set(labelKey(label), parsed.href);
    return blank(match);
  });
  const linkRanges = [];
  const labels = /!?\[((?:\\.|[^\]\\\n])*)\]/g;
  let match;
  while ((match = labels.exec(text))) {
    if (escaped(text, match.index) || (match[0][0] === '!' && escaped(text, match.index + 1))) continue;
    const after = labels.lastIndex;
    let end = after;
    let href;
    if (text[after] === '(') {
      const parsed = destination(text, after + 1);
      if (parsed) {
        const tail = text.slice(parsed.end).match(/^\s*(?:(?:"[^"\n]*"|'[^'\n]*'|\([^\n)]*\))\s*)?\)/);
        if (tail) { href = parsed.href; end = parsed.end + tail[0].length; }
      }
    } else {
      const suffix = text.slice(after).match(/^\[([^\]\n]*)\]/);
      const label = suffix?.[1] || match[1];
      href = definitions.get(labelKey(label));
      if (suffix) end += suffix[0].length;
    }
    if (href !== undefined) {
      references.push({ href: unescape(href), kind: 'markdown-link', line: lineAt(match.index) });
      linkRanges.push([match.index, end]);
      labels.lastIndex = end;
    }
  }
  for (const item of code) {
    if (linkRanges.some(([start, end]) => item.offset >= start && item.end <= end)) continue;
    const path = item.href.split('#')[0];
    // Policy A: syntax-only examples are not concrete file references.
    if ((!path.includes('/') && !/\.[\w-]+$/.test(path)) || /[\s*?<>\[\]{}]/.test(path) || path.endsWith('/')) continue;
    references.push({ href: item.href, kind: item.kind, line: item.line });
  }
  return references;
}

export function sharedLocalReferences(content, root, file, config) {
  const source = resolveMemoryArea(relative(root, file).split('\\').join('/'), config);
  if (source?.scope !== 'shared') return [];
  const errors = [];
  for (const item of extractMemoryReferences(content)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(item.href)) continue;
    let path;
    try { path = decodeURIComponent(item.href.split(/[?#]/)[0]); } catch { continue; }
    if (!path) continue;
    const base = item.kind === 'markdown-link' || /^\.\.?\//.test(path) ? dirname(file) : root;
    const target = relative(root, resolve(base, path)).split('\\').join('/');
    if (target === '..' || target.startsWith('../')) continue;
    if (item.kind === 'inline-code') {
      const configuredDirectory = (config.areas ?? []).some((area) => (area.paths ?? []).some((pattern) => pattern === `${target}/**`));
      let directory = configuredDirectory;
      try { directory ||= statSync(resolve(root, target)).isDirectory(); } catch { /* Missing concrete paths still receive scope checks. */ }
      if (directory) continue;
    }
    const area = resolveMemoryArea(target, config);
    if (area?.scope === 'local') errors.push({ ...item, target, sourceArea: source.id, targetArea: area.id });
  }
  return errors;
}
