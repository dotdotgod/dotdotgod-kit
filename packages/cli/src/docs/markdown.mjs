export function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isUpperSnakeMarkdown(value) {
  return value === 'README.md' || /^[A-Z0-9][A-Z0-9_]*\.md$/.test(value);
}

export function removeCodeBlocks(content) {
  return content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, '');
}

export function extractLinks(content) {
  const links = [];
  const lines = removeCodeBlocks(content).split('\n');
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  lines.forEach((lineText, index) => {
    let match;
    while ((match = re.exec(lineText)) !== null) {
      const href = match[1].trim();
      if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;
      links.push({ href, line: index + 1 });
    }
  });
  return links;
}

export function headingToAnchor(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function isNumberedSeriesFilename(name, siblingNames) {
  const stem = name.replace(/\.md$/, '');
  const parts = stem.split('_');
  if (parts.length < 2) return false;
  const lastSeg = parts[parts.length - 1];
  const firstSeg = parts[0];
  if (/^\d+$/.test(lastSeg)) {
    const prefix = parts.slice(0, -1).join('_');
    if (siblingNames.some(sib => {
      if (sib === name) return false;
      const s = sib.replace(/\.md$/, '').split('_');
      return s.length >= 2 && /^\d+$/.test(s[s.length - 1]) && s.slice(0, -1).join('_') === prefix;
    })) return true;
  }
  if (/^\d+$/.test(firstSeg)) {
    const suffix = parts.slice(1).join('_');
    if (siblingNames.some(sib => {
      if (sib === name) return false;
      const s = sib.replace(/\.md$/, '').split('_');
      return s.length >= 2 && /^\d+$/.test(s[0]) && s.slice(1).join('_') === suffix;
    })) return true;
  }
  return false;
}

export function extractFirstHeading(content) {
  const match = content.match(/^#+\s+(.+)$/m);
  return match ? match[1].replace(/[`*_]/g, '').trim() : undefined;
}

export function suggestFilenameFromHeading(heading) {
  if (!heading) return undefined;
  const stem = heading
    .replace(/[^A-Za-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
  return stem.length >= 3 ? `${stem}.md` : undefined;
}

export function extractAnchors(content) {
  const anchors = new Set();
  const seen = new Map();
  const re = /^#{1,6}\s+(.+)$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    const base = headingToAnchor(match[1]);
    if (!base) continue;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

