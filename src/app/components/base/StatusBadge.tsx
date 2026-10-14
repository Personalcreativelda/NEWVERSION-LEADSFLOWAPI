import Chip from '@mui/material/Chip';

export type StatusTone = 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

/**
 * Etiqueta de estado (ex.: "Ativo", "Pendente", "Falhou") no visual "soft"
 * do Minimal Kit — ver src/app/theme/overrides/chip.ts. MUI Chip real
 * (presentacional, sem foco/portal).
 */
export function StatusBadge({ label, tone = 'default', className }: StatusBadgeProps) {
  return (
    <Chip
      className={className}
      label={label}
      size="small"
      variant={tone === 'default' ? 'outlined' : 'soft'}
      color={tone === 'default' ? undefined : tone}
    />
  );
}
