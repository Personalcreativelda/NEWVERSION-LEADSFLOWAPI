// Tira do código todos os textos da interface em português (e as mensagens de erro da API)
// para scripts/i18n/strings.json. Os dicionários de src/app/i18n/locales/*.json traduzem
// estes textos; o tradutor do app (src/app/i18n/domTranslator.ts) troca-os no ecrã.
//
//   node scripts/i18n/extract.mjs        → atualiza strings.json e mostra os que faltam traduzir
import ts from 'typescript';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../..');
const OUT = join(root, 'scripts/i18n/strings.json');
const LOCALES_DIR = join(root, 'src/app/i18n/locales');

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx?|jsx?)$/.test(name) && !name.endsWith('.d.ts') && !/\.(test|spec)\./.test(name)) files.push(full);
  }
  return files;
}

// Atributos JSX que nunca são texto para o utilizador
const SKIP_ATTRS = new Set(['className', 'class', 'style', 'key', 'id', 'type', 'name', 'href', 'src', 'to', 'variant', 'size',
  'role', 'htmlFor', 'value', 'defaultValue', 'autoComplete', 'inputMode', 'accept', 'target', 'rel', 'method', 'action',
  'side', 'align', 'orientation', 'mode', 'brand', 'icon', 'color', 'fill', 'stroke', 'd', 'viewBox', 'xmlns', 'pattern',
  'lang', 'dir', 'form', 'enterKeyHint', 'path', 'element', 'as', 'tone', 'status', 'kind', 'format', 'locale', 'currency']);
// Funções cujos argumentos são classes ou chaves
const SKIP_CALLS = new Set(['cn', 'clsx', 'twMerge', 'classNames', 'cva', 'require', 'import', 'getItem', 'setItem', 'removeItem',
  'querySelector', 'querySelectorAll', 'getElementById', 'addEventListener', 'removeEventListener', 'dispatchEvent',
  'getPropertyValue', 'setProperty', 'matchMedia', 'createElement', 'registerPlugin', 'fetch', 'get', 'post', 'put', 'patch',
  'delete', 'startsWith', 'endsWith', 'includes', 'split', 'replace', 'replaceAll', 'indexOf', 'match', 'test', 'join',
  'toLocaleDateString', 'toLocaleString', 'toLocaleTimeString', 'Intl', 'NumberFormat', 'DateTimeFormat', 'Event', 'CustomEvent',
  'URL', 'URLSearchParams', 'Date', 'RegExp', 'encodeURIComponent', 'useQuery', 'invalidateQueries', 'emit', 'on', 'off', 'log',
  'warn', 'debug', 'info', 'trace', 'group', 'groupCollapsed', 'time', 'timeEnd']);

const looksLikeUiText = (s) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || !/[A-Za-zÀ-ÿ]/.test(t)) return false;
  if (/:\/\/|^\/|^#|^\.|^[a-z]+:[a-z]|=>|[{};]|^data:|^\w+\.\w+\(|^[a-z0-9_]+\.[a-z0-9_.]+$/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3 && t.includes('_')) return false; // CONSTANTES
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false;                              // identificadores (camelCase)
  if (/^[a-z0-9_-]+$/.test(t) && /[_-]/.test(t)) return false;                   // chaves/slugs
  // Classes do Tailwind e afins: todas as palavras com hífen/dois pontos/colchetes
  const tokens = t.split(' ');
  if (tokens.every((w) => /^[!a-z0-9\[\]\/.%:#()_,&>*~+-]+$/.test(w)) && tokens.some((w) => /[-:\[]/.test(w))) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/.test(t)) return false;
  return true;
};

const isPortuguesish = (t) => /[À-ÿ]/.test(t) || / /.test(t) || /^[A-ZÀ-Ý][a-zà-ÿ]/.test(t);

const exact = new Map();    // texto → ficheiros
const patterns = new Map(); // padrão com {0} → ficheiros

function add(map, text, file) {
  const key = text.replace(/\s+/g, ' ').trim();
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(file);
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

function insideSkippedContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isJsxAttribute(p)) {
      const n = p.name.getText();
      if (SKIP_ATTRS.has(n) || n.startsWith('data-') || n.startsWith('on') && n !== 'onboarding') return true;
      return false;
    }
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      const name = p.expression ? (ts.isIdentifier(p.expression) ? p.expression.text : ts.isPropertyAccessExpression(p.expression) ? p.expression.name.text : '') : '';
      if (SKIP_CALLS.has(name)) return true;
      if (ts.isPropertyAccessExpression(p.expression) && ['console'].includes(p.expression.expression.getText())) return true;
      return false;
    }
    if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
    if (ts.isCaseClause(p) && p.expression === node) return true;
    if (ts.isPropertyAssignment(p) && p.name === node) return true;
    if (ts.isLiteralTypeNode(p) || ts.isTypeNode(p)) return true;
    if (ts.isPropertyAssignment(p)) {
      const k = p.name.getText().replace(/['"]/g, '');
      if (['className', 'class', 'key', 'id', 'type', 'value', 'icon', 'color', 'variant', 'href', 'path', 'url', 'route', 'event',
        'field', 'column', 'code', 'status', 'mimeType', 'accept', 'format', 'brand', 'channel', 'provider', 'method', 'endpoint',
        'queryKey', 'storageKey', 'cssVar', 'gradient', 'bg', 'text', 'border', 'iconClass', 'badgeClass', 'ring', 'dot']
        .includes(k) && !['text'].includes(k)) return true;
      return false;
    }
    if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

function templateToPattern(tpl) {
  let out = tpl.head.text;
  tpl.templateSpans.forEach((span, i) => { out += `{${i}}` + span.literal.text; });
  return out;
}

function scanFrontend(file) {
  const code = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = relative(root, file).split(sep).join('/');
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim();
      if (t && /[A-Za-zÀ-ÿ]/.test(t)) add(exact, t, rel);
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksLikeUiText(node.text) && isPortuguesish(node.text.trim())) {
      if (!insideSkippedContext(node)) add(exact, node.text, rel);
    } else if (ts.isTemplateExpression(node)) {
      const p = templateToPattern(node);
      const statics = p.replace(/\{\d+\}/g, ' ');
      if (/[A-Za-zÀ-ÿ]{2,}/.test(statics) && looksLikeUiText(statics) && !insideSkippedContext(node)) add(patterns, p, rel);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Na API só interessam as mensagens que chegam ao utilizador: { error: '…' }, { message: '…' } e new Error('…')
function scanApi(file) {
  const code = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const rel = relative(root, file).split(sep).join('/');
  const userFacing = (node) => {
    const p = node.parent;
    if (ts.isPropertyAssignment(p) && ['error', 'message', 'details'].includes(p.name.getText())) return true;
    if (ts.isNewExpression(p) && /Error$/.test(p.expression.getText())) return true;
    if (ts.isConditionalExpression(p) || ts.isBinaryExpression(p)) return userFacing(p);
    return false;
  };
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && userFacing(node) && /[À-ÿ]|ção|ões| não /.test(node.text)) {
      add(exact, node.text, rel);
    } else if (ts.isTemplateExpression(node) && userFacing(node)) {
      const p = templateToPattern(node);
      if (/[À-ÿ]|ção|ões| não /.test(p)) add(patterns, p, rel);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Fora do painel: páginas públicas (privacidade, termos, documentação) e a página de entrada,
// e o dicionário antigo da navegação (utils/i18n.ts), que já tem as suas traduções
const OUTSIDE_DASHBOARD = /[\\/]components[\\/](public[\\/]|HeroSection|Features|Pricing|CTASection|Header\.tsx|Footer\.tsx)|[\\/]utils[\\/]i18n\.ts$|public-pages-ssr/;

for (const f of walk(join(root, 'src'))) {
  if (/[\\/]i18n[\\/]locales[\\/]/.test(f) || OUTSIDE_DASHBOARD.test(f)) continue;
  scanFrontend(f);
}
for (const f of walk(join(root, 'api/src'))) scanApi(f);

// Registos de depuração ("[API] …") e JSON de exemplo não aparecem ao utilizador
const userVisible = (s) => !s.startsWith('[') && !s.includes('"error":');
const strings = {
  exact: [...exact.keys()].filter(userVisible).sort((a, b) => a.localeCompare(b)),
  patterns: [...patterns.keys()].filter(userVisible).sort((a, b) => a.localeCompare(b)),
};
writeFileSync(OUT, JSON.stringify(strings, null, 1) + '\n');
console.log(`Textos: ${strings.exact.length} fixos, ${strings.patterns.length} com variáveis → ${relative(root, OUT)}`);

// Quantos faltam em cada dicionário
if (existsSync(LOCALES_DIR)) {
  for (const name of readdirSync(LOCALES_DIR).filter((n) => n.endsWith('.json'))) {
    const dict = JSON.parse(readFileSync(join(LOCALES_DIR, name), 'utf8'));
    const missing = [...strings.exact, ...strings.patterns].filter((s) => !(s in dict));
    console.log(`  ${name}: ${missing.length} por traduzir`);
  }
}
