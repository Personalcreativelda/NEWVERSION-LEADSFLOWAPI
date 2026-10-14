import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Caminho da imagem (ver public/assets/icons/empty/) */
  imgSrc?: string;
  action?: ReactNode;
  className?: string;
}

const DEFAULT_IMG = '/assets/icons/empty/ic_content.svg';

/**
 * Estado vazio (sem resultados, lista sem itens) — mesmo padrão do
 * `EmptyContent` do Minimal Kit: imagem + título + descrição + ação.
 */
export function EmptyState({
  title,
  description,
  imgSrc = DEFAULT_IMG,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Stack
      className={className}
      sx={{ alignItems: 'center', justifyContent: 'center', px: 6, py: 10, textAlign: 'center', width: '100%' }}
    >
      <Box component="img" src={imgSrc} alt="" aria-hidden sx={{ width: '100%', maxWidth: 160, mb: 4 }} />

      <Typography variant="h6" sx={{ color: 'text.disabled' }}>
        {title}
      </Typography>

      {description && (
        <Typography variant="body2" sx={{ color: 'text.disabled', mt: 1, maxWidth: 360 }}>
          {description}
        </Typography>
      )}

      {action && <Box sx={{ mt: 4 }}>{action}</Box>}
    </Stack>
  );
}
