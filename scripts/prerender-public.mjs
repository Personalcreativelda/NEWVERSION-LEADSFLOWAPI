#!/usr/bin/env node
/**
 * Depois do `vite build`: grava em dist/ o HTML já desenhado das páginas públicas
 * (privacidade, termos, API) — dist/privacidade.html, termos.html, docs.html e os aliases.
 * O `serve` do Dockerfile entrega /privacidade a partir de privacidade.html (cleanUrls),
 * por isso o verificador de URLs da Meta vê o texto sem correr JavaScript.
 */
import { build } from 'vite';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
// Dentro do projeto: o código gerado importa react/lucide do node_modules
const out = join(root, 'node_modules', '.leadsflow-prerender');

try {
  await build({
    root,
    logLevel: 'warn',
    build: { ssr: 'src/public-pages-ssr.tsx', outDir: out, emptyOutDir: true, rollupOptions: { output: { format: 'esm', entryFileNames: 'entry.mjs' } } },
  });
  const { PAGES, ALIASES } = await import(pathToFileURL(join(out, 'entry.mjs')).href);

  const template = readFileSync(join(dist, 'index.html'), 'utf8');
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const pageHtml = {};

  for (const page of PAGES) {
    const markup = page.render();
    if (!markup.includes('<h1')) throw new Error(`Página ${page.file} sem conteúdo`);
    pageHtml[page.file] = template
      .replace(/<title>[^<]*<\/title>/, `<title>${escape(page.title)} · LeadsFlow</title>\n    <meta name="description" content="${escape(page.description)}" />`)
      .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
    writeFileSync(join(dist, `${page.file}.html`), pageHtml[page.file]);
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    writeFileSync(join(dist, `${alias}.html`), pageHtml[target]);
  }
  console.log(`✔ Páginas públicas geradas: ${[...PAGES.map((p) => p.file), ...Object.keys(ALIASES)].map((f) => `${f}.html`).join(', ')}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
