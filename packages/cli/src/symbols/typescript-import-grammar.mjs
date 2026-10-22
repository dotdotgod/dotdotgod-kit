// Applied to pinned tree-sitter-typescript 0.23.2 before parser generation.
export function patchTypescriptGrammar(source) {
  const replacements = [
    ['conflicts: ($, previous) => previous.concat([', 'conflicts: ($, previous) => previous.concat([\n      [$.import, $.import_type],'],
    ['primary_type: $ => choice(', 'primary_type: $ => choice(\n        $.import_type,'],
    ["      type_query: $ => prec.right(seq(\n        'typeof',\n        choice(", "      import_type: $ => prec.right('call', seq(\n        'import', '(', $.string, ')',\n        repeat(seq('.', $._type_identifier)),\n        optional($.type_arguments),\n      )),\n\n      type_query: $ => prec.right(seq(\n        'typeof',\n        choice(\n          $.import_type,"],
  ];
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error('Unsupported TypeScript grammar source.');
    source = source.replace(before, after);
  }
  return source;
}
