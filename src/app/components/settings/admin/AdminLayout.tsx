import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Megaphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  DoorOpen,
} from 'lucide-react';

interface AdminLayoutProps {
  activeTab: 'dashboard' | 'users' | 'activity' | 'marketing' | 'settings';
  onTabChange: (tab: 'dashboard' | 'users' | 'activity' | 'marketing' | 'settings') => void;
  onBack: () => void;
  adminEmail?: string;
  children: React.ReactNode;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'activity', label: 'Atividade', icon: BarChart3 },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'settings', label: 'Configurações', icon: Settings },
] as const;

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  activeTab,
  onTabChange,
  onBack,
  adminEmail,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 flex-shrink-0 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {/* Logo / Header */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border min-h-[68px]">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-sidebar-foreground leading-tight truncate">Admin Panel</p>
              <p className="text-xs text-sidebar-muted truncate">LeadsFlow SaaS</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={`p-3 border-t border-sidebar-border flex items-center gap-2 ${collapsed ? 'justify-center flex-col' : 'justify-between'}`}>
          {/* Collapse toggle - icon only */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors flex-shrink-0"
            title={collapsed ? 'Expandir' : 'Recolher'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          {/* User profile - only when expanded */}
          {!collapsed && adminEmail && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-sidebar-accent flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-white">
                  {adminEmail.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{adminEmail}</p>
                <p className="text-[10px] text-sidebar-muted">Super Admin</p>
              </div>
            </div>
          )}

          {/* Back to app - door icon */}
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-foreground/55 hover:bg-red-500/10 hover:text-red-400 transition-colors flex-shrink-0"
            title="Sair do Admin"
          >
            <DoorOpen className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
};
