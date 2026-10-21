// Pesquisa usada em todas as barras de pesquisa do app.

/** Minúsculas e sem acentos ("Promoção" → "promocao"). */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * true se todas as palavras da pesquisa aparecem em algum dos campos — sem
 * diferenciar maiúsculas nem acentos. Termos só com dígitos (telefones) comparam
 * apenas os dígitos, para "84 123" encontrar "+258 841 234 567".
 */
export function matchesSearch(query: string, ...fields: unknown[]): boolean {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = normalizeSearch(
    fields.filter((f) => f !== null && f !== undefined && f !== '').map(String).join(' ')
  );
  const haystackDigits = haystack.replace(/\D/g, '');

  return terms.every((term) => {
    if (haystack.includes(term)) return true;
    const digits = term.replace(/\D/g, '');
    return digits.length >= 3 && /^[\d\s()+-]+$/.test(term) && haystackDigits.includes(digits);
  });
}
