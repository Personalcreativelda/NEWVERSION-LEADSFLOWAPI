import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Ações do lado direito (botões, filtros, etc.) */
  actions?: ReactNode;
  className?: string;
}

/** Cabeçalho de página: título + subtítulo + slot de ações. */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <Stack
      className={className}
      direction={{ xs: 'column', sm: 'row' }}
      spacing={4}
      sx={{
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        mb: 6,
      }}
    >
      <Box>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {subtitle}
          </Typography>
        )}
      </Box>

      {actions && (
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
