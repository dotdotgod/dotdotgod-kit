import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { extractSymbols } from '../src/symbols/parser.mjs';
import { buildOutlines, outlineStatus } from '../src/symbols/store.mjs';
import { patchCsharpGrammar } from '../src/symbols/csharp-contextual-grammar.mjs';

const source = `using System.Text.Json.Nodes;
namespace Example;
/** λ modern syntax. */
public sealed class Catalog(int capacity)
{
    public required string Name { get; init; }
    private int[] values = [];
    /** Merge values. */
    public int[] Merge(int[] other)
    {
        values = [capacity, ..other];
        return values is [var first, ..] ? [first] : [];
    }
    public void Normalize(JsonObject obj)
    {
        if (obj["required"] is JsonArray required)
            for (var i = 0; i < required.Count; i++)
                if (required[i] is JsonValue value && value.TryGetValue<string>(out var key))
                    required[i] = key;
    }
}
`.replaceAll('\n', '\r\n');

test('C# contextual-keyword patch changes only the pinned identifier choice', () => {
  const before = "prefix\n    _reserved_identifier: _ => choice(\n      'alias',\n    ),\nsuffix";
  assert.equal(patchCsharpGrammar(before), before.replace("      'alias',", "      'required',\n      'alias',"));
  assert.throws(() => patchCsharpGrammar('unrecognized grammar'), /Unsupported C# grammar source/);
});

test('C# collection expressions and contextual required preserve real declaration metadata', async () => {
  const result = await extractSymbols('Catalog.cs', source, 'c-sharp');
  assert.equal(result.status, 'parsed');
  assert.deepEqual(result.symbols.map(symbol => symbol.qualifiedName), ['Catalog', 'Catalog.Merge', 'Catalog.Normalize']);
  const catalog = result.symbols[0];
  assert.match(catalog.signature, /class Catalog\(int capacity\)/);
  assert.match(catalog.documentation, /λ modern syntax/);
  const merge = result.symbols[1];
  assert.equal(merge.ownerId, catalog.id);
  assert.match(merge.documentation, /Merge values/);
  assert.equal(merge.declarationStartLine, 9);
  assert.equal(merge.endLine, 13);
  for (const symbol of result.symbols) {
    assert.equal(source.slice(symbol.declarationStartOffset, symbol.bodyStartOffset ?? symbol.declarationEndOffset).trim(), symbol.signature);
    assert.ok(!symbol.signature.includes('required[i]') && !symbol.signature.includes('values ='));
  }
});

test('C# grammar still reports malformed collections, modifiers, patterns and declarations', async () => {
  for (const invalid of [
    'class X { int[] items = [; }',
    'class X { int[] F() => [1,,2]; }',
    'class X { required ; }',
    'class X { bool F(object x) => x is int required && ; }',
    'class X { void F( { }',
  ]) assert.equal((await extractSymbols('Invalid.cs', invalid, 'c-sharp')).status, 'partial', invalid);
});

test('modern C# outlines index and reuse without exclusions or source rewriting', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-csharp-'));
  try {
    mkdirSync(join(root, 'src'));
    const path = join(root, 'src/Catalog.cs');
    writeFileSync(path, source);
    const index = await buildOutlines(root);
    assert.equal(index.files.length, 1);
    assert.equal(index.files[0].status, 'parsed');
    assert.equal(index.files[0].symbols.length, 3);
    assert.equal(outlineStatus(root).ok, true);
    assert.equal((await buildOutlines(root)).refresh.reused, 1);
    assert.equal(readFileSync(path, 'utf8'), source);
    writeFileSync(path, 'class X { int[] values = [; }');
    assert.equal((await buildOutlines(root)).files[0].status, 'partial');
    assert.equal(outlineStatus(root).reason, 'extraction-incomplete');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
