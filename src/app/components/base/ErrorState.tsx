import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Estado de erro (falha ao carregar dados) — mesmo padrão do EmptyState. */
export function ErrorState({
  title = 'Não foi possível carregar os dados',
  description,
  action,
  className,
}: ErrorStateProps) {
  return (
    <Stack
      className={className}
      sx={{ alignItems: 'center', justifyContent: 'center', px: 6, py: 10, textAlign: 'center', width: '100%' }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'error.lighter',
          color: 'error.dark',
          mb: 4,
        }}
      >
        <AlertTriangle size={28} />
      </Box>

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
