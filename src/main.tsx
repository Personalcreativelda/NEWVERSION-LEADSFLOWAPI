import React from 'react';
import ReactDOM from 'react-dom/client';
import StandaloneApp from './standalone-app';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>,
);
