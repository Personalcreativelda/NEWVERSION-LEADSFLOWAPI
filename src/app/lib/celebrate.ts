import { haptic } from '../../native';

/**
 * Momento de sucesso (negócio fechado, tarefa concluída, canal ligado): um visto verde que
 * aparece com um pequeno salto e desaparece sozinho, mais vibração no app. Não bloqueia o
 * ecrã (pointer-events: none). Com "reduzir movimento" aparece sem salto (regra global).
 */
export function celebrate(label = 'Concluído') {
  if (typeof document === 'undefined') return;
  haptic('medium');
  document.getElementById('lf-celebrate')?.remove();

  const el = document.createElement('div');
  el.id = 'lf-celebrate';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.className = 'lf-celebrate';
  el.innerHTML =
    '<div class="lf-celebrate-badge"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="lf-celebrate-check" d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>';
  const text = document.createElement('span');
  text.className = 'sr-only';
  text.textContent = label;
  el.appendChild(text);
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1300);
}
