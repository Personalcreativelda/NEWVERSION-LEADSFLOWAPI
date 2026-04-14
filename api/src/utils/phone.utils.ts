/**
 * Utilitários para processamento e validação de números telefônicos
 * Principalmente para WhatsApp Evolution API que retorna JIDs complexos
 */

/**
 * Extrai número limpo de um JID do WhatsApp
 * Exemplos:
 * - "559912345678@s.whatsapp.net" → "559912345678"
 * - "559912345678@lid" → "559912345678"
 * - "123456789@g.us" → "123456789" (grupo)
 * - "559912345678" → "559912345678" (já limpo)
 */
export function extractPhoneFromJid(jid: string): string | null {
  if (!jid || typeof jid !== 'string') {
    return null;
  }

  // Remover símbolos de JID
  let phone = jid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .replace(/@lid$/, '')
    .replace(/@[a-z.]+$/, ''); // Fallback: remover qualquer @domínio

  // Manter apenas dígitos
  phone = phone.replace(/\D/g, '');

  return phone && phone.length > 0 ? phone : null;
}

/**
 * Valida se é um número telefônico válido para WhatsApp
 * Deve ter entre 5 e 15 dígitos (padrão E.164)
 */
export function isValidPhoneNumber(phone: string | null): boolean {
  if (!phone) return false;

  const cleanPhone = phone.replace(/\D/g, '');
  return cleanPhone.length >= 5 && cleanPhone.length <= 15;
}

/**
 * Detecta se um JID é de grupo
 */
export function isGroupJid(jid: string): boolean {
  return jid ? jid.endsWith('@g.us') || jid.includes('@g.us') : false;
}

/**
 * Detecta se é uma JID inválida (LID ou formato incomum)
 */
export function isInvalidJid(jid: string): boolean {
  if (!jid) return true;

  // Rejeitar LIDs puros (temporal, não é número real)
  if (jid.endsWith('@lid') || jid.includes('@lid')) {
    console.warn(`[Phone Utils] LID detectado: ${jid}`);
    return true;
  }

  // Rejeitar grupos
  if (isGroupJid(jid)) {
    console.warn(`[Phone Utils] Grupo detectado: ${jid}`);
    return true;
  }

  // Tentar extrair número e validar
  const phone = extractPhoneFromJid(jid);
  if (!isValidPhoneNumber(phone)) {
    console.warn(`[Phone Utils] Número inválido em JID: ${jid} → ${phone}`);
    return true;
  }

  return false;
}

/**
 * Compara dois números telefônicos, ignorando formatação
 * Útil para verificar se é o mesmo número de origem
 */
export function isSamePhoneNumber(phone1: string | null, phone2: string | null): boolean {
  if (!phone1 || !phone2) return false;

  const clean1 = phone1.replace(/\D/g, '');
  const clean2 = phone2.replace(/\D/g, '');

  // Comparação exata
  if (clean1 === clean2) return true;

  // Fallback: se um termina com o outro (ex: "55" + "11999..." vs completo)
  return clean1.endsWith(clean2) || clean2.endsWith(clean1);
}

/**
 * Normaliza número para formato E.164 (com +)
 */
export function normalizePhoneE164(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return clean.startsWith('+') ? clean : '+' + clean;
}

/**
 * Formata número para ser enviado via Evolution API
 * RetORna o número com @s.whatsapp.net ou mantém como está
 */
export function formatPhoneForEvolution(phone: string, preferJid = false): string {
  const clean = extractPhoneFromJid(phone) || phone.replace(/\D/g, '');

  if (!clean || clean.length === 0) {
    return phone; // Fallback ao original
  }

  if (preferJid) {
    return `${clean}@s.whatsapp.net`;
  }

  return clean;
}
