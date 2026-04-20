import React, { useState, useEffect, useRef } from 'react';
import { Search, MoreVertical, Crown, UserCheck, UserX, Trash2, Eye } from 'lucide-react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';

interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  subscription_plan?: string;
  planExpiresAt?: string;
  createdAt: string;
  status?: 'active' | 'suspended';
  avatar_url?: string;
  usage?: {
    leads: number;
    messages: number;
    campaigns: number;
    channels: number;
  };
}

interface PlanPricing {
  id: string;
  name: string;
  price: { monthly: number; annual: number };
}

interface AdminUsersTabProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredUsers: User[];
  loading: boolean;
  onActivatePlan: (user: User) => void;
  onSuspendUser: (userId: string, currentStatus?: string) => void;
  onDeleteUser: (userId: string, userEmail: string) => void;
  onViewDetails?: (userId: string) => void;
  plansPricing?: PlanPricing[];
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  searchTerm,
  setSearchTerm,
  filteredUsers,
  loading,
  onActivatePlan,
  onSuspendUser,
  onDeleteUser,
  onViewDetails,
  plansPricing = [],
}) => {
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuUserId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDaysRemaining = (expiresAt?: string, plan?: string): number | null => {
    if (!expiresAt || plan === 'free') return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const getPlanBadge = (plan: string) => {
    const planData = plansPricing.find(p => p.id === plan);
    const planLabel = planData?.name || plan.charAt(0).toUpperCase() + plan.slice(1);
    switch (plan) {
      case 'free':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {planLabel}
          </span>
        );
      case 'business':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            {planLabel}
          </span>
        );
      case 'enterprise':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            {planLabel}
          </span>
        );
      default:
        return <span className="text-xs text-gray-500 dark:text-gray-400">{planLabel}</span>;
    }
  };

  const getStatusBadge = (status?: string, expiresAt?: string) => {
    if (status === 'suspended') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
          Inativo
        </span>
      );
    }
    
    // Check if plan is expired
    if (expiresAt) {
      const now = new Date();
      const expiration = new Date(expiresAt);
      if (expiration < now) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Inativo
          </span>
        );
      }
    }
    
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
        Ativo
      </span>
    );
  };

  const calculateMonthlyRevenue = (user: User) => {
    if (user.plan === 'free' || user.status === 'suspended') return '$0';
    const planData = plansPricing.find(p => p.id === user.plan);
    if (!planData) return '$0';
    const isAnnual = user.subscription_plan?.includes('annual') || user.subscription_plan?.includes('yearly');
    const price = isAnnual ? planData.price.annual : planData.price.monthly;
    return `$${price}`;
  };

  // Get user initials for avatar
  const getInitials = (name: string, email: string) => {
    if (name && name !== 'Sem nome') {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    return email.substring(0, 1).toUpperCase();
  };

  // Generate avatar color based on email
  const getAvatarColor = (email: string) => {
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-indigo-500',
    ];
    const index = email.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="space-y-0">
      {/* Users Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Usuário
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Plano
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Data de Entrada
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Receita Mensal
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Expira em
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">{loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    Carregando usuários...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img 
                            src={user.avatar_url} 
                            alt={user.name || 'User'} 
                            className="w-10 h-10 rounded-full object-cover"
                            onError={(e) => {
                              // Fallback to initials if image fails to load
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-10 h-10 rounded-full ${getAvatarColor(user.email)} flex items-center justify-center text-white font-semibold text-sm ${user.avatar_url ? 'hidden' : ''}`}>
                          {getInitials(user.name, user.email)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.name || 'Sem nome'}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getPlanBadge(user.plan)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(user.status, user.planExpiresAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground/80">
                      {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                      {calculateMonthlyRevenue(user)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {(() => {
                        const days = getDaysRemaining(user.planExpiresAt, user.plan);
                        if (days === null) return <span className="text-muted-foreground">—</span>;
                        if (days < 0) return <span className="text-red-500 font-medium">Expirado</span>;
                        if (days <= 7) return <span className="text-amber-500 font-medium">{days}d</span>;
                        return <span className="text-foreground">{days}d</span>;
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="relative" ref={openMenuUserId === user.id ? menuRef : undefined}>
                        <button
                          onClick={() => setOpenMenuUserId(openMenuUserId === user.id ? null : user.id)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {openMenuUserId === user.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-card border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                            <button
                              onClick={() => { onViewDetails?.(user.id); setOpenMenuUserId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              Ver Detalhes
                            </button>
                            <button
                              onClick={() => { onActivatePlan(user); setOpenMenuUserId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Crown className="w-4 h-4 text-indigo-500" />
                              Mudar Plano
                            </button>
                            <button
                              onClick={() => { onSuspendUser(user.id, user.status); setOpenMenuUserId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              {user.status === 'suspended'
                                ? <UserCheck className="w-4 h-4 text-green-500" />
                                : <UserX className="w-4 h-4 text-amber-500" />}
                              {user.status === 'suspended' ? 'Ativar Usuário' : 'Suspender'}
                            </button>
                            <div className="border-t border-border my-1" />
                            <button
                              onClick={() => { onDeleteUser(user.id, user.email); setOpenMenuUserId(null); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Excluir Usuário
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
