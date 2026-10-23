import { ArrowLeft } from 'lucide-react';

/**
 * Fecha uma subpágina (Integrações → SMTP, Definições → Perfil…). Se foi aberta com
 * pushState({ subpage: true }), volta no histórico (o popstate da página fecha-a);
 * senão fecha diretamente.
 */
export function closeSubpage(fallback: () => void) {
  if (window.history.state?.subpage) window.history.back();
  else fallback();
}

/**
 * "← Voltar a …" das subpáginas no computador. No telemóvel fica escondido: aí a seta
 * do cabeçalho (e o botão voltar do Android) já fazem o mesmo.
 */
export function SubpageBack({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={() => closeSubpage(onClose)}
      className="-ml-2 mb-3 hidden h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
