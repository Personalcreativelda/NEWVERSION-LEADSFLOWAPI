import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  Megaphone,
  MessageSquare,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../../utils/api';
import { getLocale } from '../../utils/format';
import { PageAction, PageHeader } from '../base/PageHeader';
import { EmptyState } from '../base/EmptyState';
import { SettingsField, SettingsGroup, SettingsItem, SettingsToggle } from '../base/SettingsList';
import { Button } from '../ui/button';
import { getPushPermissionState } from '../../../push-notifications';

type Category = 'messages' | 'leads' | 'campaigns' | 'tasks' | 'system';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  isRead: boolean;
  actionUrl?: string;
  category: Category;
  createdAt: string;
}

interface Preferences {
  pushEnabled: boolean;
  messagesEnabled: boolean;
  leadsEnabled: boolean;
  campaignsEnabled: boolean;
  tasksEnabled: boolean;
  systemEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
}

const PAGE_SIZE = 30;

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  messages: MessageSquare,
  leads: UserPlus,
  campaigns: Megaphone,
  tasks: CalendarClock,
  system: Bell,
};

function permissionLabel(permission: string): string {
  if (permission === 'granted') return 'Permitidas';
  if (permission === 'denied') return 'Bloqueadas no Android';
  if (permission === 'web') return 'Apenas na app Android';
  return 'Por confirmar';
}

export default function NotificationsPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [permission, setPermission] = useState('prompt');
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  // Administração: enviar uma notificação de teste para a conta escolhida
  const [testUsers, setTestUsers] = useState<{ id: string; label: string }[] | null>(null);
  const [testUserId, setTestUserId] = useState('');
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    apiRequest('/admin/users', 'GET')
      .then((r: any) => {
        const list: any[] = r?.users || r?.data || (Array.isArray(r) ? r : []);
        setTestUsers(list
          .map((u) => ({ id: String(u.id), label: [u.name, u.email].filter(Boolean).join(' · ') || String(u.id) }))
          .sort((a, b) => a.label.localeCompare(b.label)));
      })
      .catch(() => setTestUsers([]));
  }, [isAdmin]);

  const sendTest = async () => {
    if (!testUserId) return;
    setTesting(true);
    try {
      const r = await apiRequest('/notifications/send', 'POST', {
        userId: testUserId,
        type: 'push_test',
        title: 'Teste de notificação',
        description: 'Notificação de teste enviada pela administração do LeadsFlow.',
        category: 'system',
        priority: 'urgent',
        actionUrl: '/dashboard/notifications',
      });
      const push = r?.results?.[0]?.push || r?.results?.[0]?.delivery || {};
      if (push.status === 'sent') toast.success(`Teste enviado para ${push.successCount} telemóvel(is)`);
      else if (push.status === 'no_devices') toast.error('Esta conta não tem nenhum telemóvel registado.');
      else if (push.status === 'disabled') toast.error('Esta conta desligou os avisos de Sistema.');
      else if (push.status === 'not_configured') toast.error('O envio de notificações não está disponível de momento.');
      else toast.error('O envio falhou. Tente de novo.');
    } catch (err: any) {
      toast.error(err?.message || 'O envio falhou. Tente de novo.');
    } finally {
      setTesting(false);
    }
  };

  const loadHistory = useCallback(async (offset = 0) => {
    const data = await apiRequest(`/notifications?limit=${PAGE_SIZE}&offset=${offset}`, 'GET');
    const items = Array.isArray(data.notifications) ? data.notifications : [];
    setNotifications((current) => offset === 0 ? items : [...current, ...items]);
    setTotal(Number(data.total || items.length));
    setUnread(Number(data.unread || 0));
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadHistory(),
      apiRequest('/notifications/preferences', 'GET'),
      getPushPermissionState(),
    ]).then(([, preferenceData, permissionState]) => {
      if (!active) return;
      setPreferences(preferenceData.preferences);
      setPermission(permissionState);
    }).catch((error) => {
      if (active) toast.error(error?.message || 'Não foi possível carregar as notificações');
    }).finally(() => {
      if (active) setLoading(false);
    });

    const refresh = () => void loadHistory().catch(() => {});
    const updatePermission = (event: Event) => setPermission(String((event as CustomEvent).detail));
    window.addEventListener('leadflow:notifications-changed', refresh);
    window.addEventListener('leadflow:push-permission', updatePermission);
    return () => {
      active = false;
      window.removeEventListener('leadflow:notifications-changed', refresh);
      window.removeEventListener('leadflow:push-permission', updatePermission);
    };
  }, [loadHistory]);

  const savePreferences = async (next: Preferences, previous: Preferences) => {
    setPreferences(next);
    setSaving(true);
    try {
      const data = await apiRequest('/notifications/preferences', 'PUT', next);
      setPreferences(data.preferences);
    } catch (error: any) {
      setPreferences(previous);
      toast.error(error?.message || 'Não foi possível guardar as preferências');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof Preferences, value: boolean) => {
    if (!preferences) return;
    const previous = preferences;
    void savePreferences({ ...preferences, [key]: value }, previous);
  };

  const saveTimes = () => {
    if (!preferences) return;
    void savePreferences(preferences, preferences);
  };

  const markAllRead = async () => {
    const previous = notifications;
    setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    setUnread(0);
    try {
      await apiRequest('/notifications/mark-all-read', 'PUT');
      window.dispatchEvent(new Event('leadflow:notifications-changed'));
    } catch (error: any) {
      setNotifications(previous);
      setUnread(previous.filter((item) => !item.isRead).length);
      toast.error(error?.message || 'Não foi possível atualizar as notificações');
    }
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      setNotifications((items) => items.map((value) => value.id === item.id ? { ...value, isRead: true } : value));
      setUnread((value) => Math.max(0, value - 1));
      void apiRequest(`/notifications/${item.id}/read`, 'PUT').catch(() => {});
    }
    if (item.actionUrl && (item.actionUrl === '/dashboard' || item.actionUrl.startsWith('/dashboard/'))) {
      window.history.pushState({ dashboardPage: true, source: 'notification-history' }, '', item.actionUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try { await loadHistory(notifications.length); }
    catch (error: any) { toast.error(error?.message || 'Não foi possível carregar mais notificações'); }
    finally { setLoadingMore(false); }
  };

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }), []);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Notificações"
        description="Histórico e preferências dos avisos"
        actions={
          <PageAction
            icon={CheckCheck}
            label="Marcar todas como lidas"
            onClick={markAllRead}
            disabled={unread === 0}
          />
        }
      />

      {preferences && (
        <div className="grid gap-5 xl:grid-cols-2">
          <SettingsGroup title="No dispositivo">
            <SettingsItem label="Permissão do Android" icon={<BellRing className="h-5 w-5" aria-hidden />}>
              <span className="text-sm text-muted-foreground">{permissionLabel(permission)}</span>
            </SettingsItem>
            <SettingsToggle
              label="Notificações Push"
              checked={preferences.pushEnabled}
              onChange={(value) => toggle('pushEnabled', value)}
              disabled={saving}
            />
            <SettingsToggle
              label="Horário silencioso"
              hint={preferences.quietHoursEnabled ? `${preferences.quietHoursStart}–${preferences.quietHoursEnd}` : undefined}
              checked={preferences.quietHoursEnabled}
              onChange={(value) => toggle('quietHoursEnabled', value)}
              disabled={saving || !preferences.pushEnabled}
            />
            {preferences.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-3 px-4 py-3">
                <SettingsField label="Das" htmlFor="quiet-start">
                  <input
                    id="quiet-start"
                    type="time"
                    value={preferences.quietHoursStart}
                    onChange={(event) => setPreferences({ ...preferences, quietHoursStart: event.target.value })}
                    onBlur={saveTimes}
                    disabled={saving}
                  />
                </SettingsField>
                <SettingsField label="Até às" htmlFor="quiet-end">
                  <input
                    id="quiet-end"
                    type="time"
                    value={preferences.quietHoursEnd}
                    onChange={(event) => setPreferences({ ...preferences, quietHoursEnd: event.target.value })}
                    onBlur={saveTimes}
                    disabled={saving}
                  />
                </SettingsField>
              </div>
            )}
          </SettingsGroup>

          <SettingsGroup title="Tipos de aviso">
            <SettingsToggle label="Mensagens" checked={preferences.messagesEnabled} onChange={(value) => toggle('messagesEnabled', value)} disabled={saving || !preferences.pushEnabled} />
            <SettingsToggle label="Leads" checked={preferences.leadsEnabled} onChange={(value) => toggle('leadsEnabled', value)} disabled={saving || !preferences.pushEnabled} />
            <SettingsToggle label="Campanhas" checked={preferences.campaignsEnabled} onChange={(value) => toggle('campaignsEnabled', value)} disabled={saving || !preferences.pushEnabled} />
            <SettingsToggle label="Tarefas" checked={preferences.tasksEnabled} onChange={(value) => toggle('tasksEnabled', value)} disabled={saving || !preferences.pushEnabled} />
            <SettingsToggle label="Sistema" checked={preferences.systemEnabled} onChange={(value) => toggle('systemEnabled', value)} disabled={saving || !preferences.pushEnabled} />
          </SettingsGroup>

          {isAdmin && (
            <SettingsGroup title="Teste (administração)">
              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row">
                <select
                  aria-label="Conta a testar"
                  value={testUserId}
                  onChange={(event) => setTestUserId(event.target.value)}
                  disabled={!testUsers || testing}
                  className="min-w-0 flex-1"
                >
                  <option value="">{testUsers ? 'Escolha a conta…' : 'A carregar…'}</option>
                  {(testUsers || []).map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
                <Button onClick={sendTest} disabled={!testUserId || testing}>
                  {testing ? 'A enviar…' : 'Enviar teste'}
                </Button>
              </div>
            </SettingsGroup>
          )}
        </div>
      )}

      <SettingsGroup title="Histórico" action={unread > 0 ? <span className="text-xs text-muted-foreground">{unread} por ler</span> : undefined}>
        {loading ? (
          <div className="space-y-3 px-4 py-5" aria-label="A carregar notificações">
            {[0, 1, 2].map((value) => <div key={value} className="h-14 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState icon={Bell} title="Sem notificações" />
        ) : (
          notifications.map((item) => {
            const Icon = CATEGORY_ICONS[item.category] || Bell;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void openNotification(item)}
                className="flex min-h-[72px] w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted"
              >
                <span className="relative mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                  <Icon className="h-5 w-5" aria-hidden />
                  {!item.isRead && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" aria-label="Por ler" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm text-foreground ${item.isRead ? 'font-medium' : 'font-semibold'}`}>{item.title}</span>
                  {item.description && <span className="mt-0.5 block line-clamp-2 text-sm text-muted-foreground">{item.description}</span>}
                  <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.createdAt}>{dateFormatter.format(new Date(item.createdAt))}</time>
                </span>
              </button>
            );
          })
        )}
      </SettingsGroup>

      {notifications.length < total && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'A carregar...' : 'Carregar mais'}
          </Button>
        </div>
      )}
    </div>
  );
}
