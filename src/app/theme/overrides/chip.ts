import { alpha, type Theme } from '@mui/material/styles';
import type { ChipProps } from '@mui/material/Chip';
import { chipClasses } from '@mui/material/Chip';

// Versão simplificada de COPIA/src/theme/overrides/components/chip.tsx —
// mantém a variante "soft" (usada pelo StatusBadge) e o radius/peso de fonte
// base; remove a dependência do Iconify do template (LeadFlow usa
// lucide-react) e os ramos "filled"/"outlined" de cor "default" que nenhum
// componente atual do LeadFlow usa.

declare module '@mui/material/Chip' {
  interface ChipPropsVariantOverrides {
    soft: true;
  }
}

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'] as const;

export function chipOverrides(theme: Theme) {
  const isLight = theme.palette.mode === 'light';

  const rootStyles = (ownerState: ChipProps) => {
    const softVariant = ownerState.variant === 'soft';

    const colorStyle = COLORS.map((color) => ({
      ...(ownerState.color === color &&
        softVariant && {
          color: theme.palette[color][isLight ? 'dark' : 'light'],
          backgroundColor: alpha(theme.palette[color].main, 0.16),
          '&:hover': {
            backgroundColor: alpha(theme.palette[color].main, 0.32),
          },
        }),
    }));

    const disabledState = {
      [`&.${chipClasses.disabled}`]: {
        opacity: 1,
        color: theme.palette.action.disabled,
        backgroundColor: theme.palette.action.disabledBackground,
      },
    };

    return [
      ...colorStyle,
      disabledState,
      {
        fontWeight: 600,
        borderRadius: theme.shape.borderRadius,
      },
    ];
  };

  return {
    MuiChip: {
      styleOverrides: {
        root: ({ ownerState }: { ownerState: ChipProps }) => rootStyles(ownerState),
      },
    },
  };
}
