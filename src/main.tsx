import React from 'react';
import ReactDOM from 'react-dom/client';
import StandaloneApp, { loadPublicPage } from './standalone-app';
import { initNative } from './native';
import { initTheme } from './app/utils/theme';
import { loadLanguage } from './app/utils/i18n';
import { setUiLanguage } from './app/i18n/domTranslator';

// Antes do primeiro render: login e carregamento já saem no tema certo
initTheme();

// Nas páginas públicas o render espera pelo código da página: até lá fica o HTML do build
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
const renderApp = (publicPage: Awaited<ReturnType<typeof loadPublicPage>> = null) => root.render(
  <React.StrictMode>
    <StandaloneApp publicPage={publicPage} />
  </React.StrictMode>,
);
loadPublicPage(window.location.pathname).then(renderApp, () => renderApp());

initNative();

// Idioma escolhido (Menu → Idioma): traduz todo o painel, não só a navegação
void setUiLanguage(loadLanguage());
