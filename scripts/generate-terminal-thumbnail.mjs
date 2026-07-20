#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const DEFAULT_PRESET = 'toc';

const PRESETS = {
  toc: {
    output: 'docs/post/document-directory-as-table-of-contents/thumbnail.png',
    title: '문서 구조는|AI의 목차다',
    subtitle: '필요한 문서로 이동하는 가장 짧은 경로',
    label: 'PROJECT MEMORY / 01',
    command: '$ docs --table-of-contents',
    lines: [
      [178, 0, '', 'docs/', '#f7faf8', 700],
      [216, 1, '├──', 'README.md', '#aab4ae'],
      [254, 1, '├──', 'spec/', '#56d986', 700],
      [292, 2, '│   ├──', 'PROJECT_INITIALIZER.md', '#c7d0cb'],
      [330, 2, '│   └──', 'cli/', '#63a9ff', 700],
      [368, 3, '│       ├──', 'README.md', '#aab4ae'],
      [406, 3, '│       └──', 'CONFIG_COMMAND.md', '#f5c451', 700],
      [444, 1, '├──', 'arch/', '#b995ff', 700],
      [482, 2, '│   └──', 'DOCS_STRUCTURE.md', '#c7d0cb'],
      [520, 1, '└──', 'test/', '#ff817a', 700],
      [558, 2, '    └──', 'CLI_INTERFACE.md', '#c7d0cb'],
    ],
    footer: [
      ['Directory', '#56d986'],
      ['README', '#63a9ff'],
      ['Document', '#f5c451'],
    ],
  },
  load: {
    output: 'docs/post/how-load-keeps-ai-context-fresh/thumbnail.png',
    title: '모든 문서를|읽히지 않고도|최신 컨텍스트',
    subtitle: '최신성·범위·탐색 순서를 함께 관리한다',
    label: 'PROJECT MEMORY / LOAD',
    command: '$ dotdotgod load-snapshot . --json',
    lines: [
      [202, 0, '', 'current docs', '#f7faf8', 700],
      [252, 1, '└─', 'fresh index', '#56d986', 700],
      [302, 2, '└─', 'bounded snapshot', '#63a9ff', 700],
      [352, 3, '└─', 'README routing', '#f5c451', 700],
      [402, 4, '└─', 'task context', '#b995ff', 700],
      [482, 0, '', 'archive bodies: excluded', '#7f8b84'],
      [520, 0, '', 'cache status: fresh', '#56d986'],
    ],
    footer: [
      ['Fresh', '#56d986'],
      ['Bounded', '#63a9ff'],
      ['Relevant', '#f5c451'],
    ],
  },
  'maintain-toc': {
    output: 'docs/post/how-dotdotgod-maintains-document-toc/thumbnail.png',
    title: '문서 목차는|작업 흐름에서|유지된다',
    subtitle: '만들고·검증하고·연결하고·분리한다',
    label: 'PROJECT MEMORY / TOC',
    command: '$ dotdotgod validate . --check-index',
    lines: [
      [196, 0, '', 'docs/', '#f7faf8', 700],
      [244, 1, '├─', 'initialize structure', '#56d986', 700],
      [292, 1, '├─', 'update README indexes', '#63a9ff', 700],
      [340, 1, '├─', 'validate names + links', '#f5c451', 700],
      [388, 1, '├─', 'trace spec → code → test', '#b995ff', 700],
      [436, 1, '└─', 'archive completed plans', '#ff817a', 700],
      [510, 0, '', 'docs status: current', '#56d986'],
    ],
    footer: [
      ['Create', '#56d986'],
      ['Validate', '#63a9ff'],
      ['Maintain', '#f5c451'],
    ],
  },
  impact: {
    output: 'docs/post/how-graph-impact-finds-related-docs/thumbnail.png',
    title: '변경 파일은|역방향 목차의|시작점이다',
    subtitle: '함께 확인할 스펙과 테스트를 찾는다',
    label: 'PROJECT MEMORY / IMPACT',
    command: '$ dotdotgod graph impact . --changed ...',
    lines: [
      [206, 0, '', 'changed file', '#f7faf8', 700],
      [264, 1, '├─', 'spec', '#56d986', 700],
      [322, 1, '├─', 'architecture', '#b995ff', 700],
      [380, 1, '├─', 'test', '#ff817a', 700],
      [438, 1, '└─', 'verification command', '#f5c451', 700],
      [510, 0, '', 'recommended: review → test → validate', '#7f8b84'],
    ],
    footer: [
      ['Change', '#56d986'],
      ['Impact', '#63a9ff'],
      ['Review', '#f5c451'],
    ],
  },
};

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function terminalLine(y, indent, branch, name, color, weight = 500) {
  const x = 104 + indent * 30;
  const branchText = branch ? `<tspan fill="#65706a">${escapeXml(branch)} </tspan>` : '';
  return `<text x="${x}" y="${y}" fill="${color}" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="20" font-weight="${weight}">${branchText}${escapeXml(name)}</text>`;
}

function footerMarkup(items) {
  const positions = [714, 850, 1010];
  return items.map(([text, color], index) => {
    const arrow = index === 0 ? '' : `<text x="${positions[index] - 33}" y="552" fill="#65706a" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">→</text>`;
    return `${arrow}<text x="${positions[index]}" y="552" fill="${color}" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">${escapeXml(text)}</text>`;
  }).join('\n');
}

function buildSvg({ title, subtitle, label, preset }) {
  const titleLines = title.split('|').map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const titleMarkup = titleLines
    .map((line, index) => `<text x="714" y="${244 + index * 72}" fill="#f7faf8" font-family="Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif" font-size="58" font-weight="760" letter-spacing="-1.5">${escapeXml(line)}</text>`)
    .join('\n');
  const tree = preset.lines.map((line) => terminalLine(...line)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(title.replaceAll('|', ' '))}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#080b0a"/>
  <circle cx="1140" cy="62" r="230" fill="#56d986" opacity="0.07"/>
  <circle cx="678" cy="620" r="170" fill="#63a9ff" opacity="0.045"/>

  <rect x="58" y="48" width="588" height="534" rx="14" fill="#111613" stroke="#344139" stroke-width="2"/>
  <rect x="58" y="48" width="588" height="70" rx="14" fill="#171d19"/>
  <rect x="58" y="103" width="588" height="15" fill="#171d19"/>
  <circle cx="92" cy="83" r="7" fill="#ff817a"/>
  <circle cx="116" cy="83" r="7" fill="#f5c451"/>
  <circle cx="140" cy="83" r="7" fill="#56d986"/>
  <text x="174" y="90" fill="#7f8b84" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="15">~/dotdotgod</text>
  <text x="96" y="146" fill="#56d986" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="16">${escapeXml(preset.command)}</text>
  ${tree}

  <rect x="714" y="96" width="92" height="5" rx="2.5" fill="#56d986"/>
  <text x="714" y="146" fill="#8f9b94" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">${escapeXml(label)}</text>
  ${titleMarkup}
  <text x="714" y="${270 + titleLines.length * 72}" fill="#aeb8b2" font-family="Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif" font-size="22" font-weight="500">${escapeXml(subtitle)}</text>

  <line x1="714" y1="514" x2="1132" y2="514" stroke="#2b342f" stroke-width="1"/>
  ${footerMarkup(preset.footer)}
  <text x="1132" y="592" fill="#65706a" text-anchor="end" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="15">dotdotgod</text>
</svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`Usage: node scripts/generate-terminal-thumbnail.mjs [options]\n\nOptions:\n  --preset <name>   Visual preset: toc, maintain-toc, load, impact\n  --output <path>   PNG output path\n  --svg <path>      Also save the source SVG\n  --title <text>    Use | to split title lines\n  --subtitle <text> Supporting copy\n  --label <text>    Small terminal-style label`);
    return;
  }

  const presetName = readOption(args, '--preset', DEFAULT_PRESET);
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset: ${presetName}. Use one of: ${Object.keys(PRESETS).join(', ')}`);

  const output = resolve(readOption(args, '--output', preset.output));
  const svgOutput = readOption(args, '--svg', null);
  const svg = buildSvg({
    title: readOption(args, '--title', preset.title),
    subtitle: readOption(args, '--subtitle', preset.subtitle),
    label: readOption(args, '--label', preset.label),
    preset,
  });

  await mkdir(dirname(output), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toFile(output);

  if (svgOutput) {
    const svgPath = resolve(svgOutput);
    await mkdir(dirname(svgPath), { recursive: true });
    await writeFile(svgPath, svg, 'utf8');
    console.log(`SVG: ${svgPath}`);
  }

  console.log(`PNG: ${output} (${WIDTH}x${HEIGHT}, preset=${presetName})`);
}

main().catch((error) => {
  console.error(`Failed to generate terminal thumbnail: ${error.message}`);
  process.exitCode = 1;
});
