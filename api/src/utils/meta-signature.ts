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

/**
 * A Meta calcula a assinatura sobre o corpo com os caracteres não-ASCII escritos como \uXXXX
 * (hexadecimal minúsculo): "Olá" assina-se como "Olá". Os emojis ficam em pares
 * (😀). Ver a documentação dos webhooks da Meta.
 */
function escapeUnicode(raw: Buffer): Buffer | null {
  const text = raw.toString('utf8');
  if (!/[^\x00-\x7f]/.test(text)) return null;
  return Buffer.from(text.replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), 'utf8');
}

/** "/" escrito como "\/" (como o json_encode da Meta faz por omissão) */
function escapeSlashes(raw: Buffer): Buffer | null {
  const text = raw.toString('utf8');
  if (!text.includes('/')) return null;
  return Buffer.from(text.replace(/(?<!\\)\//g, '\\/'), 'utf8');
}

/** Formas do corpo sobre as quais a Meta pode ter calculado a assinatura */
function signedBodyVariants(raw: Buffer): Buffer[] {
  const unicode = escapeUnicode(raw);
  const variants = [raw, unicode, escapeSlashes(raw), unicode ? escapeSlashes(unicode) : null];
  return variants.filter(Boolean) as Buffer[];
}

/** Forma do corpo recebido para o registo (sem chaves): ajuda a perceber porque não confere */
export function describeSignedBody(raw: Buffer | undefined, header: string | undefined): string {
  if (!raw) return 'sem corpo bruto';
  const text = raw.toString('utf8');
  return [
    `bytes=${raw.length}`,
    `nao_ascii=${/[^\x00-\x7f]/.test(text)}`,
    `barras=${text.includes('/')}`,
    `barras_escapadas=${text.includes('\\/')}`,
    `unicode_escapado=${/\\u[0-9a-fA-F]{4}/.test(text)}`,
    `cabecalho=${(header || '').slice(0, 14)}…`,
    `inicio=${JSON.stringify(text.slice(0, 160))}`,
  ].join(' ');
}

export function checkMetaSignature(rawBody: Buffer | undefined, header: string | undefined): SignatureCheck {
  const secrets = signingSecrets();
  if (!secrets.length) return 'unconfigured';
  if (!header || !rawBody) return 'missing';
  const a = Buffer.from(header);
  const bodies = signedBodyVariants(rawBody);
  for (const secret of secrets) {
    for (const body of bodies) {
      const b = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex'));
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return 'valid';
    }
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
       AND credentials->>'connected_via' IN ('meta_oauth', 'meta_embedded_signup', 'instagram_login')
       AND status != 'deleted'
     LIMIT 1`,
    [idField, ids],
  );
  if (result.rows.length) {
    // Diagnóstico sem expor segredos: quantas chaves foram tentadas e a impressão digital de cada
    const tried = signingSecrets().map((s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8));
    console.warn(`[MetaWebhook] Assinatura ${check} para ${idField} ${ids.join(',')}: evento recusado (chaves tentadas: ${tried.length} [${tried.join(', ')}], META_INSTAGRAM_APP_SECRET ${process.env.META_INSTAGRAM_APP_SECRET ? 'definida' : 'NÃO definida'}) ${describeSignedBody(req.rawBody, req.headers['x-hub-signature-256'])}`);
    return false;
  }
  return true;
}
