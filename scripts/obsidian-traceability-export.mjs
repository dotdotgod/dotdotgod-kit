import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { exportTraceability } from '../packages/cli/src/graph-view/traceability.mjs';
export { exportTraceability };
if (process.argv[1] === import.meta.filename) {
  const output = resolve(process.argv[3] ?? '.obsidian-dev/traceability.json');
  const payload = await exportTraceability(resolve(process.argv[2] ?? '.'));
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ output, edges: payload.edges.length, relations: payload.types.length }));
}
