import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import App from './app/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import { UploadQueueProvider } from './app/context/UploadQueueContext';
import { ThemeModeProvider } from './app/context/ThemeModeContext';
import { AppMuiThemeProvider } from './app/theme';
import { queryClient } from './app/lib/queryClient';
import { idbPersister } from './app/lib/idbPersister';
// Fontes no próprio pacote (funcionam sem internet no app): texto e títulos
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/source-serif-4/opsz.css';
import './app/styles/globals.css';

// 24 h — how long persisted cache entries are considered valid after a
// page reload.  Queries with staleTime < 24 h will still background-refetch
// once they are used; this just prevents a total cache bust on every reload.
const MAX_CACHE_AGE = 24 * 60 * 60_000;

type PublicPageComponent = () => React.JSX.Element;

// Páginas públicas: abrem sem sessão e fora do App (que redirecionaria para o login)
const PUBLIC_ROUTES: Record<string, () => Promise<{ default: PublicPageComponent }>> = {
  '/privacidade': () => import('./app/components/public/PrivacyPage'),
  '/privacy': () => import('./app/components/public/PrivacyPage'),
  '/termos': () => import('./app/components/public/TermsPage'),
  '/terms': () => import('./app/components/public/TermsPage'),
  '/docs': () => import('./app/components/public/ApiDocsPage'),
  '/docs/api': () => import('./app/components/public/ApiDocsPage'),
};

/**
 * Carrega a página pública antes do primeiro render. Com React.lazy o React apagava o HTML já
 * desenhado no build (prerender) e mostrava a página vazia até o código chegar.
 */
export async function loadPublicPage(pathname: string): Promise<PublicPageComponent | null> {
  const loader = PUBLIC_ROUTES[pathname.replace(/\/$/, '')];
  return loader ? (await loader()).default : null;
}

export default function StandaloneApp({ publicPage: PublicPage }: { publicPage?: PublicPageComponent | null }) {
  if (PublicPage) {
    return (
      <ThemeModeProvider>
        <PublicPage />
      </ThemeModeProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister:  idbPersister,
        maxAge:     MAX_CACHE_AGE,
        // Buster is incremented whenever the cache shape changes in a
        // breaking way so old entries are automatically discarded.
        buster:     'v1',
      }}
    >
      <ThemeModeProvider>
        <AppMuiThemeProvider>
          {/* Animações (motion) respeitam "reduzir movimento" do sistema */}
          <MotionConfig reducedMotion="user">
            <BrowserRouter>
              <ErrorBoundary>
                <UploadQueueProvider>
                  <App landingEnabled={false} initialPage="login" />
                </UploadQueueProvider>
              </ErrorBoundary>
            </BrowserRouter>
          </MotionConfig>
        </AppMuiThemeProvider>
      </ThemeModeProvider>
    </PersistQueryClientProvider>
  );
}
