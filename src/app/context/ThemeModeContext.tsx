import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// ----------------------------------------------------------------------
// Ponte aditiva entre o dark mode existente (classe `dark` em <html>,
// alternada em Dashboard.tsx via document.documentElement.classList)
// e o tema MUI. Não substitui nem move nenhum estado existente — apenas
// observa a classe já gerida hoje pelo resto da app e reflete-a.
// ----------------------------------------------------------------------

type ThemeMode = 'light' | 'dark';

function readModeFromDom(): ThemeMode {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

const ThemeModeContext = createContext<ThemeMode>('light');

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readModeFromDom);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setMode(readModeFromDom());
    });

    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return <ThemeModeContext.Provider value={mode}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeMode {
  return useContext(ThemeModeContext);
}
