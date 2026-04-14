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
 * Detecta se é uma JID mal formatada (REJEITA APENAS se:
 * - Não é grupo
 * - Não é @lid (LAN temporário é aceitável, será resolvido depois)
 * - E não consegue extrair NENHUM número válido)
 */
export function isInvalidJid(jid: string): boolean {
  if (!jid) return true;

  // ✅ Aceitar GRUPOS e @LIDs (evitar rejeição precipitada)
  // Grupos serão filtrados em outro lugar
  // @LIDs serão resolvidos e validados depois
  
  // Rejeitar APENAS se for completamente mal formatado
  // e não conseguir extrair nenhum número
  const phone = extractPhoneFromJid(jid);
  
  // Se conseguiu extrair um número, validar esse número
  if (phone && phone.length > 0) {
    if (!isValidPhoneNumber(phone)) {
      console.warn(`[Phone Utils] Número inválido extraído de JID: ${jid} → ${phone}`);
      return true;
    }
    // Número é válido, JID é válido
    return false;
  }

  // Se NÃO conseguiu extrair nenhum número E é @lid, aceitar (será resolvido depois)
  if (jid.includes('@lid')) {
    console.log(`[Phone Utils] @lid sem número extraído (ok, será resolvido): ${jid}`);
    return false;
  }

  // Senão, é inválido
  console.warn(`[Phone Utils] JID completamente inválido (sem @ e sem números): ${jid}`);
  return true;
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
 * Normaliza número telefônico para um formato consistente e único
 * Remove formatação, valida comprimento, evita duplicações
 * 
 * Exemplos:
 * - "11 99912-3456" → "11999123456"
 * - "+55 11 99912-3456" → "5511999123456"
 * - "(11) 99912-3456" → "11999123456"
 * 
 * O objetivo é garantir que o mesmo número sempre retorna a mesma sequência,
 * independente de como foi formatado ou entrado.
 */
export function normalizePhoneNumber(phone: string | null): string | null {
  if (!phone) return null;

  // PASSO 1: Remover todos os caracteres não-numéricos
  let normalized = phone.replace(/\D/g, '');

  // Se ficou vazio, retornar null
  if (!normalized || normalized.length === 0) {
    return null;
  }

  // PASSO 2: Remover zeros à esquerda (ex: "0011999123456" → "11999123456")
  // Mas manter pelo menos 5 dígitos
  while (normalized.length > 5 && normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }

  // PASSO 3: Garantir que tem comprimento válido (5-15 dígitos)
  if (normalized.length < 5 || normalized.length > 15) {
    console.warn(`[Phone Utils] Número normalizado com comprimento suspeito: ${phone} → ${normalized} (${normalized.length} dígitos)`);
    // Ainda assim retornar o número, mas com aviso
  }

  return normalized;
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
