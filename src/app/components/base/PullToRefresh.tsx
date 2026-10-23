import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { haptic } from '../../../native';

interface PullToRefreshProps {
  /** Recarrega os dados da página; o indicador fica a rodar até a promessa terminar */
  onRefresh: () => Promise<unknown> | void;
  /** Desligado (ex.: desktop, onde não há gesto de puxar) */
  disabled?: boolean;
}

const THRESHOLD = 72; // px a puxar para recarregar
const MAX_PULL = 110;

/** Algum elemento entre o alvo e o body já tem scroll para cima? Então o gesto é desse scroll. */
function isInsideScrolledArea(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight && el.scrollTop > 0) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Puxar para recarregar (no lugar dos botões de "atualizar"): no topo da página, puxar
 * para baixo mostra uma seta que roda e, passado o limite, recarrega. Ignora o gesto
 * quando há um modal aberto ou quando a área tocada ainda tem scroll para subir.
 */
export function PullToRefresh({ onRefresh, disabled }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);
  const armed = useRef(false);

  useEffect(() => {
    if (disabled) return;

    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1) return;
      if (window.scrollY > 0 || document.querySelector('[role="dialog"]')) return;
      if (isInsideScrolledArea(e.target)) return;
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    };

    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy) {
        start.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Resistência: puxar fica mais "pesado" à medida que desce
      const value = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = value;
      setPull(value);
      if (value >= THRESHOLD && !armed.current) {
        armed.current = true;
        haptic();
      } else if (value < THRESHOLD) {
        armed.current = false;
      }
    };

    const onEnd = async () => {
      if (!start.current) return;
      start.current = null;
      const reached = pullRef.current >= THRESHOLD;
      armed.current = false;
      pullRef.current = 0;
      if (!reached) {
        setPull(0);
        return;
      }
      setRefreshing(true);
      setPull(THRESHOLD * 0.75);
      try {
        await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 600))]);
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled, onRefresh, refreshing]);

  if (disabled || (pull === 0 && !refreshing)) return null;

  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      className="pointer-events-none fixed left-1/2 z-[29] -translate-x-1/2"
      style={{ top: `calc(3.5rem + ${pull * 0.6}px)`, transition: start.current ? 'none' : 'top 200ms ease' }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-primary shadow-md">
        {refreshing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ArrowDown
            className="h-5 w-5 transition-transform"
            style={{ transform: `rotate(${progress >= 1 ? 180 : progress * 150}deg)`, opacity: 0.4 + progress * 0.6 }}
          />
        )}
      </div>
      {refreshing && <span className="sr-only">A atualizar</span>}
    </div>
  );
}
