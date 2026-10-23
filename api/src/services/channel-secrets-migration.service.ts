// Cifra, no arranque, os segredos dos canais que ainda estão em texto simples.
// Idempotente: só toca nas linhas com segredos por cifrar. Lê pelo pool direto (sem a
// decifragem automática do query()) para ver o que está realmente guardado.
import pool, { initPool } from '../database/connection';
import { encryptCredentials, hasPlainSecrets, isEncryptionEnabled } from '../utils/secret-box';

const TABLES: { table: string; column: string }[] = [
  { table: 'channels', column: 'credentials' },
  { table: 'assistant_message_queue', column: 'credentials' },
];

export async function encryptExistingChannelSecrets(): Promise<void> {
  if (!isEncryptionEnabled()) {
    const level = process.env.NODE_ENV === 'production' ? 'error' : 'warn';
    console[level]('[Secrets] CHANNEL_SECRETS_KEY não definida: os tokens dos canais ficam guardados sem cifra.');
    return;
  }
  await initPool();
  for (const { table, column } of TABLES) {
    try {
      const result = await pool.query(`SELECT id, ${column} AS creds FROM ${table} WHERE ${column} IS NOT NULL`);
      let updated = 0;
      for (const row of result.rows) {
        let creds = row.creds;
        if (typeof creds === 'string') {
          try { creds = JSON.parse(creds); } catch { continue; }
        }
        if (!hasPlainSecrets(creds)) continue;
        await pool.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [JSON.stringify(encryptCredentials(creds)), row.id]);
        updated++;
      }
      if (updated) console.log(`[Secrets] ${updated} linha(s) cifradas em ${table}.${column}`);
    } catch (err: any) {
      // Tabela opcional (ex.: fila dos assistentes) pode não existir
      if (err?.code !== '42P01') console.error(`[Secrets] Erro ao cifrar ${table}.${column}:`, err?.message);
    }
  }
}
