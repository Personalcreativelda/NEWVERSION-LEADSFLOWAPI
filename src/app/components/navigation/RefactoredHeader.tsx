import { useState, useEffect } from 'react';
import { Languages } from 'lucide-react';
import AvatarPopover from './AvatarPopover';
import ThemeSelector from './ThemeSelector';
import { NotificationBell } from '../dashboard/NotificationBell';
import { Language, saveLanguage, translations } from '../../utils/i18n';

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

const GREETINGS: Record<string, string> = { pt: 'Olá', en: 'Hello', es: 'Hola', fr: 'Bonjour' };

export default function RefactoredHeader({
  user,
  isDark,
  onToggleTheme,
  onThemeChange,
  themeMode,
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
  const firstName = String(user?.name || user?.email?.split('@')[0] || '').trim().split(/\s+/)[0];
  const greeting = GREETINGS[language] || GREETINGS.pt;

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
    onNavigate?.('account');
  };

  const handleChangePassword = () => {
    onNavigate?.('account');
  };

  const handleLanguageChange = (lang: Language) => {
    onLanguageChange(lang);
    saveLanguage(lang);
    setLanguageMenuOpen(false);
  };

  return (
    <header className="flex-shrink-0 sticky top-0 z-[1000] border-b backdrop-blur-xl bg-background/80 border-border dark:border-[rgba(255,255,255,0.06)] dark:bg-background/90">
      <div className="px-4 lg:px-6 h-14 flex items-center justify-between">
        {/* Esquerda: no mobile (<1024px) o avatar do perfil seguido da saudação; no desktop
            só a saudação (o avatar fica à direita). Sem título nem ☰ — a barra inferior
            já indica a página e abre o menu. */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="lg:hidden -ml-1.5 flex-shrink-0">
            <AvatarPopover
              user={user}
              onProfile={handleProfile}
              onSettings={onSettings}
              onChangePassword={handleChangePassword}
              onLogout={onLogout}
              language={language}
              isDark={isDark}
              align="start"
            />
          </div>
          {firstName && (
            <div className="min-w-0 leading-tight">
              <p className="text-[11px] text-muted-foreground">{greeting} 👋</p>
              <p className="text-[15px] font-semibold text-foreground truncate max-w-[45vw] lg:max-w-xs">{firstName}</p>
            </div>
          )}
        </div>

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

          {/* Divider + Avatar (desktop; no mobile o avatar está à esquerda) */}
          <div className="hidden lg:block h-6 w-px mx-1 bg-border"></div>

          <div id="user-avatar" className="hidden lg:block">
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

