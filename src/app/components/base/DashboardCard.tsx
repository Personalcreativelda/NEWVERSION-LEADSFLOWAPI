import type { CSSProperties, ReactNode } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

interface DashboardCardProps {
  title?: ReactNode;
  subheader?: ReactNode;
  /** Ação no canto superior direito do cabeçalho (ex.: menu de opções) */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Remove o padding interno do CardContent (útil para tabelas/gráficos) */
  disableContentPadding?: boolean;
}

/**
 * Cartão de dashboard com o visual do Minimal Kit (sombra `customShadows.card`,
 * radius em dobro, cabeçalho tipográfico consistente) — ver
 * src/app/theme/overrides/card.ts. Usa MUI Card real (componente
 * presentacional, sem risco de foco/portal).
 */
export function DashboardCard({
  title,
  subheader,
  action,
  children,
  className,
  style,
  disableContentPadding = false,
}: DashboardCardProps) {
  return (
    <Card className={className} style={style}>
      {(title || subheader) && <CardHeader title={title} subheader={subheader} action={action} />}
      <CardContent sx={disableContentPadding ? { p: '0 !important' } : undefined}>
        {children}
      </CardContent>
    </Card>
  );
}
