import type { Theme } from '@mui/material/styles';

import { cardOverrides } from './card';
import { chipOverrides } from './chip';

// Junta os overrides de componente num único objeto `components`, tal como
// COPIA/src/theme/overrides/index.ts faz para o Minimal Kit. Só cobre os
// componentes MUI reais usados nesta fase (Card/Chip) — os restantes ficam
// como o MUI os define por omissão até serem precisos.
export function componentsOverrides(theme: Theme) {
  return {
    ...cardOverrides(theme),
    ...chipOverrides(theme),
    MuiSvgIcon: {
      defaultProps: {
        fontSize: 'small' as const,
      },
    },
  };
}
