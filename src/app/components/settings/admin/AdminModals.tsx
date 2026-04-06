import React from 'react';
import { Rocket, Crown, Bell, Check, X } from 'lucide-react';
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
  };
  setSettings: (settings: any) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  settings,
  setSettings,
  onClose,
  onSave,
  loading,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-[hsl(var(--background))/0.85] transition-colors" onClick={onClose} />
      <div className="relative modal-panel border rounded-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">
          Configurações de Notificação
        </h3>

        <div className="space-y-4">
          {/* Upgrade Notifications */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Notificações de Upgrade
            </label>
            <Switch
              checked={settings.upgradeNotifications}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  upgradeNotifications: checked,
                })
              }
            />
          </div>

          {/* New User Notifications */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Notificações de Novo Usuário
            </label>
            <Switch
              checked={settings.newUserNotifications}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  newUserNotifications: checked,
                })
              }
            />
          </div>

          {/* Payment Notifications */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Notificações de Pagamento
            </label>
            <Switch
              checked={settings.paymentNotifications}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  paymentNotifications: checked,
                })
              }
            />
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
          <Button onClick={onSave} disabled={loading} className="flex-1">
            {loading ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </div>
    </div>
  );
};
