import { useState, useCallback, useEffect, useRef } from 'react';

export interface InboxLayoutState {
  conversationListWidth: number;
  detailsPanelWidth: number;
  conversationListCollapsed: boolean;
  detailsPanelCollapsed: boolean;
  focusMode: boolean;
}

const STORAGE_KEY = 'inbox_layout_v2';

const DEFAULTS: InboxLayoutState = {
  conversationListWidth: 300,
  detailsPanelWidth: 320,
  conversationListCollapsed: false,
  detailsPanelCollapsed: false,
  focusMode: false,
};

const LIMITS = {
  conversationList: { min: 220, max: 480 },
  detailsPanel: { min: 260, max: 480 },
};

function loadLayout(): InboxLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        conversationListWidth: Math.min(
          LIMITS.conversationList.max,
          Math.max(LIMITS.conversationList.min, parsed.conversationListWidth ?? DEFAULTS.conversationListWidth)
        ),
        detailsPanelWidth: Math.min(
          LIMITS.detailsPanel.max,
          Math.max(LIMITS.detailsPanel.min, parsed.detailsPanelWidth ?? DEFAULTS.detailsPanelWidth)
        ),
        conversationListCollapsed: parsed.conversationListCollapsed ?? DEFAULTS.conversationListCollapsed,
        detailsPanelCollapsed: parsed.detailsPanelCollapsed ?? DEFAULTS.detailsPanelCollapsed,
        focusMode: false, // always reset focus mode on reload
      };
    }
  } catch {
    // ignore
  }
  return DEFAULTS;
}

function saveLayout(state: InboxLayoutState) {
  try {
    const toSave = {
      conversationListWidth: state.conversationListWidth,
      detailsPanelWidth: state.detailsPanelWidth,
      conversationListCollapsed: state.conversationListCollapsed,
      detailsPanelCollapsed: state.detailsPanelCollapsed,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // ignore
  }
}

export function useInboxLayout() {
  const [layout, setLayout] = useState<InboxLayoutState>(loadLayout);

  // Debounced save on change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((partial: Partial<InboxLayoutState>) => {
    setLayout((prev) => {
      const next = { ...prev, ...partial };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveLayout(next), 400);
      return next;
    });
  }, []);

  // ── Drag resize logic ──────────────────────────────────────────────

  const startResizeConversationList = useCallback((startX: number) => {
    const startWidth = layout.conversationListWidth;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const delta = clientX - startX;
      const newWidth = Math.min(
        LIMITS.conversationList.max,
        Math.max(LIMITS.conversationList.min, startWidth + delta)
      );
      setLayout((prev) => ({ ...prev, conversationListWidth: newWidth }));
    };
    const onUp = (e: MouseEvent | TouchEvent) => {
      const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX;
      const delta = clientX - startX;
      const newWidth = Math.min(
        LIMITS.conversationList.max,
        Math.max(LIMITS.conversationList.min, startWidth + delta)
      );
      update({ conversationListWidth: newWidth });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onUp);
  }, [layout.conversationListWidth, update]);

  const startResizeDetailsPanel = useCallback((startX: number) => {
    const startWidth = layout.detailsPanelWidth;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const delta = startX - clientX; // dragging left = wider panel
      const newWidth = Math.min(
        LIMITS.detailsPanel.max,
        Math.max(LIMITS.detailsPanel.min, startWidth + delta)
      );
      setLayout((prev) => ({ ...prev, detailsPanelWidth: newWidth }));
    };
    const onUp = (e: MouseEvent | TouchEvent) => {
      const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX;
      const delta = startX - clientX;
      const newWidth = Math.min(
        LIMITS.detailsPanel.max,
        Math.max(LIMITS.detailsPanel.min, startWidth + delta)
      );
      update({ detailsPanelWidth: newWidth });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onUp);
  }, [layout.detailsPanelWidth, update]);

  // ── Collapse / expand ─────────────────────────────────────────────

  const toggleConversationList = useCallback(() => {
    update({ conversationListCollapsed: !layout.conversationListCollapsed, focusMode: false });
  }, [layout.conversationListCollapsed, update]);

  const toggleDetailsPanel = useCallback(() => {
    update({ detailsPanelCollapsed: !layout.detailsPanelCollapsed, focusMode: false });
  }, [layout.detailsPanelCollapsed, update]);

  const toggleFocusMode = useCallback(() => {
    if (layout.focusMode) {
      update({ focusMode: false });
    } else {
      update({ focusMode: true, conversationListCollapsed: false, detailsPanelCollapsed: false });
    }
  }, [layout.focusMode, update]);

  // ── Adaptive: auto-collapse on small viewports ────────────────────
  useEffect(() => {
    const handle = () => {
      const w = window.innerWidth;
      if (w < 768) {
        // Mobile: only show one panel at a time — handled via CSS / parent component
      }
    };
    window.addEventListener('resize', handle, { passive: true });
    return () => window.removeEventListener('resize', handle);
  }, []);

  return {
    layout,
    update,
    startResizeConversationList,
    startResizeDetailsPanel,
    toggleConversationList,
    toggleDetailsPanel,
    toggleFocusMode,
    LIMITS,
  };
}
