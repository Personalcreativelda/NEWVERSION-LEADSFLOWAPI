// Cifra dos segredos dos canais (tokens, palavras-passe) guardados em channels.credentials.
//
// - AES-256-GCM com a chave CHANNEL_SECRETS_KEY (qualquer texto longo; deriva-se com SHA-256).
// - Só os campos secretos (ver SECRET_KEYS) são cifrados; o resto (page_id, phone_number_id,
//   instance_name…) fica legível para as pesquisas em SQL.
// - Valores antigos em texto simples continuam a ser lidos (decryptCredentials deixa-os como estão).
// - Sem chave configurada não se cifra nada (aviso no arranque) para não partir a API.
import crypto from 'crypto';

const PREFIX = 'enc:v1:';

/** Nomes de campos que são segredos (em qualquer nível do objeto) */
const SECRET_KEYS = new Set([
  'access_token', 'page_access_token', 'user_access_token', 'bot_token', 'token', 'refresh_token',
  'authToken', 'auth_token', 'api_key', 'apiKey', 'app_secret', 'client_secret', 'secret',
  'pass', 'password', 'smtp_password', 'imap_password', 'smtp_pass', 'imap_pass',
]);

let cachedKey: Buffer | null | undefined;
function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.CHANNEL_SECRETS_KEY;
  cachedKey = raw && raw.length >= 16 ? crypto.createHash('sha256').update(raw).digest() : null;
  return cachedKey;
}

/** Só para testes: volta a ler a chave do ambiente */
export function resetSecretKeyCache() {
  cachedKey = undefined;
}

export const isEncryptionEnabled = () => getKey() !== null;
export const isEncrypted = (value: unknown): value is string => typeof value === 'string' && value.startsWith(PREFIX);
export const isSecretKey = (key: string) => SECRET_KEYS.has(key);

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key || !plain || isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const key = getKey();
  if (!key) throw new Error('CHANNEL_SECRETS_KEY em falta: não é possível ler as credenciais cifradas');
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Impressão digital de um segredo para pesquisas (ex.: canal Telegram pelo token do bot no URL) */
export function secretFingerprint(value: string): string {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

type Json = any;

function mapSecrets(value: Json, fn: (v: string) => string): Json {
  if (Array.isArray(value)) return value.map((v) => mapSecrets(v, fn));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string' && SECRET_KEYS.has(k)) out[k] = v ? fn(v) : v;
    else if (v && typeof v === 'object') out[k] = mapSecrets(v, fn);
    else out[k] = v;
  }
  return out;
}

/** Cifra os campos secretos e acrescenta a impressão digital do token do bot (Telegram) */
export function encryptCredentials<T = Json>(credentials: T): T {
  if (!credentials || typeof credentials !== 'object') return credentials;
  const withFingerprint: Json = { ...(credentials as Json) };
  const botToken = withFingerprint.bot_token;
  if (typeof botToken === 'string' && botToken && !isEncrypted(botToken)) {
    withFingerprint.bot_token_sha256 = secretFingerprint(botToken);
  }
  return mapSecrets(withFingerprint, encryptSecret);
}

export function decryptCredentials<T = Json>(credentials: T): T {
  if (!credentials || typeof credentials !== 'object') return credentials;
  return mapSecrets(credentials, (v) => {
    try {
      return decryptSecret(v);
    } catch (err: any) {
      console.error('[SecretBox] Não foi possível decifrar uma credencial:', err?.message);
      return '';
    }
  });
}

/** Há algum segredo ainda em texto simples? (para a migração no arranque) */
export function hasPlainSecrets(value: Json): boolean {
  if (Array.isArray(value)) return value.some(hasPlainSecrets);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([k, v]) =>
    (typeof v === 'string' && v !== '' && SECRET_KEYS.has(k) && !isEncrypted(v)) ||
    (v !== null && typeof v === 'object' && hasPlainSecrets(v)),
  );
}

/**
 * Versão para o browser: tira os segredos e diz só quais estão definidos
 * (ex.: { page_name, page_id, has_page_access_token: true }).
 */
export function publicCredentials(credentials: Json): Json {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return {};
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(credentials)) {
    if (k.endsWith('_sha256')) continue;
    if (SECRET_KEYS.has(k)) {
      out[`has_${k}`] = typeof v === 'string' ? v !== '' : !!v;
      continue;
    }
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? publicCredentials(v) : v;
  }
  return out;
}

/**
 * Junta credenciais novas às guardadas: um segredo vazio/ausente no pedido não apaga o
 * guardado (o app já não recebe os tokens, por isso não os pode reenviar ao editar).
 */
export function mergeCredentials(stored: Json, incoming: Json): Json {
  if (!incoming || typeof incoming !== 'object') return stored || {};
  const base: Record<string, Json> = stored && typeof stored === 'object' ? { ...stored } : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (k.startsWith('has_')) continue;
    if (SECRET_KEYS.has(k) && (v === '' || v === null || v === undefined)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      base[k] = mergeCredentials(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}
