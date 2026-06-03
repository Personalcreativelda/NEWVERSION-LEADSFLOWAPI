import { useState } from 'react';

interface HlsVideoBackgroundProps {
  overlay?: string;
}

// CSS keyframes injected once for the animated gradient shown while video loads
const STYLE_ID = 'hls-bg-keyframes';
function injectKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes hlsBgShift {
      0%   { background-position: 0% 50% }
      25%  { background-position: 100% 0% }
      50%  { background-position: 100% 100% }
      75%  { background-position: 0% 100% }
      100% { background-position: 0% 50% }
    }
  `;
  document.head.appendChild(style);
}
injectKeyframes();

export default function HlsVideoBackground({
  overlay = 'rgba(6,10,24,0.52)',
}: HlsVideoBackgroundProps) {
  const [videoReady, setVideoReady] = useState(false);

  return (
    <>
      {/* Animated gradient — visible instantly via poster, fades out once video plays */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 0,
          background: 'linear-gradient(-45deg, #e8c0e8, #c8d0f4, #b8dcea, #d0c4ec, #f0c8dc, #bcd4f0, #e0c8f0)',
          backgroundSize: '400% 400%',
          animation: videoReady ? 'none' : 'hlsBgShift 8s ease infinite',
          opacity: videoReady ? 0 : 1,
          transition: 'opacity 1200ms ease',
        }}
      />

      {/* Local video — poster shows first frame instantly (no buffering),
          then video plays when ready. No HLS, no hls.js, no streaming delay. */}
      <video
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: 1 }}
        autoPlay
        muted
        loop
        playsInline
        onCanPlay={() => setVideoReady(true)}
      >
        <source src="/videos/rendition.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: overlay, zIndex: 2 }}
      />
    </>
  );
}
