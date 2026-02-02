import { useEffect, useRef } from 'react';

interface MetaPixelProps {
  pixelId?: string;
}

// Global tracker for all initialized pixels (persists across hot reloads)
if (typeof window !== 'undefined') {
  (window as any).__LEADFLOW_INITIALIZED_PIXELS__ = (window as any).__LEADFLOW_INITIALIZED_PIXELS__ || new Set<string>();
}

export function MetaPixel({ pixelId }: MetaPixelProps) {
  // Use ref to track if this component instance has initialized
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!pixelId || hasInitialized.current) return;

    const initializedPixels = (window as any).__LEADFLOW_INITIALIZED_PIXELS__;

    // Check if this pixel has already been initialized globally
    if (initializedPixels.has(pixelId)) {
      console.log(`[Meta Pixel] Pixel ${pixelId} already initialized globally, skipping...`);
      hasInitialized.current = true;
      return;
    }

    // Check if fbq exists globally
    const fbqExists = typeof window !== 'undefined' && (window as any).fbq;
    
    if (fbqExists) {
      // fbq already loaded, just init this pixel ID if not already done
      console.log('[Meta Pixel] fbq already exists globally');
      
      // Check if this pixel ID is already in the fbq instance
      // We check the _fbq object which stores pixel instances
      const existingPixelIds = (window as any)._fbq?.getState?.()?.pixels || [];
      const alreadyInitialized = existingPixelIds.some((p: any) => p.id === pixelId);
      
      if (alreadyInitialized) {
        console.log(`[Meta Pixel] Pixel ${pixelId} already exists in fbq, skipping init`);
        initializedPixels.add(pixelId);
        hasInitialized.current = true;
        return;
      }

      try {
        // Mark as initialized BEFORE calling init to prevent race conditions
        initializedPixels.add(pixelId);
        hasInitialized.current = true;
        
        (window as any).fbq('init', pixelId);
        console.log(`[Meta Pixel] ✅ Pixel ${pixelId} initialized on existing fbq instance`);
        return;
      } catch (error) {
        console.error('[Meta Pixel] Error initializing pixel on existing fbq:', error);
        initializedPixels.delete(pixelId);
        hasInitialized.current = false;
        return;
      }
    }

    // fbq doesn't exist yet, load the script
    console.log('[Meta Pixel] Loading fbq script for the first time...');

    // Initialize Meta Pixel script
    (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) {
        console.log('[Meta Pixel] fbq appeared during initialization, aborting script injection');
        return;
      }
      n = f.fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(
      window,
      document,
      'script',
      'https://connect.facebook.net/en_US/fbevents.js'
    );

    // Mark as initialized BEFORE calling init
    initializedPixels.add(pixelId);
    hasInitialized.current = true;

    // @ts-ignore
    window.fbq('init', pixelId);
    // @ts-ignore
    window.fbq('track', 'PageView');

    console.log(`[Meta Pixel] ✅ Pixel ${pixelId} initialized successfully with new script`);

    // Cleanup - don't remove from set to prevent re-initialization
    // The pixel should persist across component re-renders
  }, []); // Empty dependency array - only run once per component mount

  return null;
}

// Helper function to track custom events
export function trackMetaEvent(eventName: string, data?: any) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('track', eventName, data);
  }
}

// Pre-defined event tracking functions
export const metaEvents = {
  lead: (leadData?: any) => trackMetaEvent('Lead', leadData),
  purchase: (value: number, currency = 'USD') => trackMetaEvent('Purchase', { value, currency }),
  addToCart: (data?: any) => trackMetaEvent('AddToCart', data),
  completeRegistration: (data?: any) => trackMetaEvent('CompleteRegistration', data),
  contact: (data?: any) => trackMetaEvent('Contact', data),
  search: (searchString?: string) => trackMetaEvent('Search', { search_string: searchString }),
};

