"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner, ToasterProps } from "sonner";
import { useThemeMode } from "../../context/ThemeModeContext";

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
 * barra de navegação inferior; no desktop no canto inferior direito.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeMode();
  const hasBottomNav = useHasBottomNav();
  const aboveNav = { bottom: 80, left: 12, right: 12 };

  return (
    <Sonner
      theme={theme}
      position={hasBottomNav ? "bottom-center" : "bottom-right"}
      offset={hasBottomNav ? aboveNav : 24}
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
