/**
 * Utilitários para validação e formatação de números de telefone internacionais
 * Suporta formato E.164 para SaaS multi-país
 */

/**
 * Valida número de telefone no formato E.164 internacional
 * 
 * Formato: +[código do país (1-3 dígitos)][número (até 15 dígitos total)]
 * 
 * Exemplos válidos:
 * - +12566241358 (EUA - código +1)
 * - +5511999999999 (Brasil - código +55)
 * - +4915123456789 (Alemanha - código +49)
 * - +351912345678 (Portugal - código +351)
 * - +442012345678 (Reino Unido - código +44)
 * - +33612345678 (França - código +33)
 * - +34612345678 (Espanha - código +34)
 * - +3912345678 (Itália - código +39)
 * - +5215512345678 (México - código +52)
 * - +5491112345678 (Argentina - código +54)
 * 
 * @param phoneNumber Número a validar
 * @returns true se válido, false caso contrário
 */
export function isValidE164(phoneNumber: string): boolean {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }

  // Formato E.164: + seguido de 1-3 dígitos (código país) + restante até 15 dígitos totais
  // Não pode começar com +0
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phoneNumber);
}

/**
 * Normaliza número de telefone para formato E.164
 * Remove espaços, parênteses, hífens e adiciona + se necessário
 * 
 * @param phoneNumber Número a normalizar
 * @param defaultCountryCode Código do país padrão (opcional, ex: '55' para Brasil)
 * @returns Número normalizado ou null se inválido
 */
export function normalizeToE164(phoneNumber: string, defaultCountryCode?: string): string | null {
  if (!phoneNumber) return null;

  // Remove tudo exceto dígitos e o sinal +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // Se já tem + no início, validar
  if (cleaned.startsWith('+')) {
    return isValidE164(cleaned) ? cleaned : null;
  }

  // Se tem código de país padrão, adicionar
  if (defaultCountryCode && !cleaned.startsWith(defaultCountryCode)) {
    cleaned = defaultCountryCode + cleaned;
  }

  // Adicionar + no início
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  return isValidE164(cleaned) ? cleaned : null;
}

/**
 * Extrai código do país de número E.164
 * 
 * @param phoneNumber Número em formato E.164
 * @returns Código do país (ex: '1', '55', '351') ou null
 */
export function getCountryCode(phoneNumber: string): string | null {
  if (!isValidE164(phoneNumber)) return null;

  // Remove o +
  const digits = phoneNumber.substring(1);

  // Códigos com 1 dígito: +1 (EUA/Canadá), +7 (Rússia)
  if (digits.startsWith('1') || digits.startsWith('7')) {
    return digits[0];
  }

  // Códigos com 2 dígitos: +55 (Brasil), +33 (França), +44 (Reino Unido), etc.
  if (digits.length >= 2) {
    const twoDigit = digits.substring(0, 2);
    // Maioria dos países tem código de 2 dígitos
    if (parseInt(twoDigit) >= 20 && parseInt(twoDigit) <= 99) {
      return twoDigit;
    }
  }

  // Códigos com 3 dígitos: +351 (Portugal), +355 (Albânia), etc.
  if (digits.length >= 3) {
    const threeDigit = digits.substring(0, 3);
    if (parseInt(threeDigit) >= 200) {
      return threeDigit;
    }
  }

  return null;
}

/**
 * Formata número E.164 para exibição legível
 * 
 * @param phoneNumber Número em formato E.164
 * @returns Número formatado para exibição
 */
export function formatE164ForDisplay(phoneNumber: string): string {
  if (!isValidE164(phoneNumber)) return phoneNumber;

  const countryCode = getCountryCode(phoneNumber);
  if (!countryCode) return phoneNumber;

  const rest = phoneNumber.substring(1 + countryCode.length);
  
  // Diferentes formatos por país
  if (countryCode === '1') {
    // EUA/Canadá: +1 (555) 123-4567
    if (rest.length === 10) {
      return `+1 (${rest.substring(0, 3)}) ${rest.substring(3, 6)}-${rest.substring(6)}`;
    }
  } else if (countryCode === '55') {
    // Brasil: +55 (11) 99999-9999
    if (rest.length === 11) {
      return `+55 (${rest.substring(0, 2)}) ${rest.substring(2, 7)}-${rest.substring(7)}`;
    }
  }

  // Padrão: +[código] [resto]
  return `+${countryCode} ${rest}`;
}

/**
 * Principais códigos de país para referência
 */
export const COUNTRY_CODES = {
  US: '1',          // Estados Unidos
  CA: '1',          // Canadá
  BR: '55',         // Brasil
  PT: '351',        // Portugal
  UK: '44',         // Reino Unido
  DE: '49',         // Alemanha
  FR: '33',         // França
  ES: '34',         // Espanha
  IT: '39',         // Itália
  MX: '52',         // México
  AR: '54',         // Argentina
  CL: '56',         // Chile
  CO: '57',         // Colômbia
  PE: '51',         // Peru
  VE: '58',         // Venezuela
  AO: '244',        // Angola
  MZ: '258',        // Moçambique
  CV: '238',        // Cabo Verde
  JP: '81',         // Japão
  CN: '86',         // China
  IN: '91',         // Índia
  AU: '61',         // Austrália
  NZ: '64',         // Nova Zelândia
  ZA: '27',         // África do Sul
  RU: '7',          // Rússia
} as const;
