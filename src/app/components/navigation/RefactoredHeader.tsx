import { useState, useEffect } from 'react';
import { Languages, ArrowLeft, Check } from 'lucide-react';
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
  /** Título da página atual (fora do Início) */
  pageTitle?: string;
  /** Seta de voltar no telemóvel (páginas fora dos separadores da barra inferior) */
  onBack?: () => void;
}

// Idiomas disponíveis
const LANGUAGES = [
  { code: 'pt' as Language, name: 'Português' },
  { code: 'en' as Language, name: 'English' },
  { code: 'es' as Language, name: 'Español' },
  { code: 'fr' as Language, name: 'Français' },
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
  pageTitle,
  onBack,
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

  const isHome = currentPage === 'dashboard';

  const avatar = (align?: 'start') => (
    <AvatarPopover
      user={user}
      onProfile={handleProfile}
      onSettings={onSettings}
      onChangePassword={handleChangePassword}
      onLogout={onLogout}
      language={language}
      isDark={isDark}
      align={align}
    />
  );

  return (
    <header className="flex-shrink-0 sticky top-0 z-30 border-b backdrop-blur-xl bg-background/80 border-border dark:border-[rgba(255,255,255,0.06)] dark:bg-background/90">
      <div className="px-4 lg:px-6 h-14 flex items-center justify-between gap-2">
        {isHome ? (
          // Início: avatar (telemóvel) + saudação
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden -ml-1.5 flex-shrink-0">{avatar('start')}</div>
            {firstName && (
              <div className="min-w-0 leading-tight">
                <p className="text-[11px] text-muted-foreground">{greeting}</p>
                <p className="text-[15px] font-semibold text-foreground truncate max-w-[45vw] lg:max-w-xs">{firstName}</p>
              </div>
            )}
          </div>
        ) : (
          // Outras páginas: voltar (telemóvel, fora dos separadores) + título da página.
          // O título deixa de aparecer em grande dentro da página (ver PageHeader).
          <div className="flex items-center gap-1 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Voltar"
                className="lg:hidden -ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted active:bg-muted transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h1 className="truncate text-[17px] lg:text-lg font-semibold tracking-tight text-foreground">{pageTitle}</h1>
          </div>
        )}

        <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
          {isHome ? (
            <>
              <NotificationBell onNavigate={onNavigate} onStartTour={onStartTour} />

              {/* Idioma */}
              <div className="relative" id="language-selector">
                <button
                  onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
                  className="p-2 rounded-lg transition-all duration-150 group relative hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Idioma"
                  title={t.languagePortuguese}
                >
                  <Languages className="w-4.5 h-4.5" />
                </button>

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
                          <span className="w-7 text-center text-[11px] font-semibold uppercase text-muted-foreground">{lang.code}</span>
                          <span className="text-sm font-medium">{lang.name}</span>
                          {language === lang.code && <Check className="ml-auto h-4 w-4 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <ThemeSelector
                isDark={isDark}
                onToggleTheme={onToggleTheme}
                onThemeChange={onThemeChange}
                themeMode={themeMode}
                language={language}
              />
            </>
          ) : (
            // Ações da página (ex.: personalizar etapas) — o PageHeader desenha-as aqui
            <div id="page-header-actions" className="flex items-center gap-1" />
          )}

          {/* Avatar no desktop (no telemóvel está à esquerda, no Início) */}
          <div className="hidden lg:block h-6 w-px mx-1 bg-border"></div>
          <div id="user-avatar" className="hidden lg:block">{avatar()}</div>
        </div>
      </div>
    </header>
  );
}

