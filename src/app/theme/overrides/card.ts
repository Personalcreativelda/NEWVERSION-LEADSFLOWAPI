import type { Theme } from '@mui/material/styles';

// Portado de COPIA/src/theme/overrides/components/card.tsx.
// Nota: o tema do LeadFlow usa spacing base 4 (não os 8 por omissão do MUI,
// ver src/app/theme/index.tsx), por isso os multiplicadores de spacing aqui
// são o dobro dos do Minimal Kit (spacing(6,6,0)/spacing(6) em vez de
// spacing(3,3,0)/spacing(3)) para preservar o mesmo padding em pixels (24px).
export function cardOverrides(theme: Theme) {
  const isDark = theme.palette.mode === 'dark';
  return {
    // Superfícies MUI usam as mesmas variáveis de cor do resto do app (globals.css)
    // e sem a camada clara de "elevação" que o MUI aplica no modo escuro.
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          position: 'relative' as const,
          backgroundColor: 'hsl(var(--card))',
          boxShadow: isDark ? 'none' : theme.customShadows.card,
          border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : undefined,
          borderRadius: Number(theme.shape.borderRadius) * 2,
          zIndex: 0, // Fix Safari overflow:hidden com border-radius
        },
      },
    },
    MuiCardHeader: {
      defaultProps: {
        titleTypographyProps: { variant: 'h6' as const },
        subheaderTypographyProps: { variant: 'body2' as const, marginTop: theme.spacing(0.5) },
      },
      styleOverrides: {
        root: {
          padding: theme.spacing(6, 6, 0),
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: theme.spacing(6),
        },
      },
    },
  };
}
