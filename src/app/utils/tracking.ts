/**
 * Unified CRM Tracking Utility
 * Fires events to Meta Pixel (fbq) and Google Analytics 4 (gtag) simultaneously.
 * IDs are read from localStorage — saved there by IntegrationsPage on configuuration.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMetaPixelId(): string {
  return (typeof window !== 'undefined' ? localStorage.getItem('meta_pixel_id') || '' : '');
}

function getGoogleAnalyticsId(): string {
  return (typeof window !== 'undefined' ? localStorage.getItem('google_analytics_id') || '' : '');
}

function fbq(...args: any[]) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq(...args);
  }
}

function gtag(...args: any[]) {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag(...args);
  }
}

// ── CRM Stage → Event Map ────────────────────────────────────────────────────
// Maps CRM lead status values to standardized Meta + GA4 events.

interface TrackingEvent {
  metaEvent: string;
  ga4Event: string;
  metaData?: Record<string, any>;
  ga4Data?: Record<string, any>;
}

const STATUS_EVENT_MAP: Record<string, TrackingEvent> = {
  // Lead enters the funnel
  novo: {
    metaEvent: 'Lead',
    ga4Event: 'generate_lead',
  },
  // First contact made
  contato: {
    metaEvent: 'Contact',
    ga4Event: 'crm_contact',
  },
  em_contato: {
    metaEvent: 'Contact',
    ga4Event: 'crm_contact',
  },
  // Lead is being qualified / negotiation started
  qualificado: {
    metaEvent: 'InitiateCheckout',
    ga4Event: 'begin_checkout',
  },
  em_negociacao: {
    metaEvent: 'InitiateCheckout',
    ga4Event: 'begin_checkout',
  },
  negociacao: {
    metaEvent: 'InitiateCheckout',
    ga4Event: 'begin_checkout',
  },
  proposta: {
    metaEvent: 'AddToCart',
    ga4Event: 'add_to_cart',
  },
  // Lead converted — most valuable event
  convertido: {
    metaEvent: 'Purchase',
    ga4Event: 'purchase',
    metaData: { value: 0, currency: 'BRL' },
    ga4Data: { currency: 'BRL', value: 0 },
  },
  // Lead lost
  perdido: {
    metaEvent: 'CustomEvent',
    ga4Event: 'lead_lost',
  },
  inativo: {
    metaEvent: 'CustomEvent',
    ga4Event: 'lead_lost',
  },
};

// ── Core Tracker ─────────────────────────────────────────────────────────────

/**
 * Fire a CRM funnel event based on lead status change.
 * Fires to both Meta Pixel and Google Analytics if configured.
 *
 * @param newStatus  - The new CRM status (e.g. 'convertido')
 * @param leadData   - Optional lead data to enrich the events
 */
export function trackLeadStatusChange(newStatus: string, leadData?: {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  value?: number;
  source?: string;
}) {
  const pixelId = getMetaPixelId();
  const gaId = getGoogleAnalyticsId();

  if (!pixelId && !gaId) return; // No tracking configured

  const normalizedStatus = newStatus.toLowerCase().replace(/\s+/g, '_');
  const eventConfig = STATUS_EVENT_MAP[normalizedStatus];

  if (!eventConfig) {
    // Fire generic funnel_stage event for unmapped statuses
    if (gaId) {
      gtag('event', 'crm_stage_change', {
        crm_stage: normalizedStatus,
        lead_id: leadData?.id,
        lead_source: leadData?.source,
      });
    }
    console.log(`[Tracking] ℹ️ No event mapping for status "${newStatus}", fired generic crm_stage_change`);
    return;
  }

  // Prepare data, injecting lead info where available
  const metaPayload = {
    ...eventConfig.metaData,
    ...(leadData?.value !== undefined && { value: leadData.value, currency: 'BRL' }),
    content_name: leadData?.name,
    content_category: 'crm_lead',
    lead_id: leadData?.id,
  };

  const ga4Payload = {
    ...eventConfig.ga4Data,
    ...(leadData?.value !== undefined && { value: leadData.value, currency: 'BRL' }),
    crm_stage: normalizedStatus,
    lead_id: leadData?.id,
    lead_source: leadData?.source,
    lead_name: leadData?.name,
  };

  // ── Fire Meta Pixel ───────────────────────────────────────────
  if (pixelId) {
    if (eventConfig.metaEvent === 'CustomEvent') {
      fbq('trackCustom', `CRM_${normalizedStatus}`, metaPayload);
      console.log(`[Meta Pixel] 🔵 trackCustom CRM_${normalizedStatus}`, metaPayload);
    } else {
      fbq('track', eventConfig.metaEvent, metaPayload);
      console.log(`[Meta Pixel] 🔵 track ${eventConfig.metaEvent}`, metaPayload);
    }
  }

  // ── Fire Google Analytics ─────────────────────────────────────
  if (gaId) {
    gtag('event', eventConfig.ga4Event, ga4Payload);
    console.log(`[GA4] 🟠 event ${eventConfig.ga4Event}`, ga4Payload);
  }
}

/**
 * Fire a free-form custom event to both platforms.
 */
export function trackCustomEvent(eventName: string, data?: Record<string, any>) {
  const pixelId = getMetaPixelId();
  const gaId = getGoogleAnalyticsId();

  if (pixelId) {
    fbq('trackCustom', eventName, data);
  }
  if (gaId) {
    gtag('event', eventName, data);
  }
}

/**
 * Returns true if at least one tracking platform is configured.
 */
export function isTrackingEnabled(): boolean {
  return !!(getMetaPixelId() || getGoogleAnalyticsId());
}
