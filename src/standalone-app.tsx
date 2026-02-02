import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import './app/styles/globals.css';

export default function StandaloneApp() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <App landingEnabled={false} initialPage="login" />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
