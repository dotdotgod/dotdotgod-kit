import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { isSecretLikePathPattern, matchPathPattern } from '../memory/config.mjs';

const MAX_CHUNK_CHARS = 1600;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.dotdotgod']);

export function textFingerprint(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function collectDocumentationMarkdown(root, exclude = ['docs/plan', 'docs/archive'], documentationRoot = 'docs') {
  const docsRoot = join(root, documentationRoot);
  const files = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (isSecretLikePathPattern(path) || exclude.some((pattern) => matchPathPattern(path, pattern) || path === pattern || path.startsWith(`${pattern}/`))) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(absolute);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(path);
    }
  };
  walk(docsRoot);
  return files.sort();
}

function splitSection(text, maxChars = MAX_CHUNK_CHARS) {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current.trim());
      current = '';
    }
    if (paragraph.length > maxChars) {
      for (let offset = 0; offset < paragraph.length; offset += maxChars) chunks.push(paragraph.slice(offset, offset + maxChars).trim());
    } else current += `${current ? '\n\n' : ''}${paragraph}`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export function chunkMarkdown(path, content, maxChars = MAX_CHUNK_CHARS) {
  const lines = content.split('\n');
  const sections = [];
  let headings = [];
  let body = [];
  const flush = () => {
    const text = body.join('\n').trim();
    if (!text && headings.length === 0) return;
    const heading = headings.length > 0 ? headings.join(' > ') : path;
    const pieces = splitSection(text || heading, maxChars);
    pieces.forEach((piece, index) => {
      const passage = `Path: ${path}\nSection: ${heading}\n\n${piece}`;
      const fingerprint = textFingerprint(passage);
      sections.push({ id: `${path}#${fingerprint.slice(0, 16)}`, path, heading, part: index + 1, text: piece, passage, fingerprint });
    });
  };
  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) {
      body.push(line);
      continue;
    }
    flush();
    body = [];
    const level = match[1].length;
    headings = [...headings.slice(0, level - 1), match[2]];
  }
  flush();
  return sections;
}

export function collectDocumentationChunks(root, exclude, documentationRoot = 'docs') {
  return collectDocumentationMarkdown(root, exclude, documentationRoot).flatMap((path) => {
    const content = readFileSync(join(root, path), 'utf8');
    return chunkMarkdown(path, content);
  });
}
