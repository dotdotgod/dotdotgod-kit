// Applied to pinned tree-sitter-c-sharp 0.23.5 before parser generation.
export function patchCsharpGrammar(source) {
  const before = '    _reserved_identifier: _ => choice(\n';
  if (!source.includes(before)) throw new Error('Unsupported C# grammar source.');
  return source.replace(before, `${before}      'required',\n`);
}
