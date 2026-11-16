import { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../base/PageHeader';
import { SettingsGroup, SettingsItem } from '../base/SettingsList';
import { Button } from '../ui/button';
import { getLocale } from '../../utils/format';
import { isNativeApp, openBrowser } from '../../../native';
import {
  applyLiveUpdateNow,
  getAppUpdateStatus,
  getChangelog,
  installApkUpdate,
  type AppUpdateStatus,
  type ChangelogItem,
} from '../../../live-update';

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};
const formatSize = (bytes: number | null) => (bytes ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : '');

/**
 * Sobre o app: versão em uso, atualizações e novidades. As atualizações do código entram
 * sem reinstalar ("Atualizar agora" reinicia o app já com elas); um APK novo é descarregado
 * e o instalador do Android instala-o por cima (os dados e a sessão ficam).
 */
export default function AboutPage() {
  const native = isNativeApp();
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const [changelog, setChangelog] = useState<ChangelogItem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [apkPercent, setApkPercent] = useState<number | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      if (native) setStatus(await getAppUpdateStatus());
      setChangelog(await getChangelog());
    } catch {
      toast.error('Não foi possível verificar as atualizações');
    } finally {
      setChecking(false);
    }
  }, [native]);

  useEffect(() => { void check(); }, [check]);

  const updateNow = async () => {
    setApplying(true);
    try {
      await applyLiveUpdateNow(); // o app reinicia com a versão nova
    } catch (err: any) {
      toast.error(err?.message || 'A atualização falhou. Tente de novo.');
      setApplying(false);
    }
  };

  const installApk = async () => {
    if (!status?.apk) return;
    // APK antigo sem o instalador: descarrega pelo browser e instala-se à mão
    if (!status.canSelfUpdateApk) {
      void openBrowser(status.apk.url);
      return;
    }
    setApkPercent(0);
    try {
      const result = await installApkUpdate(status.apk, setApkPercent);
      if (result === 'needs-permission') {
        toast('Permita instalar apps a partir do LeadsFlow e toque de novo em "Descarregar e instalar"');
      }
    } catch (err: any) {
      toast.error(err?.message || 'O download falhou. Tente de novo.');
    } finally {
      setApkPercent(null);
    }
  };

  const upToDate = native && status && !status.web && !status.apk;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader title="Sobre o app" icon={Info} />

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          {native && (
            <SettingsGroup title="Versão">
              <SettingsItem label="Em uso">
                <span className="text-sm tabular-nums text-muted-foreground">{status?.current ?? '…'}</span>
              </SettingsItem>
              <SettingsItem label="App instalado">
                <span className="text-sm tabular-nums text-muted-foreground">{status?.nativeVersion ?? '…'}</span>
              </SettingsItem>
              {upToDate && (
                <SettingsItem label="Atualizado">
                  <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking}>
                    {checking ? 'A verificar…' : 'Verificar'}
                  </Button>
                </SettingsItem>
              )}
            </SettingsGroup>
          )}

          {status?.web && (
            <SettingsGroup title="Atualização disponível">
              <SettingsItem label={`Versão ${status.web.version}`} hint={status.web.notes || undefined}>
                <Button size="sm" onClick={updateNow} disabled={applying}>
                  {applying ? 'A atualizar…' : 'Atualizar agora'}
                </Button>
              </SettingsItem>
            </SettingsGroup>
          )}

          {status?.apk && (
            <SettingsGroup title="Nova versão do app">
              <SettingsItem
                label={`Versão ${status.apk.versionName}${status.apk.size ? ` · ${formatSize(status.apk.size)}` : ''}`}
                hint={status.apk.notes || undefined}
              >
                <Button size="sm" onClick={installApk} disabled={apkPercent !== null}>
                  {apkPercent !== null ? `A descarregar… ${apkPercent}%` : 'Descarregar e instalar'}
                </Button>
              </SettingsItem>
            </SettingsGroup>
          )}
        </div>

        <SettingsGroup title="Novidades">
          {changelog === null ? (
            <SettingsItem label="A carregar…" />
          ) : changelog.length === 0 ? (
            <SettingsItem label="Sem novidades publicadas" />
          ) : (
            changelog.map((item) => (
              <div key={`${item.kind}-${item.version}`} className="px-4 py-3">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-foreground tabular-nums">Versão {item.version}</span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">{formatDate(item.date)}</span>
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{item.notes}</p>
              </div>
            ))
          )}
        </SettingsGroup>
      </div>
    </div>
  );
}
