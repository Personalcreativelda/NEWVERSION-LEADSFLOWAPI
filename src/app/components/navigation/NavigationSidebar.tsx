import React, { useState } from 'react';
import {
  X, Zap, UserCog, LogOut, ChevronDown
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
  user,
  language,
  onLogout,
  currentPage = 'dashboard',
  onNavigate,
}: NavigationSidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  // Check if user is admin
  const isAdmin = user?.isAdmin === true || user?.email === 'admin@leadflow.com';

  const t = translations[language];

  const handleItemClick = (pageId: string) => {
    if (onNavigate) {
      onNavigate(pageId);
    }
    if (isMobile) {
      onClose();
    }
  };

  const renderItem = (item: SidebarItemConfig) => {
    const Icon = item.icon;
    const pageId = pathToPageId[item.path] || item.id;
    const isActive = currentPage === pageId || (item.children?.some(child => currentPage === pathToPageId[child.path]));

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
          className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
            isActive
              ? 'bg-[#00C48C] text-white shadow-lg shadow-[#00C48C]/30'
              : 'hover:bg-white/10'
          }`}
          style={!isActive ? { color: 'hsl(var(--sidebar-foreground))' } : {}}
        >
          <Icon className={`sidebar-nav-item-icon w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
          <span className="text-sm font-medium">{t[item.labelKey as keyof Translations]}</span>
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
          border-r transition-all duration-200 ease-in-out flex-shrink-0
          ${isMobile
            ? `fixed top-0 left-0 z-[950] ${isOpen ? 'translate-x-0' : '-translate-x-full'} h-screen overflow-y-auto w-[260px]`
            : `fixed top-0 left-0 h-screen overflow-y-auto z-[100] w-[260px]`
          }
        `}
        style={{ 
          backgroundColor: 'hsl(var(--sidebar))',
          borderColor: 'hsl(var(--sidebar-border))'
        }}
      >
        <div className="flex flex-col h-full">
          {/* Logo LeadsFlow - NO TOPO DA SIDEBAR */}
          <div className="p-6 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
                  LeadsFlow
                </h1>
              </div>
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
                    className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                      currentPage === 'admin'
                        ? 'bg-[#00C48C] text-white shadow-lg shadow-[#00C48C]/30'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    style={currentPage !== 'admin' ? { color: 'hsl(var(--sidebar-foreground))' } : {}}
                  >
                    <UserCog className={`sidebar-nav-item-icon w-5 h-5 flex-shrink-0 ${currentPage === 'admin' ? 'text-white' : ''}`} />
                    <span className="text-sm font-medium">{t.admin}</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>

          {/* Footer Section: Avatar + Nome + Plano + Logout */}
          <div className="p-4 border-t" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
            <div className="flex items-center gap-3">
              {/* Avatar - Foto Real do Perfil */}
              <div className="relative flex-shrink-0">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user?.name || 'User'}
                    className="w-10 h-10 rounded-full object-cover shadow-lg"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#B794F6] to-[#5B9FED] flex items-center justify-center shadow-lg">
                    <span className="text-white text-sm font-semibold">
                      {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                    </span>
                  </div>
                )}
                {/* Status Online - Ponto Verde */}
                <div 
                  className="absolute bottom-0 right-0 w-3 h-3 bg-[#00D9A3] rounded-full border-2"
                  style={{ borderColor: 'hsl(var(--sidebar))' }}
                ></div>
              </div>

              {/* Nome do Usuário + Plano */}
              <div className="flex-1 min-w-0">
                <p className="sidebar-user-name text-sm font-medium truncate">
                  {user?.name || 'Usuário'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">{/* ✨ ÍCONE PREMIUM POR PLANO */}
                  {(() => {
                    const currentPlan = (user?.plan || user?.subscription_plan || 'free').toLowerCase();

                    if (currentPlan === 'enterprise') {
                      return (
                        <span className="text-[#FFD700] text-sm" title="Plano Enterprise">👑</span>
                      );
                    } else if (currentPlan === 'business') {
                      return (
                        <span className="text-[#FFD700] text-sm" title="Plano Business">⭐</span>
                      );
                    } else {
                      return (
                        <span className="text-xs text-[#6B7280]" title="Plano Free">🆓</span>
                      );
                    }
                  })()}

                  {/* NOME DO PLANO */}
                  <p className={`text-[13px] font-semibold truncate ${(user?.plan || user?.subscription_plan) === 'free'
                    ? 'text-[#6B7280]'
                    : (user?.plan || user?.subscription_plan) === 'enterprise'
                      ? 'text-[#8B5CF6]'
                      : 'text-gray-500 dark:text-[#A0A0B2]'
                    }`}>
                    {(user?.plan || user?.subscription_plan) === 'free' ? 'Free' :
                      (user?.plan || user?.subscription_plan) === 'business' ? 'Business' :
                        (user?.plan || user?.subscription_plan) === 'enterprise' ? 'Enterprise' : 'Free'}
                  </p>
                </div>
              </div>

              {/* Logout Icon Button */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="sidebar-logout-btn flex-shrink-0 p-2 rounded-lg transition-colors"
                  title={t.logout || 'Sair'}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

