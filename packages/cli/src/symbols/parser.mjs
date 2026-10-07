import { dirname, join } from 'node:path';
import { parserEntry, loadParserApi } from './runtime.mjs';
import { createHash } from 'node:crypto';
import { COMMENT_TYPES, DECLARATIONS } from './languages.mjs';

let runtime;
const languages = new Map();
async function parserFor(language) {
  if (!runtime) runtime = (async () => {
    const entry = parserEntry();
    const api = loadParserApi();
    await api.Parser.init();
    return { api, directory: dirname(entry) };
  })();
  const { api, directory } = await runtime;
  if (!languages.has(language)) languages.set(language, api.Language.load(join(directory, `tree-sitter-${language}.wasm`)));
  const loaded = await languages.get(language);
  const parser = new api.Parser();
  parser.setLanguage(loaded);
  return parser;
}
const field = (node, name) => node.childForFieldName(name);
const lastLine = (node) => Math.max(node.startPosition.row + 1, node.endPosition.row + (node.endPosition.column ? 1 : 0));
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

function declaredName(node) {
  const name = field(node, 'name') ?? node.namedChildren.find((child) => child.type === 'function_name');
  if (name) return name.text;
  const declarator = field(node, 'declarator');
  if (declarator) return declaredName(declarator) || (['identifier', 'field_identifier'].includes(declarator.type) ? declarator.text : '');
  return '';
}
function declarationHeader(node, source, end) {
  const cuts = [];
  function visit(child) {
    const body = field(child, 'body');
    if (body && body.startIndex < end && body.endIndex <= end) { cuts.push([body.startIndex, body.endIndex]); return; }
    for (const nested of child.namedChildren) if (nested.startIndex < end) visit(nested);
  }
  visit(node);
  let header = source.slice(node.startIndex, end);
  for (const [start, finish] of cuts.sort((a, b) => b[0] - a[0])) header = header.slice(0, start - node.startIndex) + '…' + header.slice(finish - node.startIndex);
  return header.trim();
}
function documentation(node, body, language, source) {
  if (language === 'python') {
    const first = body?.namedChildren[0];
    const string = first?.type === 'expression_statement' ? first.namedChildren[0] : null;
    const literals = string?.type === 'concatenated_string' ? string.namedChildren : string ? [string] : [];
    const valid = literals.length && literals.every((literal) => literal.type === 'string' && /^[rRuU]*['"]/.test(literal.text));
    return valid ? { text: string.text, startLine: string.startPosition.row + 1 } : { text: '' };
  }
  let anchor = node;
  while (anchor.parent && (['export_statement', 'decorated_definition'].includes(anchor.parent.type) || (['lexical_declaration', 'variable_declaration'].includes(anchor.parent.type) && !anchor.previousNamedSibling) || (language === 'powershell' && anchor.parent.type === 'statement_list' && !anchor.previousNamedSibling))) anchor = anchor.parent;
  const comments = [];
  let previous = anchor.previousNamedSibling;
  let start = anchor.startIndex;
  while (previous && source.slice(previous.endIndex, start).trim() === '') {
    if (COMMENT_TYPES.has(previous.type)) comments.unshift(previous);
    else if (!(language === 'rust' && previous.type === 'attribute_item')) break;
    start = previous.startIndex;
    previous = previous.previousNamedSibling;
  }
  const markers = ['javascript', 'typescript', 'tsx', 'java', 'php'].includes(language) ? /^\/\*\*/
    : language === 'rust' ? /^(\/\/\/(?!\/)|\/\*\*)/
    : ['cpp', 'c-sharp'].includes(language) ? /^(\/\*\*|\/\/\/|\/\/!|\/\*!)/ : null;
  const docs = markers ? comments.filter((comment) => markers.test(comment.text)) : comments;
  return { text: docs.map((comment) => comment.text).join('\n'), startLine: docs[0] ? docs[0].startPosition.row + 1 : undefined };
}

export async function extractSymbols(path, source, language) {
  const parser = await parserFor(language);
  let tree;
  try {
    tree = parser.parse(source);
    if (!tree) throw new Error('Parser returned no syntax tree');
    const symbols = [];
    const imports = [];
    const occurrences = new Map();
    function walk(node, owner = null) {
      let kind = DECLARATIONS[node.type];
      let declaration = node;
      let body = field(node, 'body') ?? (language === 'powershell' ? node.namedChildren.find((child) => child.type === 'script_block') : null);
      if (['variable_declarator', 'public_field_definition'].includes(node.type)) {
        const value = field(node, 'value');
        if (value && ['arrow_function', 'function_expression', 'generator_function'].includes(value.type)) {
          kind = 'function'; body = field(value, 'body');
        }
      }
      if (node.type === 'type_spec' && ['struct_type', 'interface_type'].includes(field(node, 'type')?.type)) {
        kind = 'class'; body = field(node, 'type').namedChildren.find((child) => child.type.endsWith('_list'));
      }
      if (node.type === 'impl_item') {
        const type = field(node, 'type');
        if (type) owner = symbols.find((symbol) => symbol.qualifiedName === type.text && ['struct', 'class'].includes(symbol.kind)) ?? { qualifiedName: type.text, id: null, kind: 'struct' };
      }
      if (kind === 'function' && owner && ['class', 'struct', 'interface', 'trait'].includes(owner.kind)) kind = 'method';
      const name = kind ? declaredName(declaration) : '';
      if (kind && name) {
        const qualifiedName = owner ? `${owner.qualifiedName}.${name}` : name;
        const signature = declarationHeader(declaration, source, body?.startIndex ?? declaration.endIndex);
        const key = `${path}#${qualifiedName}:${kind}:${hash(signature)}`;
        const occurrence = occurrences.get(key) ?? 0;
        occurrences.set(key, occurrence + 1);
        const doc = documentation(declaration, body, language, source);
        const symbol = {
          id: `symbol:${key}:${occurrence}`, kind, name, qualifiedName, ownerId: owner?.id ?? null,
          language, path, signature, documentation: doc.text,
          startLine: Math.min(doc.startLine ?? Infinity, declaration.startPosition.row + 1),
          declarationStartLine: declaration.startPosition.row + 1, endLine: lastLine(declaration),
          bodyStartLine: body ? body.startPosition.row + 1 : null, bodyEndLine: body ? lastLine(body) : null,
          declarationStartOffset: declaration.startIndex, declarationEndOffset: declaration.endIndex,
          bodyStartOffset: body?.startIndex ?? null, bodyEndOffset: body?.endIndex ?? null,
        };
        symbols.push(symbol);
        owner = symbol;
      }
      if (['import_statement', 'export_statement', 'import_from_statement', 'use_declaration', 'include_directive', 'preproc_include'].includes(node.type)) {
        const target = field(node, 'source') ?? field(node, 'module_name') ?? field(node, 'path') ?? field(node, 'argument');
        if (target) imports.push({ specifier: target.text.replace(/^['"]|['"]$/g, ''), line: node.startPosition.row + 1, syntax: node.type });
      }
      for (const child of node.namedChildren) walk(child, owner);
    }
    walk(tree.rootNode);
    return { symbols, imports, status: tree.rootNode.hasError ? 'partial' : 'parsed' };
  } finally { tree?.delete(); parser.delete(); }
}
