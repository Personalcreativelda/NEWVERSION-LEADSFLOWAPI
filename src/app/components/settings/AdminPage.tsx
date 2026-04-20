import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { 
  Users, Bell, History, ChevronRight, Megaphone
} from 'lucide-react';

// New Modular Components
import { AdminStatsCards } from './admin/AdminStatsCards';
import { AdminRevenueBreakdown } from './admin/AdminRevenueBreakdown';
import { AdminUsersTab } from './admin/AdminUsersTab';
import { AdminActivityTab } from './admin/AdminActivityTab';
import { AdminMarketingTab } from './admin/AdminMarketingTab';
import { AdminDashboardTab } from './admin/AdminDashboardTab';

import { UserDetailsModal } from './admin/UserDetailsModal';
import { ActivatePlanModal, NotificationSettingsModal, AddUserModal } from './admin/AdminModals';
import { useConfirm } from '../ui/ConfirmDialog';

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

interface PlanPricing {
  id: string;
  name: string;
  price: { monthly: number; annual: number };
  limits: { leads: number; messages: number; massMessages: number };
}

interface AdminPageProps {
  onBack?: () => void;
  adminEmail?: string;
}

export default function AdminPage({ onBack, adminEmail }: AdminPageProps = {}) {
  const confirm = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('business');
  const [expirationDays, setExpirationDays] = useState<number>(30);
  const [plansPricing, setPlansPricing] = useState<PlanPricing[]>([]);
  const [notificationSettings, setNotificationSettings] = useState({
    upgradeNotifications: true,
    newUserNotifications: true,
    paymentNotifications: true,
    expirationNotifications: true,
    suspensionNotifications: true,
    notificationEmail: '',
  });
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'activity' | 'marketing' | 'settings'>('dashboard');
  const [activities, setActivities] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [viewDetailsUserId, setViewDetailsUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
    loadPlansPricing();
    loadNotificationSettings();
    // Read tab requested from sidebar navigation (on initial mount)
    const initialTab = sessionStorage.getItem('adminInitialTab') as typeof activeTab | null;
    if (initialTab) {
      setActiveTab(initialTab);
      sessionStorage.removeItem('adminInitialTab');
    }
    // Listen for tab changes dispatched by sidebar when admin is already active
    const handleTabChange = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail as typeof activeTab;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener('adminTabChange', handleTabChange);
    return () => window.removeEventListener('adminTabChange', handleTabChange);
  }, []);

  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivities();
      loadActiveUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    let filtered = users;
    if (filterPlan !== 'all') {
      filtered = filtered.filter(u => u.plan === filterPlan);
    }
    if (searchTerm) {
      filtered = filtered.filter(
        (user) =>
          user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredUsers(filtered);
  }, [searchTerm, users, filterPlan]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('/admin/users', 'GET');
      if (response.success) {
        setUsers(response.users || []);
        setFilteredUsers(response.users || []);
      } else {
        toast.error(response.message || 'Erro ao carregar usuários');
      }
    } catch (error: any) {
      toast.error('Erro ao carregar usuários: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlansPricing = async () => {
    try {
      const response = await apiRequest('/admin/plans-pricing', 'GET');
      if (response.success) {
        setPlansPricing(response.plans || []);
      }
    } catch (error) {
      console.error('Error loading plans pricing:', error);
    }
  };

  const loadActivities = async () => {
    setActivitiesLoading(true);
    try {
      const response = await apiRequest('/admin/user-activities', 'GET');
      if (response.success) {
        setActivities(response.activities || []);
      }
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadActiveUsers = async () => {
    try {
      const response = await apiRequest('/admin/active-users', 'GET');
      if (response.success) {
        setActiveUsers(response.users || []);
      }
    } catch (error) {
      console.error('Error loading active users:', error);
    }
  };

  const handleActivatePlan = async () => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const response = await apiRequest('/admin/activate-plan', 'POST', {
        userId: selectedUser.id,
        planId: selectedPlan,
        expiresAt: expiresAt.toISOString(),
      });

      if (response.success) {
        toast.success(`Plano ${selectedPlan} ativado com sucesso!`);
        setShowActivateModal(false);
        setSelectedUser(null);
        loadUsers();
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao ativar plano');
    } finally {
      setLoading(false);
    }
  };

  const calculateRevenue = () => {
    // Get prices from DB (plansPricing) with safe fallbacks
    const businessPlan = plansPricing.find(p => p.id === 'business');
    const enterprisePlan = plansPricing.find(p => p.id === 'enterprise');
    const businessMonthlyPrice = businessPlan?.price?.monthly || 0;
    const businessAnnualPrice = businessPlan?.price?.annual || 0;
    const enterpriseMonthlyPrice = enterprisePlan?.price?.monthly || 0;
    const enterpriseAnnualPrice = enterprisePlan?.price?.annual || 0;

    let businessMonthlyRevenue = 0;
    let businessAnnualRevenue = 0;
    let enterpriseMonthlyRevenue = 0;
    let enterpriseAnnualRevenue = 0;

    users.forEach(user => {
      if (user.planExpiresAt) {
        const now = new Date();
        const expiration = new Date(user.planExpiresAt);
        if (expiration < now) return;
      }

      if (user.plan === 'business') {
        if (user.subscription_plan?.includes('annual') || user.subscription_plan?.includes('yearly')) {
          businessAnnualRevenue += businessAnnualPrice;
        } else {
          businessMonthlyRevenue += businessMonthlyPrice;
        }
      } else if (user.plan === 'enterprise') {
        if (user.subscription_plan?.includes('annual') || user.subscription_plan?.includes('yearly')) {
          enterpriseAnnualRevenue += enterpriseAnnualPrice;
        } else {
          enterpriseMonthlyRevenue += enterpriseMonthlyPrice;
        }
      }
    });

    const businessMRR = businessMonthlyRevenue + (businessAnnualRevenue / 12);
    const enterpriseMRR = enterpriseMonthlyRevenue + (enterpriseAnnualRevenue / 12);
    const totalMRR = businessMRR + enterpriseMRR;

    const businessARR = (businessMonthlyRevenue * 12) + businessAnnualRevenue;
    const enterpriseARR = (enterpriseMonthlyRevenue * 12) + enterpriseAnnualRevenue;
    const totalARR = businessARR + enterpriseARR;

    return {
      totalMRR,
      totalARR,
      businessMRR,
      enterpriseMRR,
      businessARR,
      enterpriseARR,
      businessMonthlyCount: users.filter(u => u.plan === 'business' && !u.subscription_plan?.includes('annual')).length,
      businessAnnualCount: users.filter(u => u.plan === 'business' && u.subscription_plan?.includes('annual')).length,
      enterpriseMonthlyCount: users.filter(u => u.plan === 'enterprise' && !u.subscription_plan?.includes('annual')).length,
      enterpriseAnnualCount: users.filter(u => u.plan === 'enterprise' && u.subscription_plan?.includes('annual')).length,
    };
  };

  const revenue = calculateRevenue();

  const loadNotificationSettings = async () => {
    try {
      const response = await apiRequest('/admin/notification-settings', 'GET');
      if (response.success) {
        setNotificationSettings(response.settings);
      }
    } catch (error: any) {
      console.log('Using default notification settings');
    }
  };

  const saveNotificationSettings = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('/admin/notification-settings', 'POST', notificationSettings);
      if (response.success) {
        toast.success('Configurações de notificação salvas com sucesso!');
        setShowNotificationSettings(false);
      }
    } catch (error: any) {
      if (!error.message?.includes('Backend indisponível')) {
        toast.error('Erro ao salvar configurações de notificação: ' + error.message);
      } else {
        toast.success('Configurações salvas (modo demo)');
        setShowNotificationSettings(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendUser = async (userId: string, currentStatus?: string) => {
    const isSuspended = currentStatus === 'suspended';
    const action = isSuspended ? 'reativar' : 'suspender';
    const confirmed = await confirm(`Deseja realmente ${action} este usuário?`, {
      title: `${isSuspended ? 'Reativar' : 'Suspender'} usuário`,
      confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
      variant: 'warning',
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await apiRequest('/admin/suspend-user', 'POST', {
        userId,
        suspend: !isSuspended,
      });

      if (response.success) {
        toast.success(`Usuário ${isSuspended ? 'reativado' : 'suspenso'} com sucesso!`);
        loadUsers();
      }
    } catch (error: any) {
      toast.error(error.message || `Erro ao ${action} usuário`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    const firstConfirm = await confirm(`⚠️ ATENÇÃO: Deseja realmente REMOVER o usuário ${userEmail}?`, {
      title: 'Remover utilizador',
      description: 'Esta ação é irreversível.',
      confirmLabel: 'Continuar',
      variant: 'danger',
    });
    if (!firstConfirm) return;

    const finalConfirm = await confirm('Confirma a remoção definitiva deste utilizador?', {
      title: 'Confirmação final',
      confirmLabel: 'Remover definitivamente',
      variant: 'danger',
    });
    if (!finalConfirm) return;

    setLoading(true);
    try {
      const response = await apiRequest(`/admin/delete-user/${userId}`, 'DELETE');
      if (response.success) {
        toast.success('Usuário removido com sucesso!');
        loadUsers();
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover usuário');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      {/* Dashboard tab */}
      {activeTab === 'dashboard' && (
        <AdminDashboardTab
          users={users}
          totalMRR={revenue.totalMRR}
          totalARR={revenue.totalARR}
        />
      )}

      {/* Users tab */}
      {activeTab === 'users' && (
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-1">
                Usuários
              </h1>
              <p className="text-sm text-muted-foreground">Gerencie todos os usuários da plataforma</p>
            </div>
            <Button
              onClick={() => setShowAddUserModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Adicionar Usuário
            </Button>
          </div>

          <AdminUsersTab
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filteredUsers={filteredUsers}
            loading={loading}
            plansPricing={plansPricing}
            onActivatePlan={(user) => {
              setSelectedUser(user);
              setShowActivateModal(true);
            }}
            onSuspendUser={handleSuspendUser}
            onDeleteUser={handleDeleteUser}
            onViewDetails={(userId) => setViewDetailsUserId(userId)}
          />
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground mb-1">
              Fluxo de Atividade
            </h1>
            <p className="text-muted-foreground">Atividades recentes e usuários online</p>
          </div>
          <AdminActivityTab
            activities={activities}
            activeUsers={activeUsers}
            activitiesLoading={activitiesLoading}
            onRefreshActivities={loadActivities}
            users={users}
          />
        </div>
      )}

      {/* Marketing tab */}
      {activeTab === 'marketing' && (
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground mb-1">
              Marketing
            </h1>
            <p className="text-muted-foreground">Ferramentas de marketing e comunicação</p>
          </div>
          <AdminMarketingTab
            totalUsers={users.length}
            freeCount={users.filter(u => u.plan === 'free').length}
            businessCount={users.filter(u => u.plan === 'business').length}
            enterpriseCount={users.filter(u => u.plan === 'enterprise').length}
            users={users.map(u => ({ id: u.id, name: u.name, email: u.email, plan: u.plan }))}
          />
        </div>
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground mb-1">
              Configurações Admin
            </h1>
            <p className="text-muted-foreground">Configurações de notificações e sistema</p>
          </div>
          <div className="max-w-2xl">
            <div className="bg-card rounded-xl p-6 shadow-sm border border-border mb-4">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-500" />
                Notificações
              </h2>
              <Button
                onClick={() => setShowNotificationSettings(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Bell className="w-4 h-4" />
                Configurar Notificações
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modals — always rendered regardless of active tab */}
      {showAddUserModal && (
        <AddUserModal
          onClose={() => setShowAddUserModal(false)}
          onCreated={() => {
            toast.success('Usuário criado com sucesso!');
            loadUsers();
          }}
        />
      )}

      {showActivateModal && (
        <ActivatePlanModal
          user={selectedUser}
          selectedPlan={selectedPlan}
          setSelectedPlan={setSelectedPlan}
          expirationDays={expirationDays}
          setExpirationDays={setExpirationDays}
          loading={loading}
          onClose={() => {
            setShowActivateModal(false);
            setSelectedUser(null);
          }}
          onActivate={handleActivatePlan}
        />
      )}

      {showNotificationSettings && (
        <NotificationSettingsModal
          settings={notificationSettings}
          setSettings={setSettings => setNotificationSettings(setSettings)}
          loading={loading}
          onClose={() => setShowNotificationSettings(false)}
          onSave={saveNotificationSettings}
        />
      )}

      {viewDetailsUserId && (
        <UserDetailsModal
          userId={viewDetailsUserId}
          onClose={() => setViewDetailsUserId(null)}
        />
      )}
    </div>
  );
}
