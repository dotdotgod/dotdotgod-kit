import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function markdown(path) {
  const source = readFileSync(path, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const description = match?.[1].match(/^description: (.+)$/m)?.[1];
  return { description, content: match ? source.slice(match[0].length).trim() : source.trim() };
}

export async function registerResources(ctx) {
  const skills = readdirSync(new URL('../skills/', import.meta.url)).map(id => {
    const path = fileURLToPath(new URL(`../skills/${id}/SKILL.md`, import.meta.url));
    return { id, name: id, path, ...markdown(path) };
  });
  await ctx.skill.transform(editor => {
    for (const skill of skills) if (!editor.get(skill.id)) editor.add(skill);
  });
  const commands = ['load', 'init', 'impact'].map(id => ({ id, ...markdown(new URL(`../commands/${id}.md`, import.meta.url)) }));
  await ctx.command.transform(editor => {
    for (const command of commands) editor.add({
      name: `dd:${command.id}`, description: command.description,
      execute: async ({ sessionID, prompt, delivery }) => {
        await ctx.session.prompt({ ...prompt, sessionID, delivery, text: command.content.replaceAll('$ARGUMENTS', () => prompt.text ?? '') });
      },
    });
  });
}
