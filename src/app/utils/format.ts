// Formatação de números, moeda, percentagens e datas no locale ativo da app.
// Português = pt-MZ (21/10/2026, 1,4%, 1 500,00 MT); nunca datas no formato EUA.

import { loadLanguage } from './i18n';

const LOCALE_BY_LANGUAGE: Record<string, string> = {
  pt: 'pt-MZ',
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
};

/** Locale do idioma ativo (para toLocaleString / Intl) */
export function getLocale(): string {
  try {
    return LOCALE_BY_LANGUAGE[loadLanguage()] || 'pt-MZ';
  } catch {
    return 'pt-MZ';
  }
}

/** Agrupa também números de 4 dígitos (1 500 e não 1500), como nos valores em MT */
export const NUMBER_OPTS = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;

/** Moeda da conta: a do utilizador se existir, senão metical */
export function getAccountCurrency(): string {
  try {
    const user = JSON.parse(localStorage.getItem('leadflow_user') || 'null');
    const currency = user?.currency || user?.settings?.currency || localStorage.getItem('leadflow_currency') || 'MZN';
    return String(currency).toUpperCase();
  } catch {
    return 'MZN';
  }
}

// Símbolos usados no país em vez do código ISO ("MTn" no Intl)
const CURRENCY_SYMBOL: Record<string, string> = { MZN: 'MT' };

const toNumber = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** 1 500,00 MT (moeda da conta por omissão) */
export function formatMoney(value: unknown, currency: string = getAccountCurrency()): string {
  const amount = toNumber(value);
  const code = (currency || 'MZN').toUpperCase();
  const symbol = CURRENCY_SYMBOL[code];
  if (symbol) {
    const number = new Intl.NumberFormat(getLocale(), { ...NUMBER_OPTS, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    return `${number} ${symbol}`;
  }
  try {
    return new Intl.NumberFormat(getLocale(), { ...NUMBER_OPTS, style: 'currency', currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/** 1 763 */
export function formatNumber(value: unknown, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), { ...NUMBER_OPTS, ...options }).format(toNumber(value));
}

/** Percentagem a partir de 0–100: formatPercent(1.4) → "1,4%" */
export function formatPercent(value: unknown, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits }).format(toNumber(value) / 100);
}

const toDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 21/10/2026 */
export function formatDate(value: unknown): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

/** 21/10/2026, 14:05 */
export function formatDateTime(value: unknown): string {
  const d = toDate(value);
  return d
    ? d.toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
}

/** 14:05 */
export function formatTime(value: unknown): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' }) : '';
}

/**
 * Data relativa para listas: hoje → hora (ou "Hoje"), "Ontem", dia da semana nos
 * últimos 7 dias, e 21/10 (ou 21/10/2025 noutro ano) para mais antigas.
 */
export function formatRelativeDay(value: unknown, today: 'time' | 'label' = 'label'): string {
  const d = toDate(value);
  if (!d) return '';
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return today === 'time' ? formatTime(d) : 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) {
    const weekday = d.toLocaleDateString(getLocale(), { weekday: 'long' });
    const short = weekday.replace(/-feira$/, ''); // "Terça-feira" → "Terça"
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  return d.toLocaleDateString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
