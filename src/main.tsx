import React from 'react';
import ReactDOM from 'react-dom/client';
import StandaloneApp from './standalone-app';
import { initNative } from './native';
import { initTheme } from './app/utils/theme';

// Antes do primeiro render: login e carregamento já saem no tema certo
initTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>,
);

initNative();
