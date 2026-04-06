import React from 'react';
import { Search, Users, Check, X, Ban, Trash2, Calendar, Rocket, Crown } from 'lucide-react';
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
  usage?: {
    leads: number;
    messages: number;
    campaigns: number;
    channels: number;
  };
}

interface AdminUsersTabProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredUsers: User[];
  loading: boolean;
  onActivatePlan: (user: User) => void;
  onSuspendUser: (userId: string, currentStatus?: string) => void;
  onDeleteUser: (userId: string, userEmail: string) => void;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  searchTerm,
  setSearchTerm,
  filteredUsers,
  loading,
  onActivatePlan,
  onSuspendUser,
  onDeleteUser,
}) => {
  const badgeBaseClass = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all";
  const cardClass = "rounded-2xl border border-border bg-card shadow-sm overflow-hidden";
  const mutedTextClass = "text-sm text-muted-foreground";

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'free':
        return (
          <span className={`${badgeBaseClass} bg-muted text-muted-foreground`}>
            Free
          </span>
        );
      case 'business':
        return (
          <span className={`${badgeBaseClass} bg-[hsl(var(--accent))] text-[hsl(var(--primary))]`}>
            <Rocket className="w-3 h-3 text-[hsl(var(--primary))]" />
            Business
          </span>
        );
      case 'enterprise':
        return (
          <span className={`${badgeBaseClass} bg-[hsl(var(--purple)/0.2)] text-[hsl(var(--primary))]`}>
            <Crown className="w-3 h-3 text-[hsl(var(--primary))]" />
            Enterprise
          </span>
        );
      default:
        return <span className="text-xs text-muted-foreground">{plan}</span>;
    }
  };

  const getExpirationStatus = (expiresAt?: string) => {
    if (!expiresAt) return null;

    const now = new Date();
    const expiration = new Date(expiresAt);
    const daysLeft = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return (
        <span className={`${badgeBaseClass} bg-[hsl(var(--destructive))/0.12] text-[hsl(var(--destructive))]`}>
          <X className="w-3 h-3 text-[hsl(var(--destructive))]" />
          Expirado
        </span>
      );
    } else if (daysLeft <= 7) {
      return (
        <span className={`${badgeBaseClass} bg-[hsl(var(--yellow))/0.18] text-[hsl(var(--yellow))]`}>
          <Calendar className="w-3 h-3 text-[hsl(var(--yellow))]" />
          {daysLeft} dias restantes
        </span>
      );
    } else {
      return (
        <span className={`${badgeBaseClass} bg-[hsl(var(--success))/0.12] text-[hsl(var(--success))]`}>
          <Check className="w-3 h-3 text-[hsl(var(--success))]" />
          {daysLeft} dias restantes
        </span>
      );
    }
  };

  const getStatusBadge = (status?: string) => {
    if (status === 'suspended') {
      return (
        <span className={`${badgeBaseClass} bg-[hsl(var(--destructive))/0.12] text-[hsl(var(--destructive))]`}>
          <Ban className="w-3 h-3 text-[hsl(var(--destructive))]" />
          Suspenso
        </span>
      );
    }
    return (
      <span className={`${badgeBaseClass} bg-[hsl(var(--success))/0.12] text-[hsl(var(--success))]`}>
        <Check className="w-3 h-3 text-[hsl(var(--success))]" />
        Ativo
      </span>
    );
  };

  return (
    <>
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por email ou nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Usuário
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Plano
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status Conta
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Validade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cadastro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    Carregando usuários...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className={`transition-colors hover:bg-muted/50 ${user.status === 'suspended' ? 'bg-[hsl(var(--destructive))/0.08]' : ''}`}>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-foreground">{user.name || 'Sem nome'}</p>
                        <p className={mutedTextClass}>{user.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getPlanBadge(user.plan)}</td>
                    <td className="px-6 py-4">{getStatusBadge(user.status)}</td>
                    <td className="px-6 py-4">{getExpirationStatus(user.planExpiresAt)}</td>
                    <td className={`px-6 py-4 ${mutedTextClass}`}>
                      {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => onActivatePlan(user)}
                          size="sm"
                          variant="outline"
                          className="text-xs"
                        >
                          Plano
                        </Button>
                        <Button
                          onClick={() => onSuspendUser(user.id, user.status)}
                          size="sm"
                          variant="outline"
                          className={`text-xs ${
                            user.status === 'suspended'
                              ? 'border-[hsl(var(--success))] text-[hsl(var(--success))] hover:bg-[hsl(var(--success))/0.12]'
                              : 'border-[hsl(var(--yellow))] text-[hsl(var(--yellow))] hover:bg-[hsl(var(--yellow))/0.18]'
                          }`}
                        >
                          {user.status === 'suspended' ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Reativar
                            </>
                          ) : (
                            <>
                              <Ban className="w-3 h-3 mr-1" />
                              Suspender
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => onDeleteUser(user.id, user.email)}
                          size="sm"
                          variant="outline"
                          className="text-xs border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))/0.12]"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remover
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
