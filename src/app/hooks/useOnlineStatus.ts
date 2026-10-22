import { useEffect, useState } from 'react';

/**
 * true enquanto o aparelho tem ligação à internet (eventos online/offline do browser,
 * que no app Android seguem o Wi-Fi/dados móveis do telemóvel).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
