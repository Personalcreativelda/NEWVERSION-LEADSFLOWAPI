// Assinatura dos webhooks da Meta (X-Hub-Signature-256 = HMAC-SHA256 do corpo com o App Secret).
//
// Os canais ligados pelo login da LeadsFlow (connected_via = 'meta_oauth') recebem eventos
// assinados com META_APP_SECRET: aí a assinatura é obrigatória. Os canais antigos foram
// criados com a app Meta de cada cliente (segredo que não temos) e continuam a ser aceites.
import crypto from 'crypto';
import { query } from '../database/connection';

export type SignatureCheck = 'valid' | 'invalid' | 'missing' | 'unconfigured';

export function checkMetaSignature(rawBody: Buffer | undefined, header: string | undefined): SignatureCheck {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return 'unconfigured';
  if (!header || !rawBody) return 'missing';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? 'valid' : 'invalid';
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
    console.warn(`[MetaWebhook] Assinatura ${check} para ${idField} ${ids.join(',')}: evento recusado`);
    return false;
  }
  return true;
}
