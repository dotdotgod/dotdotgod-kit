#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
const DEFAULT_OUTPUT = 'docs/post/document-directory-as-table-of-contents/thumbnail.png';

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

function buildSvg({ title, subtitle, label }) {
  const titleLines = title.split('|').map((line) => line.trim()).filter(Boolean).slice(0, 3);
  const titleMarkup = titleLines
    .map((line, index) => `<text x="714" y="${244 + index * 72}" fill="#f7faf8" font-family="Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif" font-size="58" font-weight="760" letter-spacing="-1.5">${escapeXml(line)}</text>`)
    .join('\n');

  const tree = [
    terminalLine(178, 0, '', 'docs/', '#f7faf8', 700),
    terminalLine(216, 1, '├──', 'README.md', '#aab4ae'),
    terminalLine(254, 1, '├──', 'spec/', '#56d986', 700),
    terminalLine(292, 2, '│   ├──', 'PROJECT_INITIALIZER.md', '#c7d0cb'),
    terminalLine(330, 2, '│   └──', 'cli/', '#63a9ff', 700),
    terminalLine(368, 3, '│       ├──', 'README.md', '#aab4ae'),
    terminalLine(406, 3, '│       └──', 'CONFIG_COMMAND.md', '#f5c451', 700),
    terminalLine(444, 1, '├──', 'arch/', '#b995ff', 700),
    terminalLine(482, 2, '│   └──', 'DOCS_STRUCTURE.md', '#c7d0cb'),
    terminalLine(520, 1, '└──', 'test/', '#ff817a', 700),
    terminalLine(558, 2, '    └──', 'CLI_INTERFACE.md', '#c7d0cb'),
  ].join('\n');

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
  <text x="96" y="146" fill="#56d986" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="16">$ docs --table-of-contents</text>
  ${tree}

  <rect x="714" y="96" width="92" height="5" rx="2.5" fill="#56d986"/>
  <text x="714" y="146" fill="#8f9b94" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">${escapeXml(label)}</text>
  ${titleMarkup}
  <text x="714" y="${270 + titleLines.length * 72}" fill="#aeb8b2" font-family="Apple SD Gothic Neo, Noto Sans CJK KR, sans-serif" font-size="24" font-weight="500">${escapeXml(subtitle)}</text>

  <line x1="714" y1="514" x2="1132" y2="514" stroke="#2b342f" stroke-width="1"/>
  <text x="714" y="552" fill="#56d986" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">Directory</text>
  <text x="817" y="552" fill="#65706a" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">→</text>
  <text x="850" y="552" fill="#63a9ff" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">README</text>
  <text x="940" y="552" fill="#65706a" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">→</text>
  <text x="973" y="552" fill="#f5c451" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="17">Document</text>
  <text x="1132" y="592" fill="#65706a" text-anchor="end" font-family="SFMono-Regular, Menlo, Consolas, monospace" font-size="15">dotdotgod</text>
</svg>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`Usage: node scripts/generate-terminal-thumbnail.mjs [options]\n\nOptions:\n  --output <path>    PNG output path\n  --svg <path>       Also save the source SVG\n  --title <text>     Use | to split title lines\n  --subtitle <text>  Supporting copy\n  --label <text>     Small terminal-style label`);
    return;
  }

  const output = resolve(readOption(args, '--output', DEFAULT_OUTPUT));
  const svgOutput = readOption(args, '--svg', null);
  const svg = buildSvg({
    title: readOption(args, '--title', '문서 구조는|AI의 목차다'),
    subtitle: readOption(args, '--subtitle', '필요한 문서로 이동하는 가장 짧은 경로'),
    label: readOption(args, '--label', 'PROJECT MEMORY / 01'),
  });

  await mkdir(dirname(output), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toFile(output);

  if (svgOutput) {
    const svgPath = resolve(svgOutput);
    await mkdir(dirname(svgPath), { recursive: true });
    await writeFile(svgPath, svg, 'utf8');
    console.log(`SVG: ${svgPath}`);
  }

  console.log(`PNG: ${output} (${WIDTH}x${HEIGHT})`);
}

main().catch((error) => {
  console.error(`Failed to generate terminal thumbnail: ${error.message}`);
  process.exitCode = 1;
});
