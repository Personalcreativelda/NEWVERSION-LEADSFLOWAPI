// Valor do negócio preenchido pelo assistente: a IA lê a conversa e calcula o total que o
// cliente está a negociar (quantidade × preço, com descontos ou portes combinados).
// Nunca passa por cima de um valor escrito por uma pessoa.

/** Só vale a pena perguntar à IA quando se fala de preços com números */
const PRICE_WORDS = [
  'preco', 'precos', 'custa', 'custo', 'valor', 'total', 'pagar', 'pago', 'pagamento', 'orcamento',
  'proposta', 'desconto', 'pacote', 'plano', 'mensalidade', 'por mes', 'unidade', 'unidades',
  'mt', 'mzn', 'meticais', 'kz', 'kwanzas', 'r$', 'reais', 'eur', 'euros', 'usd', 'dolares', '$', '€',
  'price', 'cost', 'quote',
];

export function mentionsPrice(text: string): boolean {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!/\d/.test(t)) return false;
  return PRICE_WORDS.some((w) => (w.length <= 3 ? new RegExp(`(^|[^a-z])${w.replace(/[$€]/g, '\\$&')}([^a-z]|$)`).test(t) : t.includes(w)));
}

export interface DealValueGuess { value: number | null; currency: string | null; confidence: 'alta' | 'media' | 'baixa'; basis?: string }

/** Lê a resposta da IA (JSON, às vezes com ```json ou texto à volta) */
export function parseDealValue(raw: string | null | undefined): DealValueGuess | null {
  if (!raw) return null;
  const m = String(raw).replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    let value: number | null = null;
    if (typeof j.value === 'number') value = j.value;
    else if (typeof j.value === 'string') {
      // "1 200,50" / "1.200,50" / "1200.50"
      let v = j.value.replace(/[^\d.,]/g, '');
      if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
      else v = v.replace(/,/g, '');
      value = v ? Number(v) : null;
    }
    if (value !== null && (!isFinite(value) || value <= 0 || value >= 1e10)) value = null;
    const c = String(j.confidence || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const confidence = c.startsWith('alt') || c === 'high' ? 'alta' : c.startsWith('med') ? 'media' : 'baixa';
    const currency = typeof j.currency === 'string' && j.currency.trim() ? j.currency.trim().slice(0, 8) : null;
    return { value: value !== null ? Math.round(value * 100) / 100 : null, currency, confidence, basis: typeof j.basis === 'string' ? j.basis.slice(0, 200) : undefined };
  } catch {
    return null;
  }
}

/**
 * O assistente pode escrever este valor? Só quando o lead não tem valor, ou quando o valor
 * que lá está foi o próprio assistente que pôs (se uma pessoa o mudou, fica o dela).
 */
export function canSetDealValue(current: number | string | null | undefined, customFields: any, guess: DealValueGuess | null): boolean {
  if (!guess || guess.value === null || guess.confidence === 'baixa') return false;
  const now = Number(current) || 0;
  const lastAi = Number(customFields?.deal_value_ai) || 0;
  if (now > 0 && Math.abs(now - lastAi) > 0.005) return false; // valor escrito por uma pessoa
  if (now > 0 && Math.abs(now - guess.value) < 0.005) return false; // nada muda
  return true;
}

export function formatDealValue(value: number, currency?: string | null): string {
  // Milhares sempre separados (1 500), como no funil; o pt-PT do Intl só separa a partir de 10 000
  const [int, dec] = String(Math.round(value * 100) / 100).split('.');
  const n = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec : '');
  return currency ? `${n} ${currency}` : n;
}
