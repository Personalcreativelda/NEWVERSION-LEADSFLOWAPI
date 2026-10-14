import type { ReactNode } from 'react';
import Box from '@mui/material/Box';

type ResponsiveSpacing = number | { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };

interface PageContainerProps {
  children: ReactNode;
  /** Largura máxima do conteúdo. `false` ocupa toda a largura disponível. */
  maxWidth?: number | false;
  /** Padding horizontal (unidades de spacing do tema, base 4px). */
  px?: ResponsiveSpacing;
  /** Padding vertical (unidades de spacing do tema, base 4px). */
  py?: ResponsiveSpacing;
  className?: string;
}

const DEFAULT_MAX_WIDTH = 1720; // alinhado ao max-w-[1720px] já usado em Dashboard.tsx
const DEFAULT_PX: ResponsiveSpacing = { xs: 3, sm: 6 };

/**
 * Wrapper de página: largura máxima centrada + padding responsivo.
 * Puramente presentacional — não gere estado, rotas nem dados.
 */
export function PageContainer({
  children,
  maxWidth = DEFAULT_MAX_WIDTH,
  px = DEFAULT_PX,
  py,
  className,
}: PageContainerProps) {
  return (
    <Box
      className={className}
      sx={{
        width: '100%',
        maxWidth: maxWidth === false ? 'none' : maxWidth,
        mx: 'auto',
        px,
        ...(py !== undefined && { py }),
      }}
    >
      {children}
    </Box>
  );
}
