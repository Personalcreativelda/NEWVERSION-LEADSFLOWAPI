import { ChevronRight } from 'lucide-react';

import { sidebarConfig } from '../../config/sidebarConfig';
import { pathToPageId } from './NavigationSidebar';
import { Language, Translations, translations } from '../../utils/i18n';

interface BreadcrumbsProps {
  currentPage: string;
  language: Language;
  className?: string;
}

/**
 * Trilho de navegação derivado das páginas reais do LeadFlow
 * (src/app/config/sidebarConfig.ts) — nunca mostra links de demonstração.
 * Só a página atual é mostrada como texto (não há rotas intermédias
 * clicáveis: a navegação de nível superior é a própria sidebar).
 */
export default function Breadcrumbs({ currentPage, language, className }: BreadcrumbsProps) {
  const t = translations[language];

  const trail = resolveTrail(currentPage, t);
  if (!trail) return null;

  return (
    <nav aria-label="breadcrumb" className={className}>
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {trail.section && (
          <>
            <li className="truncate max-w-[140px]">{trail.section}</li>
            <li aria-hidden>
              <ChevronRight className="size-3.5" />
            </li>
          </>
        )}
        <li className="font-medium text-foreground truncate max-w-[220px]" aria-current="page">
          {trail.page}
        </li>
      </ol>
    </nav>
  );
}

// Páginas geridas por Dashboard.tsx que não têm entrada própria na sidebar
// (aparecem lá dentro de outra secção, ex.: "Segurança" faz parte da
// Conta). Mantido pequeno de propósito — só os casos que existem hoje.
const SPECIAL_CASES: Record<string, { section?: string; page: keyof Translations }> = {
  admin: { page: 'admin' },
  security: { section: undefined, page: 'security' },
};

function resolveTrail(currentPage: string, t: Translations): { section?: string; page: string } | null {
  const special = SPECIAL_CASES[currentPage];
  if (special) {
    return { section: special.section, page: t[special.page] || currentPage };
  }

  const item = sidebarConfig.find((entry) => (pathToPageId[entry.path] || entry.id) === currentPage);
  if (item) {
    return {
      section: item.sectionLabel,
      page: t[item.labelKey as keyof Translations] || item.id,
    };
  }

  // Sub-páginas não listadas diretamente na sidebar (ex.: dentro da Inbox)
  const parentEntry = sidebarConfig.find((entry) => currentPage.startsWith(entry.id));
  if (parentEntry) {
    return {
      section: parentEntry.sectionLabel,
      page: t[parentEntry.labelKey as keyof Translations] || parentEntry.id,
    };
  }

  if (!currentPage) return null;

  return { page: currentPage.charAt(0).toUpperCase() + currentPage.slice(1).replace(/-/g, ' ') };
}
