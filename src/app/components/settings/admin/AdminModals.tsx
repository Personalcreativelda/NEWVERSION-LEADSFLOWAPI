import React from 'react';
import { Rocket, Crown, Bell, Check, X, UserPlus, TrendingUp, CreditCard, AlertTriangle, ShieldOff } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';

interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
}

interface ActivatePlanModalProps {
  user: User | null;
  selectedPlan: string;
  setSelectedPlan: (plan: string) => void;
  expirationDays: number;
  setExpirationDays: (days: number) => void;
  onClose: () => void;
  onActivate: () => void;
  loading: boolean;
}

export const ActivatePlanModal: React.FC<ActivatePlanModalProps> = ({
  user,
  selectedPlan,
  setSelectedPlan,
  expirationDays,
  setExpirationDays,
  onClose,
  onActivate,
  loading,
}) => {
  if (!user) return null;

  const selectableCardBase = "p-4 rounded-xl border-2 transition-all text-left w-full relative group";
  const selectedPlanCardClass = "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)] shadow-sm";
  const unselectedPlanCardClass = "border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-border";
  const selectablePillBase = "px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 active:scale-95";
  const selectedPillClass = "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md";
  const unselectedPillClass = "border-border bg-background text-foreground hover:bg-muted hover:border-border-foreground/20";
  const mutedTextClass = "text-sm text-muted-foreground";
  const tinyMutedTextClass = "text-[10px] text-muted-foreground/80";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-[hsl(var(--background))/0.85] transition-colors" onClick={onClose} />
      <div className="relative modal-panel border rounded-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">
          Ativar Plano - {user.email}
        </h3>

        <div className="space-y-4">
          {/* Plan Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Selecionar Plano
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedPlan('business')}
                className={`${selectableCardBase} ${
                  selectedPlan === 'business' ? selectedPlanCardClass : unselectedPlanCardClass
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-foreground">
                  <Rocket className="w-4 h-4 text-[hsl(var(--primary))]" />
                  <span className="font-medium">Business</span>
                </div>
                <p className={tinyMutedTextClass}>$20/mês ou $100/ano</p>
              </button>

              <button
                onClick={() => setSelectedPlan('enterprise')}
                className={`${selectableCardBase} ${
                  selectedPlan === 'enterprise' ? selectedPlanCardClass : unselectedPlanCardClass
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-foreground">
                  <Crown className="w-4 h-4 text-[hsl(var(--primary))]" />
                  <span className="font-medium">Enterprise</span>
                </div>
                <p className={tinyMutedTextClass}>$59/mês ou $200/ano</p>
              </button>
            </div>
          </div>

          {/* Expiration Days */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Duração (dias)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[30, 90, 180, 365].map((days) => (
                <button
                  key={days}
                  onClick={() => setExpirationDays(days)}
                  className={`${selectablePillBase} ${
                    expirationDays === days ? selectedPillClass : unselectedPillClass
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
            <Input
              type="number"
              value={expirationDays}
              onChange={(e) => setExpirationDays(parseInt(e.target.value) || 30)}
              className="mt-2"
              placeholder="Dias personalizados"
            />
          </div>

          {/* Summary */}
          <div className="bg-muted rounded-lg p-3">
            <p className={`${mutedTextClass} mb-1`}>Resumo:</p>
            <p className="text-sm font-medium text-foreground">
              Plano: <span className="text-[hsl(var(--primary))]">{selectedPlan}</span>
            </p>
            <p className="text-sm font-medium text-foreground">
              Expira em:{' '}
              <span className="text-[hsl(var(--primary))]">
                {new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toLocaleDateString(
                  'pt-BR'
                )}
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button onClick={onActivate} disabled={loading} className="flex-1">
            {loading ? 'Ativando...' : 'Ativar Plano'}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface NotificationSettingsModalProps {
  settings: {
    upgradeNotifications: boolean;
    newUserNotifications: boolean;
    paymentNotifications: boolean;
    expirationNotifications: boolean;
    suspensionNotifications: boolean;
  };
  setSettings: (settings: any) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}

const NOTIFICATION_TYPES = [
  {
    key: 'newUserNotifications',
    icon: UserPlus,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    label: 'Novo Usuário Cadastrado',
    description: 'Receba um alerta quando um novo usuário criar conta na plataforma.',
  },
  {
    key: 'upgradeNotifications',
    icon: TrendingUp,
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
    label: 'Upgrade de Plano',
    description: 'Seja notificado quando um usuário fizer upgrade para um plano superior.',
  },
  {
    key: 'paymentNotifications',
    icon: CreditCard,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    label: 'Pagamento Recebido',
    description: 'Alerta ao confirmar um pagamento via Stripe ou ativação manual.',
  },
  {
    key: 'expirationNotifications',
    icon: AlertTriangle,
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    label: 'Plano Expirando',
    description: 'Aviso quando o plano de um usuário estiver prestes a expirar.',
  },
  {
    key: 'suspensionNotifications',
    icon: ShieldOff,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    label: 'Conta Suspensa',
    description: 'Notificação quando uma conta for suspensa por inatividade ou falha.',
  },
] as const;

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  settings,
  setSettings,
  onClose,
  onSave,
  loading,
}) => {
  const enabledCount = Object.values(settings).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative modal-panel border w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh]">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Notificações do Admin</h3>
              <p className="text-xs text-muted-foreground">{enabledCount} de {NOTIFICATION_TYPES.length} ativas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {NOTIFICATION_TYPES.map(({ key, icon: Icon, iconBg, iconColor, label, description }) => {
            const checked = !!(settings as any)[key];
            return (
              <div
                key={key}
                className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                  checked ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={(val) => setSettings({ ...settings, [key]: val })}
                  className="shrink-0 mt-1"
                />
              </div>
            );
          })}

          {/* Delivery info */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border mt-2">
            <Bell className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              As notificações aparecem no <strong>sino do painel admin</strong>. Entrega por e-mail estará disponível em breve.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 px-5 py-4 border-t shrink-0">
          <Button onClick={onClose} variant="outline" className="flex-1">
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={loading} className="flex-1">
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
};
