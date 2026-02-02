import { Moon, Sun } from 'lucide-react';
import { Language, translations } from '../../utils/i18n';

type ThemeMode = 'light' | 'dark';

interface ThemeSelectorProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onThemeChange?: (theme: ThemeMode) => void;
  themeMode?: ThemeMode;
  language: Language;
}

export default function ThemeSelector({
  isDark, 
  onToggleTheme,
  onThemeChange,
  themeMode = 'light',
  language,
}: ThemeSelectorProps) {
  const t = translations[language];

  // ✅ Toggle direto ao clicar - alterna entre light e dark
  const handleToggle = () => {
    const newTheme: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    if (onThemeChange) {
      onThemeChange(newTheme);
    } else {
      onToggleTheme();
    }
  };

  return (
    <button
      onClick={handleToggle}
      className="relative p-2 rounded-lg transition-all duration-300 ease-in-out hover:bg-muted text-muted-foreground hover:text-purple-500 group"
      title={themeMode === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
      aria-label={themeMode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
    >
      {/* Container para animação suave */}
      <div className="relative w-5 h-5">
        {/* Sol - visível no modo escuro */}
        <Sun 
          className={`absolute inset-0 w-5 h-5 transition-all duration-300 ease-in-out transform ${
            themeMode === 'dark' 
              ? 'opacity-100 rotate-0 scale-100' 
              : 'opacity-0 rotate-90 scale-50'
          }`}
        />
        {/* Lua - visível no modo claro */}
        <Moon 
          className={`absolute inset-0 w-5 h-5 transition-all duration-300 ease-in-out transform ${
            themeMode === 'light' 
              ? 'opacity-100 rotate-0 scale-100' 
              : 'opacity-0 -rotate-90 scale-50'
          }`}
        />
      </div>
    </button>
  );
}

