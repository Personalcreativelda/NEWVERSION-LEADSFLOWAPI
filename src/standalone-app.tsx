import { BrowserRouter } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import App from './app/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import { UploadQueueProvider } from './app/context/UploadQueueContext';
import { queryClient } from './app/lib/queryClient';
import { idbPersister } from './app/lib/idbPersister';
import './app/styles/globals.css';

// 24 h — how long persisted cache entries are considered valid after a
// page reload.  Queries with staleTime < 24 h will still background-refetch
// once they are used; this just prevents a total cache bust on every reload.
const MAX_CACHE_AGE = 24 * 60 * 60_000;

export default function StandaloneApp() {
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
      <BrowserRouter>
        <ErrorBoundary>
          <UploadQueueProvider>
            <App landingEnabled={false} initialPage="login" />
          </UploadQueueProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}
