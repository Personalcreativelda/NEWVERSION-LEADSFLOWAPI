import React, { useState, useRef, useEffect } from 'react';
import {
  X, Zap, UserCog, LogOut, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
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
  '/dashboard/inbox/ai-assistants': 'ai-assistants',
  '/dashboard/inbox/automations': 'automations',
  '/dashboard/funnel': 'funnel',
  '/dashboard/analytics': 'analytics',
  '/dashboard/tasks': 'tasks',
  '/dashboard/campaigns': 'campaigns',
  '/dashboard/plan': 'plan',
  '/dashboard/integrations': 'integrations',
  '/dashboard/security': 'security',
  '/dashboard/account': 'account',
  '/admin': 'admin',
};

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
  currentPage?: string;
  onNavigate?: (page: string) => void;
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
  currentPage = 'dashboard',
  onNavigate,
}: NavigationSidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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

  // Check if user is admin
  const isAdmin = user?.isAdmin === true || user?.email === 'admin@leadflow.com';

  const t = translations[language];

  // Função de navegação que suporta query params opcionais
  const handleItemClick = (pageId: string, queryParams?: Record<string, string>) => {
    if (onNavigate) {
      onNavigate(pageId);
    }
    
    // Atualizar URL com query params se fornecidos
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const queryString = params.toString();
      const newUrl = queryString 
        ? `/dashboard/${pageId}?${queryString}`
        : `/dashboard/${pageId}`;
      window.history.replaceState({}, '', newUrl);
    } else if (pageId === 'inbox') {
      // Limpar query params quando navegar para inbox sem filtros
      window.history.replaceState({}, '', '/dashboard/inbox');
    }
    
    if (isMobile) {
      onClose();
    }
  };

  const renderItem = (item: SidebarItemConfig) => {
    const Icon = item.icon;
    const pageId = pathToPageId[item.path] || item.id;
    // Leaf items: only active if directly on this page, NOT if we're on a child page
    const isActive = !item.children && currentPage === pageId;

    if (item.children) {
      // Check if any child is active OR if we're on an inbox-related page
      const isAnyChildActive = currentPage === pageId || 
                               item.children.some(child => currentPage === pathToPageId[child.path]) ||
                               (item.id === 'inbox' && currentPage.startsWith('inbox'));
      
      // Special handling for Inbox - use InboxTreeMenu
      if (item.id === 'inbox') {
        return (
          <React.Fragment key={item.id}>
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
      
      // Default handling for other groups
      return (
        <React.Fragment key={item.id}>
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
                    className={`sidebar-nav-subitem w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-75 group ${isChildActive ? 'active' : ''}`}
                  >
                    <div className={`sidebar-nav-bullet w-1.5 h-1.5 rounded-full transition-colors`} />
                    <span className="text-sm font-medium">{t[child.labelKey as keyof Translations]}</span>
                  </button>
                </li>
              );
            })}
          </SidebarGroup>
        </React.Fragment>
      );
    }

    return (
      <li
        key={item.id}
        className="relative"
        onMouseEnter={() => setHoveredItem(item.id)}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <button
          onClick={() => handleItemClick(pageId)}
          title={isCollapsed ? t[item.labelKey as keyof Translations] : undefined}
          className={`sidebar-nav-item w-full flex items-center ${isCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-lg transition-all duration-200 group ${
            isActive
              ? 'bg-[#00C48C] text-white shadow-lg shadow-[#00C48C]/30'
              : 'hover:bg-white/10'
          }`}
          style={!isActive ? { color: 'hsl(var(--sidebar-foreground))' } : {}}
        >
          <Icon className={`sidebar-nav-item-icon flex-shrink-0 ${isCollapsed ? 'w-[22px] h-[22px]' : 'w-5 h-5'} ${isActive ? 'text-white' : ''}`} />
          {!isCollapsed && <span className="text-sm font-medium">{t[item.labelKey as keyof Translations]}</span>}
        </button>
      </li>
    );
  };

  return (
    <>
      {/* Overlay - APENAS NO MOBILE quando aberto */}
      {isOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[900] transition-opacity duration-200"
          onClick={onClose}
        />
      )}

      {/* Sidebar - SEMPRE VISÍVEL em desktop (>1024px), overlay em mobile */}
      <aside
        className={`
          border-r transition-all duration-300 ease-in-out flex-shrink-0 relative group
          ${isMobile
            ? `fixed top-0 left-0 z-[950] ${isOpen ? 'translate-x-0' : '-translate-x-full'} h-screen w-[260px]`
            : `fixed top-0 left-0 h-screen z-[100] ${isCollapsed ? 'w-[80px]' : 'w-[260px]'}`
          }
        `}
        style={{ 
          backgroundColor: 'hsl(var(--sidebar))',
          borderColor: 'hsl(var(--sidebar-border))'
        }}
      >
        {/* Collapse toggle button - desktop only, vertically centered on right edge */}
        {!isMobile && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border flex items-center justify-center z-[200] transition-all duration-200 hover:bg-[#00C48C] hover:text-white hover:border-[#00C48C] opacity-0 group-hover:opacity-100"
            style={{
              backgroundColor: 'hsl(var(--sidebar))',
              borderColor: 'hsl(var(--sidebar-border))',
              color: 'hsl(var(--sidebar-foreground) / 0.6)',
            }}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {isCollapsed
              ? <ChevronRight className="w-3.5 h-3.5" />
              : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        )}
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Logo LeadsFlow - NO TOPO DA SIDEBAR */}
          <div className="p-4 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/30 flex-shrink-0">
                <Zap className="w-5 h-5 text-white" />
              </div>
              {!isCollapsed && (
                <div>
                  <h1 className="text-lg font-bold tracking-tight" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
                    LeadsFlow
                  </h1>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Header - Close Button - APENAS NO MOBILE */}
          {isMobile && (
            <div 
              className="p-4 border-b flex items-center justify-between lg:hidden"
              style={{ borderColor: 'hsl(var(--sidebar-border))' }}
            >
              <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--sidebar-foreground))' }}>Menu</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'hsl(var(--sidebar-foreground) / 0.6)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Navigation Items */}
          <nav id="sidebar-navigation" className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-1">
              {sidebarConfig.map(renderItem)}

              {/* Admin Button - Only visible for admins */}
              {isAdmin && (
                <li 
                  className="pt-2 mt-2 border-t relative"
                  style={{ borderColor: 'hsl(var(--sidebar-border))' }}
                  onMouseEnter={() => setHoveredItem('admin')}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <button
                    onClick={() => handleItemClick('admin')}
                    title={isCollapsed ? (t.admin || 'Admin') : undefined}
                    className={`sidebar-nav-item w-full flex items-center ${isCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5'} rounded-lg transition-all duration-200 group ${
                      currentPage === 'admin'
                        ? 'bg-[#00C48C] text-white shadow-lg shadow-[#00C48C]/30'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    style={currentPage !== 'admin' ? { color: 'hsl(var(--sidebar-foreground))' } : {}}
                  >
                    <UserCog className={`sidebar-nav-item-icon flex-shrink-0 ${isCollapsed ? 'w-[22px] h-[22px]' : 'w-5 h-5'} ${currentPage === 'admin' ? 'text-white' : ''}`} />
                    {!isCollapsed && <span className="text-sm font-medium">{t.admin}</span>}
                  </button>
                </li>
              )}
            </ul>
          </nav>

          {/* Footer Section: Avatar + Profile Dropdown */}
          <div className="relative p-4 border-t" style={{ borderColor: 'hsl(var(--sidebar-border))' }} ref={profileMenuRef}>
            {/* Profile Dropdown Menu — only when expanded */}
            {!isCollapsed && profileMenuOpen && (
              <div
                className="absolute bottom-full left-2 right-2 mb-2 rounded-xl shadow-2xl border overflow-hidden z-[500]"
                style={{ backgroundColor: 'hsl(var(--sidebar-accent))', borderColor: 'hsl(var(--sidebar-border))' }}
              >
                {/* User info */}
                <div className="px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
                  <p className="text-sm font-semibold truncate" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
                    {user?.name || 'Usuário'}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'hsl(var(--sidebar-muted))' }}>
                    {user?.email || ''}
                  </p>
                </div>
                {/* Actions */}
                <div className="p-1.5 space-y-0.5">
                  <button
                    onClick={() => { handleItemClick('account'); setProfileMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-white/10"
                    style={{ color: 'hsl(var(--sidebar-foreground))' }}
                  >
                    <UserCog className="w-4 h-4 flex-shrink-0" />
                    Configurações da Conta
                  </button>
                  {onLogout && (
                    <button
                      onClick={() => { onLogout(); setProfileMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-red-500/20"
                      style={{ color: '#f87171' }}
                    >
                      <LogOut className="w-4 h-4 flex-shrink-0" />
                      Sair
                    </button>
                  )}
                </div>
              </div>
            )}

            {isCollapsed ? (
              /* Collapsed: avatar toggles icons below */
              <div className="flex flex-col items-center gap-2">
                {/* Avatar — click to toggle */}
                <button
                  onClick={() => setProfileMenuOpen(o => !o)}
                  className="relative focus:outline-none"
                  title={user?.name || 'Perfil'}
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user?.name || 'User'} className="w-9 h-9 rounded-full object-cover shadow-lg" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#B794F6] to-[#5B9FED] flex items-center justify-center shadow-lg">
                      <span className="text-white text-xs font-semibold">
                        {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00D9A3] rounded-full border-2" style={{ borderColor: 'hsl(var(--sidebar))' }} />
                </button>
                {/* Icons — only visible when profileMenuOpen */}
                {profileMenuOpen && (
                  <>
                    <button
                      onClick={() => { handleItemClick('account'); setProfileMenuOpen(false); }}
                      title="Configurações da Conta"
                      className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                      style={{ color: 'hsl(var(--sidebar-foreground))' }}
                    >
                      <UserCog className="w-[22px] h-[22px]" />
                    </button>
                    {onLogout && (
                      <button
                        onClick={() => { onLogout(); setProfileMenuOpen(false); }}
                        title="Sair"
                        className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-red-500/20"
                        style={{ color: '#f87171' }}
                      >
                        <LogOut className="w-[22px] h-[22px]" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => setProfileMenuOpen(o => !o)}
                className="w-full flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-white/10"
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user?.name || 'User'} className="w-10 h-10 rounded-full object-cover shadow-lg" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#B794F6] to-[#5B9FED] flex items-center justify-center shadow-lg">
                      <span className="text-white text-sm font-semibold">
                        {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#00D9A3] rounded-full border-2" style={{ borderColor: 'hsl(var(--sidebar))' }} />
                </div>
                {/* Name + Plan */}
                <div className="flex-1 min-w-0 text-left">
                  <p className="sidebar-user-name text-sm font-medium truncate">
                    {user?.name || 'Usuário'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {(() => {
                      const currentPlan = (user?.plan || user?.subscription_plan || 'free').toLowerCase();
                      if (currentPlan === 'enterprise') return <span className="text-[#FFD700] text-sm" title="Plano Enterprise">👑</span>;
                      if (currentPlan === 'business') return <span className="text-[#FFD700] text-sm" title="Plano Business">⭐</span>;
                      return <span className="text-xs text-[#6B7280]" title="Plano Free">🆓</span>;
                    })()}
                    <p className={`text-[13px] font-semibold truncate ${(user?.plan || user?.subscription_plan) === 'enterprise' ? 'text-[#8B5CF6]' : 'text-[#6B7280]'}`}>
                      {(user?.plan || user?.subscription_plan) === 'business' ? 'Business' :
                        (user?.plan || user?.subscription_plan) === 'enterprise' ? 'Enterprise' : 'Free'}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${profileMenuOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'hsl(var(--sidebar-muted))' }}
                />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

