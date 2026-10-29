import React, { useState } from 'react';
import { Rocket, Crown, Check, X, UserPlus, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { apiRequest } from '../../../utils/api';
import { getLocale } from '../../../utils/format';
import { OverlayModal } from '../../base/OverlayModal';

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
  const selectedPlanCardClass = "border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/10 shadow-sm";
  const unselectedPlanCardClass = "border-border bg-muted/50 hover:bg-muted hover:border-border";
  const selectablePillBase = "px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 active:scale-95";
  const selectedPillClass = "border-blue-600 dark:border-blue-500 bg-blue-600 dark:bg-blue-500 text-white shadow-md";
  const unselectedPillClass = "border-border bg-card text-foreground hover:bg-muted";
  const mutedTextClass = "text-sm text-muted-foreground";
  const tinyMutedTextClass = "text-[10px] text-muted-foreground/70";

  return (
    <OverlayModal onClose={onClose} stickyEdges={false} className="max-w-md p-6">
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
                <div className="flex items-center gap-2 mb-1 text-gray-900 dark:text-white">
                  <Rocket className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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
                  <Crown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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
              Plano: <span className="text-blue-600 dark:text-blue-400">{selectedPlan}</span>
            </p>
            <p className="text-sm font-medium text-foreground">
              Expira em:{' '}
              <span className="text-blue-600 dark:text-blue-400">
                {new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toLocaleDateString(getLocale()
                )}
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end mt-6">
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
      </OverlayModal>
  );
};

// ==========================================
// AddUserModal
// ==========================================
interface AddUserModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', email: '', password: '', plan: 'free', expirationDays: 30 });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    setError(null);
    if (!form.email || !form.password) { setError('Email e palavra-passe são obrigatórios'); return; }
    if (form.password.length < 6) { setError('Palavra-passe deve ter ao menos 6 caracteres'); return; }

    setLoading(true);
    try {
      await apiRequest('/admin/create-user', 'POST', {
        name: form.name,
        email: form.email,
        password: form.password,
        plan: form.plan,
        expirationDays: form.plan !== 'free' ? form.expirationDays : undefined,
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Erro ao criar utilizador');
    } finally {
      setLoading(false);
    }
  };

  const selectableCardBase = "p-3 rounded-xl border-2 transition-all text-left w-full";
  const selectedCard = "border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/10";
  const unselectedCard = "border-border bg-muted/50 hover:bg-muted";

  return (
    <OverlayModal onClose={onClose} stickyEdges={false} className="max-w-md p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Adicionar Utilizador</h3>
              <p className="text-xs text-muted-foreground">Criar conta manualmente</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nome <span className="text-muted-foreground font-normal">(opcional)</span></label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email <span className="text-red-500">*</span></label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="usuario@exemplo.com" />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Palavra-passe <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Plano</label>
            <div className="grid grid-cols-3 gap-2">
              {(['free', 'business', 'enterprise'] as const).map(p => (
                <button key={p} onClick={() => set('plan', p)} className={`${selectableCardBase} ${form.plan === p ? selectedCard : unselectedCard}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {p === 'free' && <Check className="w-3.5 h-3.5 text-gray-500" />}
                    {p === 'business' && <Rocket className="w-3.5 h-3.5 text-blue-500" />}
                    {p === 'enterprise' && <Crown className="w-3.5 h-3.5 text-purple-500" />}
                    <span className="text-sm font-medium text-foreground capitalize">{p}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Expiration (only for paid plans) */}
          {form.plan !== 'free' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Duração (dias)</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[30, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    onClick={() => set('expirationDays', d)}
                    className={`py-1.5 rounded-lg border text-sm font-medium transition-all ${form.expirationDays === d ? 'border-blue-600 bg-blue-600 text-white' : 'border-border bg-card text-foreground hover:bg-muted'}`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <Input
                type="number"
                value={form.expirationDays}
                onChange={e => set('expirationDays', parseInt(e.target.value) || 30)}
                placeholder="Dias personalizados"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Expira em: <span className="font-medium text-foreground">{new Date(Date.now() + form.expirationDays * 86400000).toLocaleDateString(getLocale())}</span>
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end mt-6">
          <Button onClick={onClose} variant="outline" className="flex-1">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? 'A criar...' : 'Criar Utilizador'}
          </Button>
        </div>
      </OverlayModal>
  );
};
