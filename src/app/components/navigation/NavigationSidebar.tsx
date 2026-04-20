import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Zap, UserCog, LogOut, ChevronRight, Search, PanelLeft, HelpCircle, Crown
} from 'lucide-react';
import { LayoutDashboard, Users, BarChart3, Megaphone, Settings } from 'lucide-react';
import { Language, translations, Translations } from '../../utils/i18n';
import { sidebarConfig, SidebarItemConfig } from '../../config/sidebarConfig';
import SidebarGroup from './SidebarGroup';
import InboxTreeMenu from './InboxTreeMenu';

// Mapeamento de path para page id
const pathToPageId: Record<string, string> = {
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
  currentPage?: string;
  onNavigate?: (page: string) => void;
  sidebarWidth?: number;
  onSidebarWidthChange?: (width: number) => void;
}

export default function NavigationSidebar({
  isOpen,
  onClose,
  isDark,
  onToggleTheme,
  isMobile = false,
  isCollapsed = false,
  onToggleCollapse,
  user,
  language,
  onLogout,
  onHelp,
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

  const filteredSidebarConfig = sidebarSearch.trim()
    ? sidebarConfig.filter(item =>
        (t[item.labelKey as keyof Translations] || '').toLowerCase().includes(sidebarSearch.toLowerCase())
      )
    : sidebarConfig;

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
            {item.sectionLabel && (
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
          {item.sectionLabel && (
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
        {item.sectionLabel && (
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

  return (
    <>
      {/* Overlay - mobile only */}
      {isOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/60 z-[900] transition-opacity duration-200"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`sidebar-root flex flex-col flex-shrink-0 ${
          isMobile
            ? `fixed top-0 left-0 z-[10000] h-screen w-64 transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`
            : `fixed top-0 left-0 h-screen z-[10000] ${isResizing ? '' : 'transition-[width] duration-200 ease-out'}`
        }`}
        style={!isMobile ? { width: computedWidth } : undefined}
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
              </>
            )}
          </div>

          {/* Mobile close */}
          {isMobile && (
            <div className="sidebar-section-border px-4 py-2.5 flex items-center justify-between lg:hidden">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-muted))]">Menu</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors duration-150 text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-border))]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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
                    placeholder="Buscar..."
                    className="sidebar-search-input w-full pl-8 pr-3 py-[7px] text-[12px] rounded-md"
                  />
                </div>
              </div>
            )}
            <div className="px-2 pt-3 pb-1 flex-1">
            <ul className="space-y-1">
              {filteredSidebarConfig.map(renderItem)}

              {/* Admin */}
              {isAdmin && (
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