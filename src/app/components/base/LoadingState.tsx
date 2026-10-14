import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

interface LoadingStateProps {
  message?: string;
  /** Altura mínima da área de loading */
  minHeight?: number | string;
  className?: string;
}

/**
 * Spinner genérico de carregamento. Para listas/cartões específicos, prefere
 * os skeletons já existentes em src/app/components/ui/skeletons.tsx — este
 * componente cobre os casos sem skeleton dedicado.
 */
export function LoadingState({ message, minHeight = 240, className }: LoadingStateProps) {
  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        minHeight,
        width: '100%',
      }}
    >
      <CircularProgress size={32} />
      {message && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {message}
        </Typography>
      )}
    </Box>
  );
}
