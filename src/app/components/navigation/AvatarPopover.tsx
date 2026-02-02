import { User, Settings, LogOut, Lock } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Language, translations } from '../../utils/i18n';

interface AvatarPopoverProps {
  user: any;
  onProfile: () => void;
  onSettings: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  language: Language;
  isDark?: boolean;
}

export default function AvatarPopover({
  user,
  onProfile,
  onSettings,
  onChangePassword,
  onLogout,
  language,
  isDark = true,
}: AvatarPopoverProps) {
  const t = translations[language];
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center rounded-lg p-1.5 transition-all focus:outline-none group hover:bg-muted">
          <Avatar className="h-8 w-8 ring-2 transition-all ring-border group-hover:ring-purple-500">
            <AvatarImage src={user?.avatar_url} alt={user?.name || 'User'} />
            <AvatarFallback className="text-xs bg-gradient-to-br from-purple-500 to-blue-600 text-white font-semibold">
              {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-2 bg-card border-border">
        {/* User Info Header */}
        <div className="px-3 py-3 mb-1">
          <p className="text-sm font-semibold text-foreground">
            {user?.name || 'Usuário'}
          </p>
          <p className="text-xs mt-0.5 text-muted-foreground">
            {user?.email || 'user@example.com'}
          </p>
        </div>
        
        <DropdownMenuSeparator className="bg-border my-1" />
        
        <DropdownMenuItem 
          onClick={onSettings} 
          className="px-3 py-2.5 rounded-lg cursor-pointer hover:bg-muted focus:bg-muted text-foreground"
        >
          <Settings className="w-4 h-4 mr-3 text-purple-500" />
          <span className="text-sm">{t.accountSettings}</span>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator className="bg-border my-1" />
        
        <DropdownMenuItem 
          onClick={onLogout} 
          className="px-3 py-2.5 rounded-lg cursor-pointer text-red-500 hover:bg-red-500/20 focus:bg-red-500/20"
        >
          <LogOut className="w-4 h-4 mr-3" />
          <span className="text-sm font-medium">{t.logout}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

