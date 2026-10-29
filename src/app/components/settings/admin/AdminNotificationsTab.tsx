import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { FormField } from '../../base/FormField';
import { apiRequest } from '../../../utils/api';

type ToggleKey =
  | 'newUserNotifications'
  | 'upgradeNotifications'
  | 'paymentNotifications'
  | 'expirationNotifications'
  | 'suspensionNotifications';

type Settings = Record<ToggleKey, boolean> & { notificationEmail: string };

const DEFAULTS: Settings = {
  newUserNotifications: true,
  upgradeNotifications: true,
  paymentNotifications: true,
  expirationNotifications: true,
  suspensionNotifications: false,
  notificationEmail: '',
};

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: 'newUserNotifications', label: 'Novo utilizador' },
  { key: 'upgradeNotifications', label: 'Upgrade de plano' },
  { key: 'paymentNotifications', label: 'Pagamento recebido' },
  { key: 'expirationNotifications', label: 'Plano a expirar' },
  { key: 'suspensionNotifications', label: 'Conta suspensa' },
];

const sectionTitle = 'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

/** Avisos do administrador: aparecem no sino e chegam por email (ao email indicado ou ao da conta) */
export const AdminNotificationsTab: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [savedEmail, setSavedEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    apiRequest('/admin/notification-settings', 'GET')
      .then((res) => {
        if (res?.success && res.settings) {
          const next = { ...DEFAULTS, ...res.settings, notificationEmail: res.settings.notificationEmail || '' };
          setSettings(next);
          setSavedEmail(next.notificationEmail);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async (next: Settings) => {
    setSaving(true);
    try {
      await apiRequest('/admin/notification-settings', 'POST', next);
      setSavedEmail(next.notificationEmail);
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Os interruptores guardam logo; se falhar, voltam ao que estavam
  const toggle = async (key: ToggleKey, value: boolean) => {
    const prev = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (!(await save(next))) setSettings(prev);
  };

  const saveEmail = async () => {
    const email = settings.notificationEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email inválido');
      return;
    }
    if (await save({ ...settings, notificationEmail: email })) toast.success('Guardado');
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await apiRequest('/admin/notification-settings/test', 'POST');
      toast.success(`Email de teste enviado para ${res.sentTo}`);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível enviar o email de teste');
    } finally {
      setTesting(false);
    }
  };

  const emailChanged = settings.notificationEmail.trim() !== savedEmail;

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h3 className={sectionTitle}>Avisar quando</h3>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {TOGGLES.map(({ key, label }) => (
            <label key={key} className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-foreground">{label}</span>
              <Switch
                checked={settings[key]}
                disabled={!loaded}
                onCheckedChange={(v) => void toggle(key, v)}
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className={sectionTitle}>Email</h3>
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <FormField label="Email dos avisos" htmlFor="admin-notification-email">
            <Input
              id="admin-notification-email"
              type="email"
              placeholder="Email da conta"
              value={settings.notificationEmail}
              disabled={!loaded}
              onChange={(e) => setSettings({ ...settings, notificationEmail: e.target.value })}
            />
          </FormField>
          <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-end">
            <Button variant="outline" onClick={() => void sendTest()} disabled={testing || emailChanged || !loaded}>
              {testing ? 'A enviar…' : 'Enviar teste'}
            </Button>
            <Button onClick={() => void saveEmail()} disabled={saving || !emailChanged}>
              Guardar
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
