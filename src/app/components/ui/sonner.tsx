"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner, ToasterProps, toast } from "sonner";
import { useThemeMode } from "../../context/ThemeModeContext";

// Um aviso com o mesmo texto substitui o que já está no ecrã em vez de empilhar
// outro igual (efeitos repetidos, respostas em duplicado do servidor, etc.).
for (const kind of ["success", "error", "info", "warning", "message"] as const) {
  const original = toast[kind];
  (toast as any)[kind] = (message: any, options?: any) =>
    original(message, { ...(typeof message === "string" ? { id: message } : {}), ...options });
}

// Abaixo de 1024px o painel tem a barra de navegação inferior (64px)
const BOTTOM_NAV_QUERY = "(max-width: 1023px)";

function useHasBottomNav() {
  const [hasBottomNav, setHasBottomNav] = useState(() => window.matchMedia(BOTTOM_NAV_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(BOTTOM_NAV_QUERY);
    const onChange = () => setHasBottomNav(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return hasBottomNav;
}

/**
 * Avisos das ações (toast). As variáveis do tema guardam só os componentes HSL
 * ("220 6% 10%"), por isso as cores têm de ir dentro de hsl(...) — com var(--popover)
 * direto o fundo ficava transparente. No telemóvel/tablet ficam centrados acima da
 * barra de navegação inferior; no desktop em cima ao centro.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeMode();
  const hasBottomNav = useHasBottomNav();
  const aboveNav = { bottom: 80, left: 12, right: 12 };

  return (
    <Sonner
      theme={theme}
      // Desktop em cima ao centro: em baixo à direita tapava os botões dos modais
      position={hasBottomNav ? "bottom-center" : "top-center"}
      offset={hasBottomNav ? aboveNav : 16}
      mobileOffset={aboveNav}
      richColors
      closeButton
      visibleToasts={3}
      className="toaster group"
      style={
        {
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-lg font-sans",
          description: "!text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
