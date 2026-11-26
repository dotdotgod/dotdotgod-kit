import { isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { adapterError } from './errors.mjs';

const MAX_BYTES = 1024 * 1024;
export const PROJECT_PLUGIN_ENTRY = './.dotdotgod/adapters/opencode';
const LEGACY_PLUGIN = '@dotdotgod/opencode';

function parseError(path, source, offset) {
  const lines = source.slice(0, offset).split(/\r\n|\r|\n/u);
  const error = adapterError('CONFIG_PARSE_ERROR', { target: path });
  error.details.detail = `${error.message} (line ${lines.length}, column ${lines.at(-1).length + 1})`;
  return error;
}

function parse(source, path) {
  const tokens = [];
  const changes = [];
  let depth = 0;
  const word = /[^\t\r\n {},:\[\]"/]+/uy;
  // Keep parser offsets aligned with the original, including comments and BOM.
  let i = source.startsWith('\uFEFF') ? 1 : 0;
  if (i) changes.push([0, 1]);
  while (i < source.length) {
    const start = i;
    const char = source[i++];
    if (' \t\r\n'.includes(char)) continue;
    if (char === '/' && source[i] === '/') {
      while (i < source.length && source[i] !== '\r' && source[i] !== '\n') i++;
      changes.push([start, i]);
      continue;
    }
    if (char === '/' && source[i] === '*') {
      const end = source.indexOf('*/', i + 1);
      if (end < 0) throw parseError(path, source, start);
      i = end + 2;
      changes.push([start, i]);
      continue;
    }
    if (char === '"') {
      // Backslashes consume exactly one code unit, so even/odd runs terminate correctly.
      while (i < source.length) {
        const special = source[i++];
        if (special === '"') break;
        if (special === '\\') i++;
      }
    } else if (!'{},:[]/'.includes(char)) {
      word.lastIndex = start;
      i = start + word.exec(source)[0].length;
    }
    if (char === '}' || char === ']') depth--;
    const previous = tokens.at(-1);
    if ((char === '}' || char === ']') && previous?.char === ',' && !'{[:,'.includes(tokens.at(-2)?.char ?? '')) {
      changes.push([previous.start, previous.end]);
    }
    tokens.push({ char, start, end: i, depth });
    if (char === '{' || char === '[') depth++;
  }
  let value;
  try {
    let offset = 0;
    const parts = [];
    for (const [start, end] of changes.sort((a, b) => a[0] - b[0])) {
      parts.push(source.slice(offset, start), source.slice(start, end).replace(/[^\r\n]/g, ' '));
      offset = end;
    }
    parts.push(source.slice(offset));
    value = JSON.parse(parts.join(''));
  } catch (error) {
    const position = / at position (\d+)(?: \(line \d+ column \d+\))?$/u.exec(error.message);
    throw parseError(path, source, position ? Number(position[1]) : source.length);
  }
  if (tokens[0]?.char !== '{') throw parseError(path, source, tokens[0]?.start ?? 0);
  const keys = tokens.flatMap((token, index) => token.depth === 1 && token.char === '"' && tokens[index + 1]?.char === ':'
    && JSON.parse(source.slice(token.start, token.end)) === 'plugins' ? [index] : []);
  if (keys.length > 1 || (keys.length && !Array.isArray(value.plugins))) {
    throw adapterError('CONFIG_KEY_CONFLICT', { target: path });
  }
  return { tokens, value, arrayStart: keys.length ? keys[0] + 2 : -1 };
}

export function readJsoncConfig(fs, path) {
  const snapshot = fs.read(path, { maxBytes: MAX_BYTES });
  let source;
  try {
    source = snapshot === null ? '{\n}\n' : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(snapshot);
  } catch {
    throw parseError(path, '', 0);
  }
  const parsed = parse(source, path);
  const plugins = parsed.value.plugins ?? [];
  const legacy = plugins.some((item) => (Array.isArray(item) ? item[0] : item) === LEGACY_PLUGIN);
  return { path, snapshot, source, ...parsed, plugins, legacy };
}

function insert(source, tokens, start, end, text) {
  const first = tokens[start + 1];
  const last = tokens[end - (tokens[end - 1].char === ',' ? 2 : 1)];
  const gap = source.slice(tokens[start].end, first.start);
  const eol = gap.match(/\r\n|\r|\n/u)?.[0];
  const indent = source.slice(0, first.start).match(/(?:^|\r|\n)([ \t]*)$/u)?.[1];
  const padding = eol ? eol + (start + 1 === end ? `${indent ?? ''}  ` : indent ?? '  ') : (gap ? ' ' : '');
  return source.slice(0, last.end) + (last !== tokens[start] ? ',' : '') + padding + text + source.slice(last.end);
}

function remove(source, tokens, start, end, index) {
  const commas = [];
  for (let i = start + 1; i < end; i++) {
    if (tokens[i].depth === 2 && tokens[i].char === ',') commas.push(i);
  }
  const before = commas[index - 1];
  const after = commas[index];
  const item = tokens[(before ?? start) + 1];
  const comma = tokens[before ?? after];
  if (!comma) return source.slice(0, item.start) + source.slice(item.end);
  if (before === undefined) return source.slice(0, item.start) + source.slice(item.end, comma.start) + source.slice(comma.end);
  const gap = source.slice(comma.end, item.start);
  return source.slice(0, comma.start) + (gap.trim() ? gap : '') + source.slice(item.end);
}

export function planJsoncEdit(config, { scope, entry, operation }) {
  const { path, snapshot, source, tokens, value, plugins, legacy, arrayStart } = config;
  if (scope === 'project' ? entry !== PROJECT_PLUGIN_ENTRY : !isAbsolute(entry)) {
    throw adapterError('PATH_OUTSIDE_ROOT', { target: path });
  }
  if (legacy) throw adapterError('LEGACY_COEXIST_CONFLICT', { target: path });
  const matches = plugins.flatMap((item, i) => item === entry ? [i] : []);
  if (matches.length > 1 || plugins.some((item) => Array.isArray(item) && item[0] === entry)) {
    throw adapterError('CONFIG_KEY_CONFLICT', { target: path });
  }
  const present = matches.length === 1;
  if (present === (operation === 'install')) return { path, snapshot, bytes: null, present };
  const arrayEnd = tokens.findIndex((token, i) => i > arrayStart && token.depth === 1 && token.char === ']');
  const adding = operation === 'install';
  const draft = !adding ? remove(source, tokens, arrayStart, arrayEnd, matches[0])
    : arrayStart < 0 ? insert(source, tokens, 0, tokens.length - 1, `"plugins": [${JSON.stringify(entry)}]`)
      : insert(source, tokens, arrayStart, arrayEnd, JSON.stringify(entry));
  const expected = adding ? [...plugins, entry] : plugins.filter((_, i) => i !== matches[0]);
  if (!isDeepStrictEqual(parse(draft, path).value, { ...value, plugins: expected })) {
    throw parseError(path, source, 0);
  }
  const bytes = Buffer.from(draft);
  if (bytes.length > MAX_BYTES) throw adapterError('IO_ERROR', { target: path });
  return { path, snapshot, bytes, present };
}

export function applyJsoncEdit(fs, { path, snapshot, bytes }) {
  if (bytes !== null) fs.writeAtomic(path, bytes, snapshot, { maxBytes: MAX_BYTES });
}
