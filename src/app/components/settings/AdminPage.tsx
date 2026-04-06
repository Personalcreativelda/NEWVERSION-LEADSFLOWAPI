import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { 
  Users, Bell, History, ChevronRight
} from 'lucide-react';

// New Modular Components
import { AdminStatsCards } from './admin/AdminStatsCards';
import { AdminRevenueBreakdown } from './admin/AdminRevenueBreakdown';
import { AdminUsersTab } from './admin/AdminUsersTab';
import { AdminActivityTab } from './admin/AdminActivityTab';
import { ActivatePlanModal, NotificationSettingsModal } from './admin/AdminModals';

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

export default function AdminPage() {
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
  });
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');
  const [activities, setActivities] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  useEffect(() => {
    loadUsers();
    loadPlansPricing();
    loadNotificationSettings();
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
          businessAnnualRevenue += 100;
        } else {
          businessMonthlyRevenue += 20;
        }
      } else if (user.plan === 'enterprise') {
        if (user.subscription_plan?.includes('annual') || user.subscription_plan?.includes('yearly')) {
          enterpriseAnnualRevenue += 200;
        } else {
          enterpriseMonthlyRevenue += 59;
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
    if (!confirm(`Deseja realmente ${action} este usuário?`)) return;

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
    if (!confirm(`⚠️ ATENÇÃO: Deseja realmente REMOVER o usuário ${userEmail}?\n\nEsta ação é IRREVERSÍVEL. Digite "CONFIRMAR":`)) return;
    const confirmation = prompt('Digite "CONFIRMAR" para remover:');
    if (confirmation !== 'CONFIRMAR') return;

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
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Admin - Gestão de Usuários</h1>
          <p className="text-muted-foreground">Gerencie planos e configurações de usuários</p>
        </div>
        <Button
          onClick={() => setShowNotificationSettings(true)}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Bell className="w-4 h-4" />
          Configurar Notificações
        </Button>
      </div>

      {/* Modern Underline Navigation */}
      <div className="flex items-center gap-8 border-b border-border/50 mb-10 w-full overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('users')}
          className={`relative flex items-center gap-2.5 px-2 py-4 font-bold text-sm transition-all duration-300 group ${
            activeTab === 'users' 
              ? 'text-primary' 
              : 'text-muted-foreground hover:text-foreground/80'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-all duration-300 ${activeTab === 'users' ? 'bg-primary/10 shadow-sm' : 'group-hover:bg-muted'}`}>
            <Users className={`w-4 h-4 ${activeTab === 'users' ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <span className="whitespace-nowrap">Gestão de Usuários</span>
          
          {/* Active Highlight Underline */}
          <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full transition-all duration-300 ${
            activeTab === 'users' 
              ? 'bg-primary scale-x-100 shadow-[0_-4px_12px_rgba(var(--primary),0.6)]' 
              : 'bg-transparent scale-x-0 group-hover:bg-border group-hover:scale-x-50'
          }`} />
        </button>

        {/* Chevron Separator */}
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />

        <button
          onClick={() => setActiveTab('activity')}
          className={`relative flex items-center gap-2.5 px-2 py-4 font-bold text-sm transition-all duration-300 group ${
            activeTab === 'activity' 
              ? 'text-primary' 
              : 'text-muted-foreground hover:text-foreground/80'
          }`}
        >
          <div className={`p-1.5 rounded-lg transition-all duration-300 ${activeTab === 'activity' ? 'bg-primary/10 shadow-sm' : 'group-hover:bg-muted'}`}>
            <History className={`w-4 h-4 ${activeTab === 'activity' ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <span className="whitespace-nowrap">Fluxo de Atividade</span>
          
          {/* Active Highlight Underline */}
          <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full transition-all duration-300 ${
            activeTab === 'activity' 
              ? 'bg-primary scale-x-100 shadow-[0_-4px_12px_rgba(var(--primary),0.6)]' 
              : 'bg-transparent scale-x-0 group-hover:bg-border group-hover:scale-x-50'
          }`} />
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
          <AdminStatsCards 
            usersCount={users.length}
            freeCount={users.filter(u => u.plan === 'free').length}
            businessCount={users.filter(u => u.plan === 'business').length}
            enterpriseCount={users.filter(u => u.plan === 'enterprise').length}
            totalMRR={revenue.totalMRR}
            totalARR={revenue.totalARR}
          />

          <AdminRevenueBreakdown revenue={revenue} />

          <AdminUsersTab 
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filteredUsers={filteredUsers}
            loading={loading}
            onActivatePlan={(user) => {
              setSelectedUser(user);
              setShowActivateModal(true);
            }}
            onSuspendUser={handleSuspendUser}
            onDeleteUser={handleDeleteUser}
          />
        </>
      ) : (
        <AdminActivityTab 
          activities={activities}
          activeUsers={activeUsers}
          activitiesLoading={activitiesLoading}
          onRefreshActivities={loadActivities}
        />
      )}

      {/* Modals */}
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
    </div>
  );
}
