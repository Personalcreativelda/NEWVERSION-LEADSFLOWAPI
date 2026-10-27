import React from 'react';
import ReactDOM from 'react-dom/client';
import StandaloneApp from './standalone-app';
import { initNative } from './native';
import { initTheme } from './app/utils/theme';
import { loadLanguage } from './app/utils/i18n';
import { setUiLanguage } from './app/i18n/domTranslator';

// Antes do primeiro render: login e carregamento já saem no tema certo
initTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>,
);

initNative();

// Idioma escolhido (Menu → Idioma): traduz todo o painel, não só a navegação
void setUiLanguage(loadLanguage());
