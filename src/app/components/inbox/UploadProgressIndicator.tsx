import React from 'react';

interface UploadProgressIndicatorProps {
  /** 0–100 */
  progress: number;
  /** Diameter of the circle in px (default 44) */
  size?: number;
  strokeWidth?: number;
}

export function UploadProgressIndicator({
  progress,
  size = 44,
  strokeWidth = 3,
}: UploadProgressIndicatorProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', display: 'block' }}
        aria-label={`Upload ${progress}%`}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
      </svg>

      {/* Label */}
      <span
        className="absolute font-semibold text-white leading-none select-none"
        style={{ fontSize: Math.round(size * 0.22) }}
      >
        {progress < 100 ? `${progress}%` : '✓'}
      </span>
    </div>
  );
}
