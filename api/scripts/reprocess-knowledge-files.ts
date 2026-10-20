#!/usr/bin/env ts-node

/**
 * Reextrai o texto dos documentos da base de conhecimento a partir do arquivo original (storage_url).
 *
 * O parser de PDF antigo gravava texto partido ("P r es t aç ão"), cifrado ("&DVDPHQWR…") ou a
 * própria sintaxe do PDF como status 'ready'. Este script reprocessa com o fluxo atual
 * (pdf.js → OCR OpenAI → Gemini) e só grava quando o resultado novo é diferente.
 *
 * Usage:
 *   npx ts-node --transpile-only api/scripts/reprocess-knowledge-files.ts          (simulação)
 *   npx ts-node --transpile-only api/scripts/reprocess-knowledge-files.ts --apply  (grava no banco)
 */

import 'dotenv/config';
import { query } from '../src/database/connection';
import { AIService } from '../src/services/ai.service';

const APPLY = process.argv.includes('--apply');
const MAX_CHARS = 20000; // mesmo limite do upload (routes/assistants.routes.ts)

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

async function reprocessKnowledgeFiles() {
  console.log(`📚 Reprocessando base de conhecimento (${APPLY ? 'GRAVANDO' : 'simulação — use --apply para gravar'})\n`);

  const aiService = new AIService();
  const result = await query(
    `SELECT id, file_name, kind, mime_type, storage_url, char_count, status
     FROM assistant_knowledge_files
     WHERE storage_url IS NOT NULL
     ORDER BY created_at ASC`
  );

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const f of result.rows) {
    try {
      const res = await fetch(f.storage_url);
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      const ext = (String(f.file_name).split('.').pop() || '').toLowerCase();
      const mime = EXT_MIME[ext] || f.mime_type || 'application/octet-stream';
      const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;

      const text = (await aiService.extractDocumentText(
        dataUri, mime, process.env.GEMINI_API_KEY, MAX_CHARS, process.env.OPENAI_API_KEY
      )).trim();

      const current = await query('SELECT text_content FROM assistant_knowledge_files WHERE id = $1', [f.id]);
      if ((current.rows[0]?.text_content || '').trim() === text) {
        unchanged++;
        console.log(`= ${f.file_name} — sem alterações`);
        continue;
      }

      const ok = f.kind === 'client' || text.length > 0;
      console.log(`${ok ? '✔' : '✖'} ${f.file_name} [${f.kind}] ${f.char_count} → ${text.length} chars: "${text.replace(/\s+/g, ' ').substring(0, 80)}"`);

      if (APPLY) {
        await query(
          `UPDATE assistant_knowledge_files
           SET text_content = $1, char_count = $2, status = $3, error_message = $4, updated_at = NOW()
           WHERE id = $5`,
          [
            text,
            text.length,
            ok ? 'ready' : 'failed',
            ok ? null : 'Não foi possível extrair texto deste arquivo (documento sem texto selecionável ou formato não suportado).',
            f.id,
          ]
        );
      }
      updated++;
    } catch (err: any) {
      failed++;
      console.warn(`⚠️ ${f.file_name} — erro: ${err.message}`);
    }
  }

  console.log(`\n${APPLY ? 'Atualizados' : 'Seriam atualizados'}: ${updated} | Sem alterações: ${unchanged} | Erros: ${failed}`);
}

reprocessKnowledgeFiles()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  });
