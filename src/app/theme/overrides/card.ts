import type { Theme } from '@mui/material/styles';

// Portado de COPIA/src/theme/overrides/components/card.tsx.
// Nota: o tema do LeadFlow usa spacing base 4 (não os 8 por omissão do MUI,
// ver src/app/theme/index.tsx), por isso os multiplicadores de spacing aqui
// são o dobro dos do Minimal Kit (spacing(6,6,0)/spacing(6) em vez de
// spacing(3,3,0)/spacing(3)) para preservar o mesmo padding em pixels (24px).
export function cardOverrides(theme: Theme) {
  return {
    MuiCard: {
      styleOverrides: {
        root: {
          position: 'relative' as const,
          boxShadow: theme.customShadows.card,
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
