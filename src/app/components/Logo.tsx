import { Zap } from 'lucide-react';

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 40, className = "" }: LogoProps) {
  return (
    <div 
      className={`bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg ${className}`}
      style={{ width: size, height: size }}
    >
      <Zap className="text-white" style={{ width: size * 0.6, height: size * 0.6 }} />
    </div>
  );
}

export function LogoWithText({ size = 40, showText = true }: LogoProps & { showText?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Logo size={size} />
      {showText && (
        <span className="text-gray-900 dark:text-white">
          LeadFlow CRM
        </span>
      )}
    </div>
  );
}

