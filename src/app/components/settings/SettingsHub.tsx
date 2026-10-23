import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, HelpCircle, LifeBuoy, LogOut, MessageSquareHeart, Radio, type LucideIcon } from 'lucide-react';
import { isNativeApp, openSupportChat } from '../../../native';
import { getInstalledVersion } from '../../../live-update';

interface SettingsHubProps {
  onOpenChannels?: () => void;
  onHelp?: () => void;
  onFeedback?: () => void;
  onLogout?: () => void;
}

function Row({ icon: Icon, label, hint, onClick, danger, trailing }: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick?: () => void;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full min-h-[52px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted ${danger ? 'text-red-500' : 'text-foreground'}`}
    >
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${danger ? 'bg-red-500/10' : 'bg-muted'}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {trailing ?? (!danger && <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />)}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

/**
 * Definições gerais (fora do perfil): Canais, Suporte e terminar sessão. Antes estavam
 * no menu lateral; o menu ficou só com páginas e o cartão do perfil.
 */
export function SettingsHub({ onOpenChannels, onHelp, onFeedback, onLogout }: SettingsHubProps) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (isNativeApp()) void getInstalledVersion().then(setVersion);
  }, []);

  return (
    <div className="mb-6 space-y-5">
      {onOpenChannels && (
        <Group title="Canais">
          <Row icon={Radio} label="Canais ligados" hint="WhatsApp, Instagram, email e chat do site" onClick={onOpenChannels} />
        </Group>
      )}

      <Group title="Suporte">
        {onHelp && <Row icon={HelpCircle} label="Ajuda" hint="Visita guiada pelas funcionalidades" onClick={onHelp} />}
        <Row icon={LifeBuoy} label="Falar com o suporte" onClick={() => openSupportChat()} />
        {onFeedback && <Row icon={MessageSquareHeart} label="Enviar opinião" onClick={onFeedback} />}
        {version && (
          <div className="flex min-h-[44px] items-center justify-between px-4 text-sm text-muted-foreground">
            <span>Versão da app</span>
            <span className="tabular-nums">{version}</span>
          </div>
        )}
      </Group>

      {onLogout && (
        <Group title="Sessão">
          <Row icon={LogOut} label="Terminar sessão" onClick={onLogout} danger />
        </Group>
      )}
    </div>
  );
}
