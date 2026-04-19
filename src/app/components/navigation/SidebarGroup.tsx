import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarGroupProps {
  label: string;
  icon: any;
  isActive: boolean;
  isExpandedInitial?: boolean;
  isCollapsed?: boolean;
  children: React.ReactNode;
}

export default function SidebarGroup({
  label,
  icon: Icon,
  isActive,
  isExpandedInitial = false,
  isCollapsed = false,
  children
}: SidebarGroupProps) {
  const [isExpanded, setIsExpanded] = useState(isExpandedInitial || isActive);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState(0);
  const itemRef = useRef<HTMLLIElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isCollapsed) setIsFlyoutOpen(false);
  }, [isCollapsed]);

  useEffect(() => {
    if (!isFlyoutOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        flyoutRef.current && !flyoutRef.current.contains(e.target as Node) &&
        itemRef.current && !itemRef.current.contains(e.target as Node)
      ) {
        setIsFlyoutOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isFlyoutOpen]);

  const handleCollapsedClick = () => {
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      setFlyoutTop(rect.top);
    }
    setIsFlyoutOpen(prev => !prev);
  };

  // --- Collapsed mode: icon + flyout ---
  if (isCollapsed) {
    return (
      <li ref={itemRef} className="relative group flex justify-center py-0.5 px-2">
        <button
          onClick={handleCollapsedClick}
          className={`sidebar-icon-btn ${
            isActive || isFlyoutOpen ? 'sidebar-icon-btn-active' : 'sidebar-icon-btn-inactive'
          }`}
        >
          <Icon className="w-[22px] h-[22px] flex-shrink-0" />
        </button>

        {/* Flyout panel */}
        {isFlyoutOpen && (
          <div
            ref={flyoutRef}
            className="sidebar-flyout fixed z-[500] rounded-xl border shadow-2xl overflow-hidden"
            style={{
              left: '72px',
              top: flyoutTop,
              minWidth: '220px',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div className="sidebar-flyout-header px-4 py-2.5 flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 text-[hsl(var(--sidebar-muted))]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-muted))]">
                {label}
              </span>
            </div>
            <div onClick={() => setIsFlyoutOpen(false)} className="py-1.5">
              {children}
            </div>
          </div>
        )}

        {/* Tooltip — CSS-only via group-hover on the <li> */}
        {!isFlyoutOpen && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-[500] pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
            <div className="sidebar-tooltip px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shadow-lg">
              {label}
            </div>
          </div>
        )}
      </li>
    );
  }

  // --- Expanded mode ---
  return (
    <li className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-all duration-150 group relative ${
          isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
        }`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 transition-colors duration-150 ${
          isActive ? 'text-[hsl(var(--sidebar-foreground))]' : 'text-[hsl(var(--sidebar-muted))]'
        }`} />
        <span className="text-[14px] font-medium flex-1 text-left truncate">{label}</span>
        <ChevronRight
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          } ${isActive ? 'text-[hsl(var(--sidebar-muted))]' : 'text-[hsl(var(--sidebar-muted))]'}`}
        />
      </button>

      <div
        ref={contentRef}
        className={`overflow-hidden transition-all duration-200 ease-out ${
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="sidebar-tree-children mt-0.5 mb-1">
          <ul className="py-0.5 space-y-0.5">
            {children}
          </ul>
        </div>
      </div>
    </li>
  );
}