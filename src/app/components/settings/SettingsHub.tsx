import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Code2, FileText, HelpCircle, LifeBuoy, LogOut, MessageCircle, MessageSquareHeart, Radio, ShieldCheck, type LucideIcon } from 'lucide-react';
import { isNativeApp, openSupportChat } from '../../../native';
import { getInstalledVersion } from '../../../live-update';

interface SettingsHubProps {
  onOpenChannels?: () => void;
  /** WhatsApp Business oficial: conta, números, perfil e modelos */
  onOpenWhatsAppBusiness?: () => void;
  onHelp?: () => void;
  onFeedback?: () => void;
  onLogout?: () => void;
  /** Grupos mostrados antes dos de Canais/Suporte (ex.: Conta) */
  before?: ReactNode;
}

export function Row({ icon: Icon, label, hint, onClick, danger, trailing }: {
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
      className={`flex w-full min-h-[56px] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted ${danger ? 'text-red-500' : 'text-foreground'}`}
    >
      <Icon className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="block text-base">{label}</span>
        {/* hint: só valores curtos (ex.: "3 ligados"), nunca frases a explicar a linha */}
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
      {trailing ?? (!danger && <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />)}
    </button>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
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
export function SettingsHub({ onOpenChannels, onOpenWhatsAppBusiness, onHelp, onFeedback, onLogout, before }: SettingsHubProps) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (isNativeApp()) void getInstalledVersion().then(setVersion);
  }, []);

  return (
    <div className="mb-6 space-y-5">
      {before}
      {onOpenChannels && (
        <Group title="Canais">
          <Row icon={Radio} label="Canais ligados" onClick={onOpenChannels} />
          {onOpenWhatsAppBusiness && <Row icon={MessageCircle} label="WhatsApp Business" onClick={onOpenWhatsAppBusiness} />}
        </Group>
      )}

      <Group title="Suporte">
        {onHelp && <Row icon={HelpCircle} label="Ajuda" onClick={onHelp} />}
        <Row icon={LifeBuoy} label="Falar com o suporte" onClick={() => openSupportChat()} />
        {onFeedback && <Row icon={MessageSquareHeart} label="Enviar opinião" onClick={onFeedback} />}
        {version && (
          <div className="flex min-h-[52px] items-center justify-between px-4 text-muted-foreground">
            <span>Versão da app</span>
            <span className="tabular-nums">{version}</span>
          </div>
        )}
      </Group>

      <Group title="Sobre">
        <Row icon={FileText} label="Termos de uso" onClick={() => { window.location.href = '/termos'; }} />
        <Row icon={ShieldCheck} label="Política de privacidade" onClick={() => { window.location.href = '/privacidade'; }} />
        <Row icon={Code2} label="Documentação da API" onClick={() => { window.location.href = '/docs'; }} />
      </Group>

      {onLogout && (
        <Group title="Sessão">
          <Row icon={LogOut} label="Terminar sessão" onClick={onLogout} danger />
        </Group>
      )}
    </div>
  );
}
