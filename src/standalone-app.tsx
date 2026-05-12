import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import { UploadQueueProvider } from './app/context/UploadQueueContext';
import './app/styles/globals.css';

export default function StandaloneApp() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <UploadQueueProvider>
          <App landingEnabled={false} initialPage="login" />
        </UploadQueueProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
