import { Zap } from 'lucide-react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

interface UpgradeButtonProps {
  onClick?: () => void;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  showIcon?: boolean;
  tooltip?: string;
  className?: string;
}

export function UpgradeButton({
  onClick,
  size = 'sm',
  variant = 'outline',
  showIcon = true,
  tooltip = 'Faça upgrade para acessar este recurso',
  className = '',
}: UpgradeButtonProps) {
  const button = (
    <Button
      onClick={onClick}
      size={size}
      variant={variant}
      className={`bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150 border-0 ${className}`}
    >
      {showIcon && <Zap className="w-4 h-4 mr-2" />}
      Upgrade
    </Button>
  );

  if (tooltip && size === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

export function UpgradeIconButton({ onClick, tooltip }: { onClick?: () => void; tooltip?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onClick}
            size="icon"
            variant="ghost"
            className="h-8 w-8 bg-primary text-primary-foreground hover:opacity-90 transition-all duration-150"
          >
            <Zap className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip || 'Faça upgrade para acessar este recurso'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

