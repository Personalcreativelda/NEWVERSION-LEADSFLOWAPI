import { useEffect, useRef } from 'react';

interface GoogleAnalyticsProps {
  gaId?: string; // GA4 Measurement ID, e.g. "G-XXXXXXXXXX"
}

export function GoogleAnalytics({ gaId }: GoogleAnalyticsProps) {
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!gaId || hasInitialized.current) return;

    // Check if already loaded for this ID
    const alreadyLoaded = (window as any).__LEADFLOW_GA_IDS__ as Set<string> | undefined;
    if (alreadyLoaded?.has(gaId)) {
      hasInitialized.current = true;
      return;
    }

    // Track initialized IDs globally
    if (!(window as any).__LEADFLOW_GA_IDS__) {
      (window as any).__LEADFLOW_GA_IDS__ = new Set<string>();
    }
    (window as any).__LEADFLOW_GA_IDS__.add(gaId);
    hasInitialized.current = true;

    // Inject gtag.js script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    // Initialize dataLayer and gtag
    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(...args: any[]) {
      (window as any).dataLayer.push(args);
    }
    (window as any).gtag = gtag;

    gtag('js', new Date());
    gtag('config', gaId, {
      // Don't send page_view automatically — we control it
      send_page_view: false,
    });

    // Send initial page_view
    gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
    });

    console.log(`[GA4] ✅ Google Analytics ${gaId} initialized`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
