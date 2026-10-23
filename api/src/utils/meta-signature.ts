// Assinatura dos webhooks da Meta (X-Hub-Signature-256 = HMAC-SHA256 do corpo com o App Secret).
//
// Os canais ligados pelo login da LeadsFlow (connected_via = 'meta_oauth') recebem eventos
// assinados com META_APP_SECRET: aí a assinatura é obrigatória. Os canais antigos foram
// criados com a app Meta de cada cliente (segredo que não temos) e continuam a ser aceites.
import crypto from 'crypto';
import { query } from '../database/connection';

export type SignatureCheck = 'valid' | 'invalid' | 'missing' | 'unconfigured';

/**
 * Segredos que podem assinar os webhooks: o da app Meta e, para o Instagram, o "Chave secreta
 * do app do Instagram" (o caso de uso "API do Instagram" tem ID e chave próprios e a Meta
 * assina os eventos do Instagram com essa chave).
 */
function signingSecrets(): string[] {
  return [process.env.META_APP_SECRET, process.env.META_INSTAGRAM_APP_SECRET]
    .map((s) => (s || '').trim())
    .filter(Boolean);
}

export function checkMetaSignature(rawBody: Buffer | undefined, header: string | undefined): SignatureCheck {
  const secrets = signingSecrets();
  if (!secrets.length) return 'unconfigured';
  if (!header || !rawBody) return 'missing';
  const a = Buffer.from(header);
  for (const secret of secrets) {
    const b = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return 'valid';
  }
  return 'invalid';
}

/**
 * true = processar o evento. Recusa só quando a assinatura não confere E o evento é para
 * uma página/conta ligada pelo login da LeadsFlow (que tem de vir assinado por nós).
 */
export async function acceptMetaWebhook(
  req: { rawBody?: Buffer; headers: Record<string, any>; body: any },
  idField: 'page_id' | 'instagram_id' | 'waba_id',
): Promise<boolean> {
  const check = checkMetaSignature(req.rawBody, req.headers['x-hub-signature-256']);
  if (check === 'valid' || check === 'unconfigured') return true;

  const ids: string[] = (req.body?.entry || []).map((e: any) => String(e?.id || '')).filter(Boolean);
  if (!ids.length) return check === 'missing';
  const result = await query(
    `SELECT 1 FROM channels
     WHERE credentials->>$1 = ANY($2::text[])
       AND credentials->>'connected_via' IN ('meta_oauth', 'meta_embedded_signup')
       AND status != 'deleted'
     LIMIT 1`,
    [idField, ids],
  );
  if (result.rows.length) {
    // Diagnóstico sem expor segredos: quantas chaves foram tentadas e a impressão digital de cada
    const tried = signingSecrets().map((s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8));
    console.warn(`[MetaWebhook] Assinatura ${check} para ${idField} ${ids.join(',')}: evento recusado (chaves tentadas: ${tried.length} [${tried.join(', ')}], META_INSTAGRAM_APP_SECRET ${process.env.META_INSTAGRAM_APP_SECRET ? 'definida' : 'NÃO definida'})`);
    return false;
  }
  return true;
}
