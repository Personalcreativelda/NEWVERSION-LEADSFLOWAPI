import { useState, useEffect } from 'react';
import { Menu, Moon, Sun, Bell, X, Languages, ChevronDown } from 'lucide-react';
import AvatarPopover from './AvatarPopover';
import ThemeSelector from './ThemeSelector';
import { NotificationBell } from '../dashboard/NotificationBell';
import { Language, loadLanguage, saveLanguage, translations } from '../../utils/i18n';

interface RefactoredHeaderProps {
  user: any;
  isDark: boolean;
  onToggleTheme: () => void;
  onThemeChange?: (mode: 'light' | 'dark' | 'system') => void;
  themeMode: 'light' | 'dark';
  onNovoLead: () => void;
  onEmailMarketing: () => void;
  onMassMessage: () => void;
  onSettings: () => void;
  onLogout: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onStartTour?: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

// Idiomas disponíveis
const LANGUAGES = [
  { code: 'pt' as Language, flag: '🇵🇹', name: 'Português' },
  { code: 'en' as Language, flag: '🇬🇧', name: 'English' },
  { code: 'es' as Language, flag: '🇪🇸', name: 'Español' },
  { code: 'fr' as Language, flag: '🇫🇷', name: 'Français' },
];

export default function RefactoredHeader({
  user,
  isDark,
  onToggleTheme,
  onThemeChange,
  themeMode,
  onNovoLead,
  onEmailMarketing,
  onMassMessage,
  onSettings,
  onLogout,
  isSidebarOpen,
  onToggleSidebar,
  onStartTour,
  language,
  onLanguageChange,
  currentPage,
  onNavigate,
}: RefactoredHeaderProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  const t = translations[language];
  const currentLanguage = LANGUAGES.find(lang => lang.code === language) || LANGUAGES[0];

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#language-selector')) {
        setLanguageMenuOpen(false);
      }
    };

    if (languageMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [languageMenuOpen]);

  const handleProfile = () => {
    navigate('/dashboard/account');
  };

  const handleChangePassword = () => {
    navigate('/dashboard/account');
  };

  const handleLanguageChange = (lang: Language) => {
    onLanguageChange(lang);
    saveLanguage(lang);
    setLanguageMenuOpen(false);
  };

  return (
    <header className="flex-shrink-0 sticky top-0 z-[1000] border-b backdrop-blur-xl bg-background/80 border-border dark:border-[rgba(255,255,255,0.06)] dark:bg-[hsl(220,6%,10%)]/90">
      <div className="px-4 lg:px-6 h-14 flex items-center justify-between">
        {/* Left Section: Hamburger APENAS NO MOBILE */}
        <div className="flex items-center lg:hidden">
          {/* Hamburger Menu - APENAS MOBILE (<1024px) */}
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg transition-all duration-200 group hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? (
              <X className="w-5 h-5 transition-colors" />
            ) : (
              <Menu className="w-5 h-5 transition-colors" />
            )}
          </button>
        </div>

        {/* Desktop: Left section vazia */}
        <div className="hidden lg:block"></div>

        {/* Right Section: Notificações + Idioma + Theme + Avatar + Logout */}
        <div className="flex items-center gap-0.5 ml-auto">
          {/* Notification Center */}
          <NotificationBell onNavigate={onNavigate} onStartTour={onStartTour} />

          {/* Language Selector */}
          <div className="relative" id="language-selector">
            <button
              onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
              className="p-2 rounded-lg transition-all duration-150 group relative hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Select language"
              title={t.languagePortuguese}
            >
              <Languages className="w-4.5 h-4.5" />
            </button>

            {/* Language Dropdown */}
            {languageMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[1100] bg-card border border-border">
                <div className="p-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={`w-full px-3 py-2 text-left flex items-center gap-3 rounded-lg transition-colors duration-100 ${language === lang.code
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-muted'
                        }`}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      <span className="text-sm font-medium">{lang.name}</span>
                      {language === lang.code && (
                        <span className="ml-auto text-primary text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <ThemeSelector
            isDark={isDark}
            onToggleTheme={onToggleTheme}
            onThemeChange={onThemeChange}
            themeMode={themeMode}
            language={language}
          />

          {/* Divider */}
          <div className="h-6 w-px mx-1 bg-border"></div>

          {/* Avatar Popover */}
          <div id="user-avatar">
            <AvatarPopover
              user={user}
              onProfile={handleProfile}
              onSettings={onSettings}
              onChangePassword={handleChangePassword}
              onLogout={onLogout}
              language={language}
              isDark={isDark}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

