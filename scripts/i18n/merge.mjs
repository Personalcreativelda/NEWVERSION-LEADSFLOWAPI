// Junta as traduções de scripts/i18n/chunks/*.json ({ "índice": [en, es, fr] }, pela ordem de
// strings.json) nos dicionários src/app/i18n/locales/{en,es,fr}.json.
//   node scripts/i18n/merge.mjs          → atualiza os dicionários e valida as variáveis {0}
//   node scripts/i18n/merge.mjs --split  → cria chunks/NN.src.txt com os textos por traduzir
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../..');
const CHUNKS = join(root, 'scripts/i18n/chunks');
const LOCALES = join(root, 'src/app/i18n/locales');
const LANGS = ['en', 'es', 'fr'];
const CHUNK_SIZE = 250;

const strings = JSON.parse(readFileSync(join(root, 'scripts/i18n/strings.json'), 'utf8'));
const all = [...strings.exact, ...strings.patterns];
const load = (lang) => (existsSync(join(LOCALES, `${lang}.json`)) ? JSON.parse(readFileSync(join(LOCALES, `${lang}.json`), 'utf8')) : {});

if (process.argv.includes('--split')) {
  mkdirSync(CHUNKS, { recursive: true });
  const en = load('en');
  const todo = all.map((s, i) => [i, s]).filter(([, s]) => !(s in en));
  for (let c = 0; c * CHUNK_SIZE < todo.length; c++) {
    const lines = todo.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE).map(([i, s]) => `${i}\t${s.replace(/\n/g, '\\n')}`);
    writeFileSync(join(CHUNKS, `${String(c).padStart(2, '0')}.src.txt`), lines.join('\n') + '\n');
  }
  console.log(`${todo.length} textos por traduzir em ${Math.ceil(todo.length / CHUNK_SIZE)} blocos`);
  process.exit(0);
}

const vars = (s) => (s.match(/\{\d+\}/g) || []).sort().join(',');
const dicts = Object.fromEntries(LANGS.map((l) => [l, load(l)]));
let added = 0;
const problems = [];
for (const name of readdirSync(CHUNKS).filter((n) => /^\d+\.json$/.test(n)).sort()) {
  const chunk = JSON.parse(readFileSync(join(CHUNKS, name), 'utf8'));
  for (const [idx, outs] of Object.entries(chunk)) {
    const pt = all[Number(idx)];
    if (pt === undefined) { problems.push(`${name}: índice ${idx} não existe`); continue; }
    LANGS.forEach((lang, i) => {
      const out = outs[i];
      if (typeof out !== 'string' || !out.trim()) { problems.push(`${name} #${idx} ${lang}: vazio`); return; }
      if (vars(out) !== vars(pt)) { problems.push(`${name} #${idx} ${lang}: variáveis diferentes ("${pt}" → "${out}")`); return; }
      if (!(pt in dicts[lang])) added++;
      dicts[lang][pt] = out.replace(/\\n/g, '\n');
    });
  }
}
// Valores que vêm dos dados em minúsculas (estados dos leads, campanhas…), que o extrator não apanha
const EXTRAS = join(root, 'scripts/i18n/extras.json');
if (existsSync(EXTRAS)) {
  for (const [pt, outs] of Object.entries(JSON.parse(readFileSync(EXTRAS, 'utf8')))) {
    LANGS.forEach((lang, i) => { dicts[lang][pt] = outs[i]; });
  }
}

for (const lang of LANGS) {
  const sorted = Object.fromEntries(Object.entries(dicts[lang]).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(LOCALES, `${lang}.json`), JSON.stringify(sorted, null, 1) + '\n');
}
const missing = all.filter((s) => !(s in dicts.en)).length;
console.log(`+${added} traduções; faltam ${missing} de ${all.length} em inglês`);
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
