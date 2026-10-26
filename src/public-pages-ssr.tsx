// Gera o HTML das páginas públicas no build (scripts/prerender-public.mjs): quem não
// corre JavaScript — o verificador de URLs da Meta, motores de busca — lê o texto todo.
// No browser, o app (standalone-app.tsx) volta a desenhar a mesma página por cima.
import { renderToString } from 'react-dom/server';
import PrivacyPage from './app/components/public/PrivacyPage';
import TermsPage from './app/components/public/TermsPage';
import ApiDocsPage from './app/components/public/ApiDocsPage';

export const PAGES = [
  {
    file: 'privacidade',
    title: 'Política de privacidade',
    description: 'Que dados o LeadsFlow trata, para quê, com quem os partilha e como pedir a eliminação.',
    render: () => renderToString(<PrivacyPage path="/privacidade" />),
  },
  {
    file: 'termos',
    title: 'Termos de uso',
    description: 'Termos de utilização do LeadsFlow.',
    render: () => renderToString(<TermsPage path="/termos" />),
  },
  {
    file: 'docs',
    title: 'API',
    description: 'Documentação da API pública do LeadsFlow: leads e mensagens de WhatsApp.',
    render: () => renderToString(<ApiDocsPage path="/docs" />),
  },
];

/** Aliases (mesmo conteúdo noutro endereço) */
export const ALIASES: Record<string, string> = {
  privacy: 'privacidade',
  terms: 'termos',
};
