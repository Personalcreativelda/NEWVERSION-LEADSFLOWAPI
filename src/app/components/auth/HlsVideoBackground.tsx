import { useEffect, useRef, useState } from 'react';

interface HlsVideoBackgroundProps {
  overlay?: string;
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let done = false;
    const markReady = () => {
      if (done) return;
      done = true;
      setVideoReady(true);
    };

    video.addEventListener('playing', markReady);

    // Attempt to play — mobile browsers may block autoplay even with muted+playsInline,
    // so we call .play() explicitly and catch the rejection.
    const attemptPlay = () => {
      video.play().catch(() => {
        // Autoplay blocked (iOS policy). Wait for first user interaction then retry.
        const onTouch = () => {
          video.play().catch(() => {});
          document.removeEventListener('touchstart', onTouch);
          document.removeEventListener('click', onTouch);
        };
        document.addEventListener('touchstart', onTouch, { passive: true });
        document.addEventListener('click', onTouch, { passive: true });
      });
    };

    // If enough data is already buffered (e.g. cached), play immediately.
    // Otherwise wait for canplay.
    if (video.readyState >= 3) {
      attemptPlay();
    } else {
      video.addEventListener('canplay', attemptPlay, { once: true });
    }

    return () => {
      video.removeEventListener('playing', markReady);
      video.removeEventListener('canplay', attemptPlay);
    };
  }, []);

  return (
    <>
      {/* Animated gradient — instant, fades out once video is playing */}
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

      <video
        ref={videoRef}
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: 1 }}
        muted
        loop
        playsInline
        preload="auto"
        // autoPlay as HTML attr is still useful for desktop; JS .play() handles mobile
        autoPlay
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
