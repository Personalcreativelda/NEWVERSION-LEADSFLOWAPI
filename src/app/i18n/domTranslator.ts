// Tradução do painel inteiro sem chaves no código: os textos ficam em português nos
// componentes e, noutro idioma, este tradutor troca-os no ecrã pelo dicionário
// (locales/<idioma>.json, gerado a partir de scripts/i18n/strings.json).
//  - Texto e atributos visíveis (placeholder, title, aria-label, alt); nada de valores de campos.
//  - O React continua dono do DOM: quando muda um texto, o observador traduz o valor novo.
//  - Conteúdo dos clientes (mensagens, notas…) fica igual: marcar com translate="no".
import type { Language } from '../utils/i18n';

type Pattern = { re: RegExp; hint: string; out: string };
type Dict = { exact: Map<string, string>; patterns: Pattern[] };

const LOADERS: Record<Exclude<Language, 'pt'>, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import('./locales/en.json'),
  es: () => import('./locales/es.json'),
  fr: () => import('./locales/fr.json'),
};

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP_SELECTOR = '[translate="no"], .notranslate, script, style, code, pre, textarea, [contenteditable="true"], #lfw-window';

let dict: Dict | null = null;
let observer: MutationObserver | null = null;
let current: Language = 'pt';

// Texto original e o que escrevemos, para voltar ao português e para ignorar as nossas próprias alterações
const textOriginal = new WeakMap<Text, string>();
const textWritten = new WeakMap<Text, string>();
const attrOriginal = new WeakMap<Element, Map<string, string>>();
const attrWritten = new WeakMap<Element, Map<string, string>>();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildDict(raw: Record<string, string>): Dict {
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [pt, out] of Object.entries(raw)) {
    if (!out || out === pt) continue;
    if (/\{\d+\}/.test(pt)) {
      const parts = pt.split(/\{(\d+)\}/);
      let src = '^';
      const order: number[] = [];
      parts.forEach((part, i) => {
        if (i % 2 === 0) src += escapeRe(part);
        else { src += '([\\s\\S]+?)'; order.push(Number(part)); }
      });
      // Os grupos vêm pela ordem do texto; o resultado usa {n} pela ordem original
      const statics = parts.filter((_, i) => i % 2 === 0);
      const hint = statics.reduce((a, b) => (b.trim().length > a.trim().length ? b : a), '').trim();
      if (!hint) continue;
      let mapped = out;
      order.forEach((n, groupIndex) => { mapped = mapped.split(`{${n}}`).join(`$${groupIndex + 1}`); });
      patterns.push({ re: new RegExp(src + '$'), hint, out: mapped });
    } else {
      exact.set(pt, out);
    }
  }
  // Padrões mais específicos (mais texto fixo) primeiro
  patterns.sort((a, b) => b.hint.length - a.hint.length);
  return { exact, patterns };
}

/** Tradução de um texto (ou null se não houver) — também usado fora do DOM */
export function translateText(text: string): string | null {
  if (!dict || current === 'pt') return null;
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match) return null;
  const [, lead, body, trail] = match;
  const core = body.replace(/\s+/g, ' ');
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return null;
  let out = dict.exact.get(core);
  if (out === undefined) {
    for (const p of dict.patterns) {
      if (!core.includes(p.hint)) continue;
      if (p.re.test(core)) { out = core.replace(p.re, p.out); break; }
    }
  }
  return out === undefined ? null : lead + out + trail;
}

const skipped = (el: Element | null) => !el || !!el.closest(SKIP_SELECTOR);

function processText(node: Text) {
  const value = node.nodeValue ?? '';
  if (textWritten.get(node) === value) return; // fomos nós
  if (skipped(node.parentElement)) return;
  const out = translateText(value);
  if (out === null || out === value) {
    textWritten.delete(node);
    textOriginal.delete(node);
    return;
  }
  textOriginal.set(node, value);
  textWritten.set(node, out);
  node.nodeValue = out;
}

function processAttrs(el: Element) {
  if (skipped(el)) return;
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value) continue;
    if (attrWritten.get(el)?.get(name) === value) continue;
    const out = translateText(value);
    if (out === null || out === value) continue;
    if (!attrOriginal.has(el)) attrOriginal.set(el, new Map());
    if (!attrWritten.has(el)) attrWritten.set(el, new Map());
    attrOriginal.get(el)!.set(name, value);
    attrWritten.get(el)!.set(name, out);
    el.setAttribute(name, out);
  }
}

function processTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { processText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    if (skipped(root as Element)) return;
    processAttrs(root as Element);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) processText(n as Text);
    else processAttrs(n as Element);
  }
}

/** Repõe o português em tudo o que foi traduzido */
function restoreTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      const original = textOriginal.get(t);
      if (original !== undefined && textWritten.get(t) === t.nodeValue) t.nodeValue = original;
      textOriginal.delete(t);
      textWritten.delete(t);
    } else {
      const el = n as Element;
      const originals = attrOriginal.get(el);
      originals?.forEach((value, name) => {
        if (attrWritten.get(el)?.get(name) === el.getAttribute(name)) el.setAttribute(name, value);
      });
      attrOriginal.delete(el);
      attrWritten.delete(el);
    }
  }
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') processText(r.target as Text);
      else if (r.type === 'attributes') processAttrs(r.target as Element);
      else r.addedNodes.forEach(processTree);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

function stopObserver() {
  observer?.disconnect();
  observer = null;
}

/** Muda o idioma de todo o painel (pt = textos originais) */
export async function setUiLanguage(language: Language): Promise<void> {
  if (language === current && (language === 'pt' || dict)) return;
  stopObserver();
  if (current !== 'pt') restoreTree(document.body);
  current = language;
  document.documentElement.lang = language;
  if (language === 'pt') { dict = null; return; }
  try {
    const raw = (await LOADERS[language]()).default;
    if (current !== language) return; // mudou entretanto
    dict = buildDict(raw);
    processTree(document.body);
    startObserver();
  } catch (err) {
    console.warn('[i18n] Dicionário não carregou:', err);
  }
}
