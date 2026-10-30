/**
 * Início do período de faturação atual (as mensagens e envios contam a partir daqui).
 *
 * - Plano grátis: dia 1 do mês.
 * - Plano pago: o dia do mês em que o plano foi ativado, todos os meses (ativado a 15 → o
 *   período vai de 15 a 14). Antes contava-se tudo desde a ativação, sem nunca reiniciar,
 *   e uma conta paga acabava por ficar bloqueada de vez.
 */
export function billingPeriodStart(plan: string | null | undefined, activatedAt: string | Date | null | undefined, now = new Date()): Date {
  const p = (plan || 'free').toLowerCase();
  const activated = activatedAt ? new Date(activatedAt) : null;
  if (p === 'free' || !activated || isNaN(activated.getTime()) || activated > now) {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const day = activated.getDate();
  const startIn = (year: number, month: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay), activated.getHours(), activated.getMinutes(), activated.getSeconds());
  };

  let start = startIn(now.getFullYear(), now.getMonth());
  if (start > now) start = startIn(now.getFullYear(), now.getMonth() - 1);
  return start < activated ? activated : start;
}
