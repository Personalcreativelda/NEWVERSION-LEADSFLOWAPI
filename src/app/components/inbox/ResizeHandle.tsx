import React, { useState } from 'react';

interface ResizeHandleProps {
  onMouseDown: (clientX: number) => void;
  orientation?: 'vertical'; // only vertical (column resize) for now
  className?: string;
}

/**
 * A thin drag handle between two panels.
 * Shows a visual highlight on hover and sets col-resize cursor.
 */
export function ResizeHandle({ onMouseDown, className = '' }: ResizeHandleProps) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setActive(true);
    onMouseDown(e.clientX);
    const onUp = () => {
      setActive(false);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mouseup', onUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    onMouseDown(e.touches[0].clientX);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={`relative flex-shrink-0 w-1 group cursor-col-resize select-none z-10 ${className}`}
      style={{ touchAction: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Invisible wider hit area */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />

      {/* Visible indicator line */}
      <div
        className="absolute inset-y-0 left-0 w-px transition-all duration-150"
        style={{
          backgroundColor:
            active
              ? 'hsl(var(--primary) / 0.7)'
              : hovered
              ? 'hsl(var(--primary) / 0.35)'
              : 'hsl(var(--border))',
          width: active || hovered ? '2px' : '1px',
          boxShadow: active ? '0 0 0 2px hsl(var(--primary) / 0.15)' : 'none',
        }}
      />

      {/* Center grip dots */}
      {(hovered || active) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] pointer-events-none">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-[3px] h-[3px] rounded-full"
              style={{ backgroundColor: 'hsl(var(--primary) / 0.6)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
