import { useCallback, useEffect, useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../base/PageHeader';
import { AppModal } from '../base/AppModal';
import { SettingsGroup, SettingsItem } from '../base/SettingsList';
import { Row } from '../settings/SettingsHub';
import { Button } from '../ui/button';
import { getLocale } from '../../utils/format';
import { isNativeApp, openBrowser } from '../../../native';
import {
  applyLiveUpdateNow,
  getAppUpdateStatus,
  getChangelog,
  installApkUpdate,
  withTimeout,
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
const formatSize = (bytes: number | null) => (bytes ? ` · ${(bytes / 1024 / 1024).toFixed(0)} MB` : '');

const EMPTY_STATUS: AppUpdateStatus = { current: null, nativeVersion: null, nativeBuild: 0, web: null, apk: null, canSelfUpdateApk: false };

/**
 * Sobre o app: a atualização disponível (ou "atualizado", com a versão) e as Novidades num
 * popup, como nos outros apps. As atualizações do código entram sem reinstalar ("Atualizar
 * agora" reinicia o app já com elas); um APK novo é descarregado e o instalador do Android
 * instala-o por cima (os dados e a sessão ficam).
 */
export default function AboutPage() {
  const native = isNativeApp();
  const [status, setStatus] = useState<AppUpdateStatus | null>(native ? null : EMPTY_STATUS);
  const [changelog, setChangelog] = useState<ChangelogItem[] | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [apkPercent, setApkPercent] = useState<number | null>(null);

  // Estado e novidades carregam em separado e com tempo máximo: o ecrã nunca fica preso
  const check = useCallback(async () => {
    setChecking(true);
    const loadChangelog = withTimeout(getChangelog(), 10000)
      .then(setChangelog)
      .catch(() => setChangelog((prev) => prev ?? []));
    const loadStatus = native
      ? withTimeout(getAppUpdateStatus(), 15000).then(setStatus).catch(() => {
          setStatus((prev) => prev ?? EMPTY_STATUS);
          toast.error('Não foi possível verificar as atualizações');
        })
      : Promise.resolve();
    await Promise.all([loadChangelog, loadStatus]);
    setChecking(false);
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

  const version = status?.current || status?.nativeVersion;
  const upToDate = native && status && !status.web && !status.apk;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader title="Sobre o app" icon={Info} />

      <div className="max-w-2xl space-y-5">
        {native && (
          <SettingsGroup>
            {!status && <SettingsItem label="A verificar atualizações…" />}

            {upToDate && (
              <SettingsItem label="O app está atualizado" hint={version ? `Versão ${version}` : undefined}>
                <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking}>
                  {checking ? 'A verificar…' : 'Verificar'}
                </Button>
              </SettingsItem>
            )}

            {status?.web && (
              <SettingsItem label="Atualização disponível" hint={`Versão ${status.web.version}`}>
                <Button size="sm" onClick={updateNow} disabled={applying}>
                  {applying ? 'A atualizar…' : 'Atualizar agora'}
                </Button>
              </SettingsItem>
            )}

            {status?.apk && (
              <SettingsItem label="Nova versão do app" hint={`Versão ${status.apk.versionName}${formatSize(status.apk.size)}`}>
                <Button size="sm" onClick={installApk} disabled={apkPercent !== null}>
                  {apkPercent !== null ? `A descarregar… ${apkPercent}%` : 'Descarregar e instalar'}
                </Button>
              </SettingsItem>
            )}
          </SettingsGroup>
        )}

        <SettingsGroup>
          <Row icon={Sparkles} label="Novidades" onClick={() => setShowChangelog(true)} />
        </SettingsGroup>
      </div>

      <AppModal open={showChangelog} onOpenChange={setShowChangelog} title="Novidades" size="md">
        {changelog === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">A carregar…</p>
        ) : changelog.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem novidades publicadas</p>
        ) : (
          <ol className="space-y-5">
            {changelog.map((item) => (
              <li key={`${item.kind}-${item.version}`}>
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-foreground tabular-nums">Versão {item.version}</span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">{formatDate(item.date)}</span>
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{item.notes}</p>
              </li>
            ))}
          </ol>
        )}
      </AppModal>
    </div>
  );
}
