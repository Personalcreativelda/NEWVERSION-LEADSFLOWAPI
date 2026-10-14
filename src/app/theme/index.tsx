import { useMemo, type ReactNode } from 'react';
import { createTheme, ThemeProvider, type ThemeOptions } from '@mui/material/styles';

import { palette } from './palette';
import { typography } from './typography';
import { shadows } from './shadows';
import { customShadows } from './custom-shadows';
import { breakpoints } from './breakpoints';
import { componentsOverrides } from './overrides';
import { useThemeMode } from '../context/ThemeModeContext';

// ----------------------------------------------------------------------
// Tema MUI portado do Minimal Kit (COPIA/src/theme), adaptado para
// coexistir com o Tailwind já usado no LeadFlow.
//
// Propositadamente NÃO usa <CssBaseline /> — o reset global do MUI
// entraria em conflito com o preflight do Tailwind (que já normaliza
// margens, tipografia base, etc.). Cada componente MUI recebe o seu
// estilo via tema/`sx`; o resto da aplicação continua Tailwind puro.
//
// `spacing: 4` alinha a escala de espaçamento do MUI à do Tailwind
// (theme.spacing(1) = 4px, tal como a classe `p-1`), em vez dos 8px por
// omissão do MUI. `shape.borderRadius: 10` espelha o `--radius: 0.625rem`
// já definido em globals.css, para cantos arredondados MUI/Tailwind
// consistentes lado a lado.
// ----------------------------------------------------------------------

export function createLeadFlowMuiTheme(mode: 'light' | 'dark') {
  const baseThemeOptions: ThemeOptions = {
    palette: palette(mode),
    typography,
    shape: { borderRadius: 10 },
    spacing: 4,
    breakpoints,
    shadows: shadows(mode),
    customShadows: customShadows(mode),
  };

  const baseTheme = createTheme(baseThemeOptions);

  return createTheme(baseTheme, {
    components: componentsOverrides(baseTheme),
  });
}

interface LeadFlowMuiThemeProviderProps {
  mode: 'light' | 'dark';
  children: ReactNode;
}

export function LeadFlowMuiThemeProvider({ mode, children }: LeadFlowMuiThemeProviderProps) {
  const theme = useMemo(() => createLeadFlowMuiTheme(mode), [mode]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

/**
 * Conveniência: lê o modo (light/dark) já refletido pelo ThemeModeContext
 * (que observa a classe `dark` em <html>) e alimenta o ThemeProvider MUI,
 * para não ter de passar `mode` manualmente em cada ponto de uso.
 */
export function AppMuiThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeMode();
  return <LeadFlowMuiThemeProvider mode={mode}>{children}</LeadFlowMuiThemeProvider>;
}
