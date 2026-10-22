import { matchesSearch } from '../../utils/search';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Zap, UserCog, LogOut, ChevronRight, Search, PanelLeft, HelpCircle, Crown, LifeBuoy
} from 'lucide-react';
import { LayoutDashboard, Users, BarChart3, Megaphone, Settings, MessageSquare, Star, Activity } from 'lucide-react';
import { Language, translations, Translations } from '../../utils/i18n';
import { sidebarConfig, SidebarItemConfig } from '../../config/sidebarConfig';
import SidebarGroup from './SidebarGroup';
import InboxTreeMenu from './InboxTreeMenu';
import { isNativeApp, openSupportChat } from '../../../native';

// Mapeamento de path para page id
export const pathToPageId: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/dashboard/leads': 'leads',
  '/dashboard/inbox': 'inbox',
  '/dashboard/inbox/settings': 'inbox-settings',
  '/dashboard/ai-assistants': 'ai-assistants',
  '/dashboard/voice-agents': 'voice-agents',
  '/dashboard/automations': 'automations',
  '/dashboard/funnel': 'funnel',
  '/dashboard/analytics': 'analytics',
  '/dashboard/tasks': 'tasks',
  '/dashboard/campaigns': 'campaigns',
  '/dashboard/remarketing': 'remarketing',
  '/dashboard/ai-insights': 'ai-insights',
  '/dashboard/plan': 'plan',
  '/dashboard/integrations': 'integrations',
  '/dashboard/security': 'security',
  '/dashboard/account': 'account',
  '/admin': 'admin',
};

// Sidebar width constraints
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

interface NavigationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isMobile?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  user: any;
  language: Language;
  onLogout?: () => void;
  onHelp?: () => void;
  onFeedback?: () => void;
  currentPage?: string;
  onNavigate?: (page: string) => void;
  sidebarWidth?: number;
  onSidebarWidthChange?: (width: number) => void;
}

export default function NavigationSidebar({
  isOpen,
  onClose,
  isMobile = false,
  isCollapsed = false,
  onToggleCollapse,
  user,
  language,
  onLogout,
  onHelp,
  onFeedback,
  currentPage = 'dashboard',
  onNavigate,
  sidebarWidth = SIDEBAR_DEFAULT_WIDTH,
  onSidebarWidthChange,
}: NavigationSidebarProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(currentPage === 'admin');
  const [adminActiveSubTab, setAdminActiveSubTab] = useState<string>('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(SIDEBAR_DEFAULT_WIDTH);

  const adminSubItems = [
    { id: 'dashboard', label: 'Metricas', icon: LayoutDashboard },
    { id: 'users', label: 'Usu\u00e1rios', icon: Users },
    { id: 'activity', label: 'Atividade', icon: BarChart3 },
    { id: 'marketing', label: 'Marketing', icon: Megaphone },
    { id: 'feedback', label: 'Feedbacks', icon: MessageSquare },
    { id: 'diagnostics', label: 'Diagn\u00f3sticos', icon: Activity },
    { id: 'settings', label: 'Configura\u00e7\u00f5es', icon: Settings },
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [profileMenuOpen]);

  useEffect(() => {
    if (currentPage === 'admin') {
      setAdminExpanded(true);
    }
  }, [currentPage]);

  const isAdmin = user?.isAdmin === true || user?.email === 'admin@leadflow.com';
  const t = translations[language];

  // Procura no nome, secção, palavras-chave (sinónimos e sub-páginas, ex.: "leads",
  // "whatsapp", "senha") e nos sub-itens
  const isSearching = sidebarSearch.trim().length > 0;
  const filteredSidebarConfig = isSearching
    ? sidebarConfig.filter(item =>
        matchesSearch(
          sidebarSearch,
          t[item.labelKey as keyof Translations],
          item.sectionLabel,
          item.keywords,
          item.id,
          ...(item.children || []).map(child => t[child.labelKey as keyof Translations]),
        )
      )
    : sidebarConfig;
  const showAdminInSearch = isAdmin && (!isSearching ||
    matchesSearch(sidebarSearch, t.admin, 'admin administracao', ...adminSubItems.map(sub => sub.label)));

  // Enter abre o primeiro resultado; Escape limpa
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSidebarSearch('');
      return;
    }
    if (e.key !== 'Enter') return;
    const first = filteredSidebarConfig[0];
    if (first) {
      handleItemClick(pathToPageId[first.path] || first.id);
    } else if (showAdminInSearch && isSearching) {
      handleItemClick('admin');
    } else {
      return;
    }
    setSidebarSearch('');
  };

  // --- Resize logic ---
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, resizeStartWidth.current + delta));
      onSidebarWidthChange?.(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, onSidebarWidthChange]);

  // --- Navigation ---
  const handleItemClick = (pageId: string, queryParams?: Record<string, string>) => {
    if (onNavigate) {
      onNavigate(pageId);
    }
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const queryString = params.toString();
      const newUrl = queryString ? `/dashboard/${pageId}?${queryString}` : `/dashboard/${pageId}`;
      window.history.replaceState({}, '', newUrl);
    } else if (pageId === 'inbox') {
      window.history.replaceState({}, '', '/dashboard/inbox');
    }
    if (isMobile) {
      onClose();
    }
  };

  // --- Render item ---
  const renderItem = (item: SidebarItemConfig) => {
    const Icon = item.icon;
    const pageId = pathToPageId[item.path] || item.id;
    const isActive = !item.children && currentPage === pageId;

    if (item.children) {
      const isAnyChildActive = currentPage === pageId ||
        item.children.some(child => currentPage === pathToPageId[child.path]) ||
        (item.id === 'inbox' && currentPage.startsWith('inbox'));

      if (item.id === 'inbox') {
        return (
          <React.Fragment key={item.id}>
            {item.sectionLabel && !isSearching && (
              isCollapsed
                ? <li className="sidebar-collapsed-divider" />
                : <li className="px-3 pt-6 pb-1.5 sidebar-section-label">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--sidebar-muted))] opacity-60">
                      {item.sectionLabel}
                    </span>
                  </li>
            )}
            <SidebarGroup
              label={t[item.labelKey as keyof Translations]}
              icon={Icon}
              isActive={isAnyChildActive}
              isCollapsed={isCollapsed}
            >
              <InboxTreeMenu
                currentPage={currentPage}
                onNavigate={handleItemClick}
                isExpanded={true}
                translations={t}
              />
            </SidebarGroup>
          </React.Fragment>
        );
      }

      return (
        <React.Fragment key={item.id}>
          {item.sectionLabel && !isSearching && (
            isCollapsed
              ? <li className="sidebar-collapsed-divider" />
              : <li className="px-3 pt-6 pb-1.5 sidebar-section-label">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--sidebar-muted))] opacity-60">
                    {item.sectionLabel}
                  </span>
                </li>
          )}
          <SidebarGroup
            label={t[item.labelKey as keyof Translations]}
            icon={Icon}
            isActive={isAnyChildActive}
            isCollapsed={isCollapsed}
          >
            {item.children.map((child) => {
              const childPageId = pathToPageId[child.path] || child.id;
              const isChildActive = currentPage === childPageId;
              return (
                <li key={child.id}>
                  <button
                    onClick={() => handleItemClick(childPageId)}
                    className={`sidebar-nav-subitem w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-md transition-all duration-150 group ${isChildActive ? 'active' : ''}`}
                  >
                    <div className="sidebar-nav-bullet w-1.5 h-1.5 rounded-full transition-colors flex-shrink-0" />
                    <span className="text-[14px] truncate">{t[child.labelKey as keyof Translations]}</span>
                  </button>
                </li>
              );
            })}
          </SidebarGroup>
        </React.Fragment>
      );
    }

    // Leaf item
    return (
      <React.Fragment key={item.id}>
        {item.sectionLabel && !isSearching && (
          isCollapsed
            ? <li className="sidebar-collapsed-divider" />
            : <li className="px-3 pt-6 pb-1.5 sidebar-section-label">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[hsl(var(--sidebar-muted))] opacity-60">
                  {item.sectionLabel}
                </span>
              </li>
        )}
        <li className={`relative ${isCollapsed ? 'group flex justify-center py-[3px] px-2' : ''}`}>
          {isCollapsed ? (
            <button
              onClick={() => handleItemClick(pageId)}
              className={`sidebar-icon-btn ${isActive ? 'sidebar-icon-btn-active' : 'sidebar-icon-btn-inactive'}`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
            </button>
          ) : (
            <button
              onClick={() => handleItemClick(pageId)}
              className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-[14px] font-medium relative ${
                isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
              }`}
            >
              <Icon className={`w-[20px] h-[20px] flex-shrink-0 transition-colors duration-150 ${
                isActive ? 'text-[hsl(var(--sidebar-primary))]' : ''
              }`} />
              <span className="truncate transition-colors duration-150">
                {t[item.labelKey as keyof Translations]}
              </span>
            </button>
          )}
          {/* CSS tooltip — collapsed only, triggered by group-hover on <li> */}
          {isCollapsed && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-[500] pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
              <div className="sidebar-tooltip px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap">
                {t[item.labelKey as keyof Translations]}
              </div>
            </div>
          )}
        </li>
      </React.Fragment>
    );
  };

  const computedWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;
  const drawerOpen = isMobile && isOpen;

  // Gaveta no telemóvel: fecha com o botão "voltar" do Android e com Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onNativeBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('native-back', onNativeBack);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('native-back', onNativeBack);
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen, onClose]);

  // Arrastar para a esquerda fecha a gaveta; ela acompanha o dedo enquanto arrasta
  const [dragX, setDragX] = useState(0);
  const touchStart = useRef<{ x: number; y: number; t: number; horizontal: boolean | null } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!drawerOpen) return;
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, t: Date.now(), horizontal: null };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const touch = e.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (start.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      start.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (start.horizontal) setDragX(Math.min(0, dx));
  };

  const handleTouchEnd = () => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start?.horizontal) return;
    const width = sidebarRef.current?.offsetWidth || 300;
    const velocity = Math.abs(dragX) / Math.max(1, Date.now() - start.t);
    if (dragX < -width * 0.3 || (dragX < -30 && velocity > 0.5)) onClose();
    setDragX(0);
  };

  const userInitials = (user?.name || user?.email || 'U')
    .split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      {/* Overlay - mobile only. Fica por cima do cabeçalho e da barra inferior, por
          isso tocar em qualquer sítio fora da gaveta fecha-a. */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-[46] bg-black/50 transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={dragX ? { opacity: Math.max(0, 1 + dragX / 300), transition: 'none' } : undefined}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
        aria-hidden={isMobile && !isOpen ? true : undefined}
        className={`sidebar-root flex flex-col flex-shrink-0 ${
          isMobile
            // Fechado: sem sombra — fora do ecrã ela aparecia como uma linha na borda esquerda
            ? `sidebar-mobile fixed top-0 left-0 z-[47] h-[100dvh] w-[85vw] max-w-[320px] rounded-r-2xl overflow-hidden ease-[cubic-bezier(0.32,0.72,0,1)] ${dragX ? '' : 'transition-transform duration-300'} ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full shadow-none!'}`
            : `fixed top-0 left-0 h-screen z-40 ${isResizing ? '' : 'transition-[width] duration-200 ease-out'}`
        }`}
        style={!isMobile ? { width: computedWidth } : dragX ? { transform: `translateX(${dragX}px)` } : undefined}
      >
        <div className="flex flex-col h-full">

          {/* Logo + collapse toggle */}
          <div className={`sidebar-logo-section flex-shrink-0 flex items-center min-h-[56px] ${
            isCollapsed ? 'justify-center px-3 py-4' : 'gap-3 px-4 py-4'
          }`}>
            {isCollapsed ? (
              /* Collapsed: just the toggle button to expand */
              !isMobile && onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title="Expandir menu"
                    className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-border))]">
                  <PanelLeft className="w-[18px] h-[18px] rotate-180" />
                </button>
              )
            ) : (
              /* Expanded: logo + name + toggle on right */
              <>
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-bold leading-tight truncate text-[hsl(var(--sidebar-foreground))]">LeadsFlow</p>
                  <p className="text-[11.5px] truncate text-[hsl(var(--sidebar-muted))]">Sales & Automation</p>
                </div>
                {!isMobile && onToggleCollapse && (
                  <button
                    onClick={onToggleCollapse}
                    title="Recolher menu"
                    className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-150 text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-border))]"
                  >
                    <PanelLeft className="w-[16px] h-[16px]" />
                  </button>
                )}
                {/* Mobile: fechar na mesma linha do logótipo (sem a barra "Menu" à parte) */}
                {isMobile && (
                  <button
                    onClick={onClose}
                    aria-label="Fechar menu"
                    className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full flex-shrink-0 transition-colors duration-150 text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-border))]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Navigation */}
          <nav id="sidebar-navigation" className={`sidebar-nav flex-1 flex flex-col min-h-0 ${isCollapsed ? 'sidebar-scroll-fade overflow-y-auto scrollbar-none' : 'overflow-y-auto'}`}>
            {!isCollapsed && (
              <div className="px-3 pt-1.5 pb-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--sidebar-muted))] pointer-events-none" />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={e => setSidebarSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar páginas..."
                    aria-label="Buscar páginas"
                    className="sidebar-search-input w-full pl-8 pr-3 py-[7px] text-[12px] rounded-md"
                  />
                </div>
              </div>
            )}
            <div className="px-2 pt-3 pb-1 flex-1">
            <ul className="space-y-1">
              {filteredSidebarConfig.map(renderItem)}

              {isSearching && filteredSidebarConfig.length === 0 && !showAdminInSearch && !isCollapsed && (
                <li className="px-3 py-6 text-center">
                  <Search className="w-5 h-5 mx-auto mb-2 text-[hsl(var(--sidebar-muted))] opacity-60" />
                  <p className="text-[13px] text-[hsl(var(--sidebar-foreground)/0.7)]">Nada encontrado</p>
                  <p className="text-[12px] mt-0.5 text-[hsl(var(--sidebar-muted))]">Tente outro termo, ex.: "leads" ou "whatsapp"</p>
                </li>
              )}

              {/* Admin */}
              {showAdminInSearch && (
                <li className={`pt-2 mt-2 relative ${isCollapsed ? 'group flex justify-center pb-0.5 px-2' : ''}`}>
                  {!isCollapsed && (
                    <div className="absolute top-0 left-3 right-3 h-px bg-[hsl(var(--sidebar-border))]" />
                  )}
                  {isCollapsed ? (
                    <button
                      onClick={() => handleItemClick('admin')}
                      className={`sidebar-icon-btn ${
                        currentPage === 'admin' ? 'sidebar-icon-btn-active' : 'sidebar-icon-btn-inactive'
                      }`}
                    >
                      <UserCog className="w-5 h-5 flex-shrink-0" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setAdminExpanded(e => !e)}
                      className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all duration-150 text-[14px] font-medium relative ${
                        currentPage === 'admin' ? 'sidebar-item-active' : 'sidebar-item-inactive'
                      }`}
                    >
                    <UserCog className={`w-5 h-5 flex-shrink-0 transition-colors duration-150 ${
                      currentPage === 'admin' ? 'text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-muted))]'
                    }`} />
                    <span className={`flex-1 truncate text-left transition-colors duration-150 ${
                      currentPage === 'admin' ? 'text-[hsl(var(--sidebar-foreground))]' : ''
                    }`}>{t.admin}</span>
                    <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
                      adminExpanded ? 'rotate-90' : ''
                    } ${currentPage === 'admin' ? 'text-[hsl(var(--sidebar-muted))]' : 'text-[hsl(var(--sidebar-muted))]'}`} />
                  </button>
                  )}

                  {/* CSS tooltip for admin icon — collapsed only */}
                  {isCollapsed && (
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-[500] pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
                      <div className="sidebar-tooltip px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap">
                        {t.admin || 'Admin'}
                      </div>
                    </div>
                  )}

                  {!isCollapsed && (
                    <div className={`overflow-hidden transition-all duration-200 ease-out ${
                      adminExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
                    }`}>
                      <div className="sidebar-tree-children mt-0.5 mb-0.5">
                        <ul className="py-0.5 space-y-0.5">
                          {adminSubItems.map((sub) => {
                            const SubIcon = sub.icon;
                            const isSubActive = currentPage === 'admin' && adminActiveSubTab === sub.id;
                            return (
                              <li key={sub.id}>
                                <button
                                  onClick={() => {
                                    sessionStorage.setItem('adminInitialTab', sub.id);
                                    setAdminActiveSubTab(sub.id);
                                    handleItemClick('admin');
                                    window.dispatchEvent(new CustomEvent('adminTabChange', { detail: sub.id }));
                                  }}
                                  className={`sidebar-nav-subitem w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-md transition-all duration-150 text-[14px] ${isSubActive ? 'active' : ''}`}
                                >
                                  <SubIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="truncate">{sub.label}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  )}
                </li>
              )}
            </ul>
            </div>
          </nav>

          {/* Footer */}
          <div className="relative sidebar-footer-border flex-shrink-0" ref={profileMenuRef}>
            {/* Profile popup (expanded only) */}
            {!isCollapsed && profileMenuOpen && (
              <div className="sidebar-profile-menu absolute bottom-full left-2 right-2 mb-2 rounded-xl shadow-2xl overflow-hidden z-[500]">
                <div className="sidebar-section-border px-4 py-3">
                  <p className="text-sm font-semibold truncate text-[hsl(var(--sidebar-foreground))]">
                    {user?.name || 'Usuário'}
                  </p>
                  <p className="text-xs truncate mt-0.5 text-[hsl(var(--sidebar-muted))]">
                    {user?.email || ''}
                  </p>
                </div>
                <div className="p-1.5">
                  <button
                    onClick={() => { handleItemClick('account'); setProfileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors duration-150 text-[hsl(var(--sidebar-foreground)/0.8)] hover:bg-[hsl(var(--sidebar-border))]"
                  >
                    <UserCog className="w-4 h-4 flex-shrink-0" />
                    Configurações da Conta
                  </button>
                </div>
              </div>
            )}

            {/* Mobile: cartão do perfil no fundo, como no ChatGPT e no Claude — abre a conta */}
            {isMobile && (
              <button
                onClick={() => handleItemClick('account')}
                className="w-[calc(100%-16px)] mx-2 mt-2 flex items-center gap-3 p-2.5 rounded-xl transition-colors duration-150 hover:bg-[hsl(var(--sidebar-border))] active:bg-[hsl(var(--sidebar-border))] text-left"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-[hsl(var(--sidebar-primary)/0.15)] text-[hsl(var(--sidebar-primary))] text-sm font-semibold">
                    {userInitials}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold truncate text-[hsl(var(--sidebar-foreground))]">{user?.name || 'Usuário'}</span>
                  <span className="block text-xs truncate text-[hsl(var(--sidebar-muted))]">{user?.email || ''}</span>
                </span>
                <ChevronRight className="w-4 h-4 flex-shrink-0 text-[hsl(var(--sidebar-muted))]" />
              </button>
            )}

            {/* Mobile: atalhos secundários numa fila compacta em vez de quatro linhas */}
            {isMobile ? (
              <div className="grid grid-cols-4 gap-1 px-2 pt-1 pb-2">
                {[
                  { label: 'Ajuda', icon: HelpCircle, onClick: () => { onClose(); onHelp?.(); } },
                  { label: 'Feedback', icon: Star, onClick: () => { onClose(); onFeedback?.(); } },
                  { label: 'Suporte', icon: LifeBuoy, onClick: () => { onClose(); openSupportChat(); } },
                  ...(onLogout ? [{ label: 'Sair', icon: LogOut, onClick: onLogout, danger: true }] : []),
                ].map(({ label, icon: ActionIcon, onClick, danger }: any) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11.5px] font-medium transition-colors duration-150 ${
                      danger
                        ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/10'
                        : 'text-[hsl(var(--sidebar-foreground)/0.7)] hover:bg-[hsl(var(--sidebar-border))] active:bg-[hsl(var(--sidebar-border))]'
                    }`}
                  >
                    <ActionIcon className="w-5 h-5" />
                    {label}
                  </button>
                ))}
              </div>
            ) : (
            <div className="px-2 py-2 space-y-0.5">
              {/* Help */}
              {isCollapsed ? (
                <div className="group relative flex justify-center py-0.5 px-2">
                  <button
                    onClick={onHelp}
                    className="sidebar-icon-btn sidebar-icon-btn-inactive"
                  >
                    <HelpCircle className="w-5 h-5" />
                  </button>
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-[500] pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
                    <div className="sidebar-tooltip px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap">Ajuda</div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onHelp}
                  className="sidebar-nav-item sidebar-item-inactive w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg transition-all duration-150 text-[14px] font-medium"
                >
                  <HelpCircle className="w-[17px] h-[17px] flex-shrink-0 text-[hsl(var(--sidebar-muted))]" />
                  <span>Ajuda</span>
                </button>
              )}

              {/* Feedback */}
              {isCollapsed ? (
                <div className="group relative flex justify-center py-0.5 px-2">
                  <button
                    onClick={onFeedback}
                    className="sidebar-icon-btn sidebar-icon-btn-inactive"
                  >
                    <Star className="w-5 h-5" />
                  </button>
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-[500] pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
                    <div className="sidebar-tooltip px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap">Feedback</div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={onFeedback}
                  className="sidebar-nav-item sidebar-item-inactive w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg transition-all duration-150 text-[14px] font-medium"
                >
                  <Star className="w-[17px] h-[17px] flex-shrink-0 text-[hsl(var(--sidebar-muted))]" />
                  <span>Feedback</span>
                </button>
              )}

              {/* Chat de suporte — no app Android e no layout mobile da web substitui o
                  botão flutuante, que aí fica escondido (ver has-bottom-nav em globals.css) */}
              {(isNativeApp() || isMobile) && !isCollapsed && (
                <button
                  onClick={() => {
                    onClose();
                    openSupportChat();
                  }}
                  className="sidebar-nav-item sidebar-item-inactive w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg transition-all duration-150 text-[14px] font-medium"
                >
                  <LifeBuoy className="w-[17px] h-[17px] flex-shrink-0 text-[hsl(var(--sidebar-muted))]" />
                  <span>Suporte</span>
                </button>
              )}

              {/* Logout */}
              {onLogout && (
                isCollapsed ? (
                  <div className="group relative flex justify-center py-0.5 px-2">
                    <button
                      onClick={onLogout}
                      className="sidebar-icon-btn sidebar-icon-btn-inactive !text-red-400 hover:!bg-red-500/10"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-[500] pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
                      <div className="sidebar-tooltip px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap">Sair</div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg transition-all duration-150 text-[14px] font-medium text-red-400 hover:bg-red-500/10"
                  >
                    <LogOut className="w-[17px] h-[17px] flex-shrink-0" />
                    <span>Sair</span>
                  </button>
                )
              )}
            </div>
            )}
          </div>
        </div>

        {/* Resize handle (desktop, expanded only) */}
        {!isMobile && !isCollapsed && (
          <div
            onMouseDown={handleResizeStart}
            className={`sidebar-resize-handle absolute top-0 right-0 w-[3px] h-full cursor-col-resize z-[200] transition-opacity duration-150 ${
              isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'
            }`}
          />
        )}
      </aside>
    </>
  );
}