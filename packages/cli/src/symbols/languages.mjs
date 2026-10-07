import { extname } from 'node:path';

// Explicit capability matrix, not a claim that every Tree-sitter grammar yields outlines.
export const LANGUAGE_EXTENSIONS = {
  javascript: ['.js', '.jsx', '.mjs', '.cjs'], typescript: ['.ts'], tsx: ['.tsx'],
  python: ['.py', '.pyw'], go: ['.go'], rust: ['.rs'], java: ['.java'],
  ruby: ['.rb'], php: ['.php'], 'c-sharp': ['.cs'], cpp: ['.cpp', '.cc', '.cxx', '.hpp'],
  bash: ['.sh', '.bash'], powershell: ['.ps1'],
};
export const SOURCE_EXTENSIONS = new Set([
  ...Object.values(LANGUAGE_EXTENSIONS).flat(), '.c', '.h', '.kt', '.kts', '.swift',
  '.scala', '.clj', '.cljs', '.ex', '.exs', '.erl', '.hrl', '.lua', '.pl', '.pm', '.r', '.R', '.sql', '.m', '.mm', '.zsh', '.fish',
]);
export const EXTRACTOR_ID = 'outline-v3:vscode-tree-sitter-wasm-0.3.1';
export function languageForPath(path) {
  return Object.entries(LANGUAGE_EXTENSIONS).find(([, extensions]) => extensions.includes(extname(path)))?.[0] ?? null;
}
export const DECLARATIONS = {
  function_declaration: 'function', generator_function_declaration: 'function',
  function_definition: 'function', function_item: 'function', function_signature_item: 'function', function_signature: 'function',
  method_definition: 'method', method_declaration: 'method', method_signature: 'method', method: 'method', singleton_method: 'method',
  constructor_declaration: 'constructor', destructor_declaration: 'destructor',
  class_declaration: 'class', class_definition: 'class', class: 'class', class_specifier: 'class', struct_specifier: 'struct',
  interface_declaration: 'interface', interface_definition: 'interface', trait_item: 'trait',
  struct_item: 'struct', enum_item: 'enum', enum_declaration: 'enum', record_declaration: 'class',
  namespace_definition: 'namespace', mod_item: 'module', module: 'module',
  function_statement: 'function',
};
export const COMMENT_TYPES = new Set(['comment', 'line_comment', 'block_comment']);
