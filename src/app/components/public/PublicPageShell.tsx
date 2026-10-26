import { useEffect, type ReactNode } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '../ui/utils';

/** Páginas públicas (sem sessão): política de privacidade, termos de uso e API */
export const PUBLIC_PAGES = [
  { path: '/privacidade', label: 'Privacidade' },
  { path: '/termos', label: 'Termos' },
  { path: '/docs', label: 'API' },
] as const;

export const CONTACT_EMAIL = 'suporte@leadsflowapi.com';

export function PublicPageShell({ title, updated, intro, children }: {
  title: string;
  /** Data da última revisão (texto, ex.: "26 de outubro de 2026") */
  updated?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  const current = window.location.pathname.replace(/\/$/, '');
  useEffect(() => {
    document.title = `${title} · LeadsFlow`;
  }, [title]);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="h-4 w-4" />
            </span>
            LeadsFlow
          </a>
          <nav className="ml-auto flex items-center gap-0.5 text-sm">
            {PUBLIC_PAGES.map((page) => (
              <a
                key={page.path}
                href={page.path}
                className={cn(
                  'whitespace-nowrap rounded-md px-2 py-1.5 transition-colors sm:px-2.5',
                  current.startsWith(page.path) ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {page.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <h1 className="font-serif text-4xl font-medium tracking-tight sm:text-5xl">{title}</h1>
        {updated && <p className="mt-3 text-sm text-muted-foreground">Última atualização: {updated}</p>}
        {intro && <div className="mt-6 text-lg leading-relaxed text-muted-foreground">{intro}</div>}
        <div className="public-prose mt-10">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} LeadsFlow</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground">{CONTACT_EMAIL}</a>
        </div>
      </footer>
    </div>
  );
}

/** Secção com âncora (para ligações diretas, ex.: /privacidade#eliminacao-de-dados) */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2>
        <a href={`#${id}`} className="no-underline hover:underline">{title}</a>
      </h2>
      {children}
    </section>
  );
}
