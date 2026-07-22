import { useEffect, useState } from "react";

interface LoadingScreenProps {
  ready?: boolean;
  minDuration?: number;
  fadeDuration?: number;
  onDone?: () => void;
}

export default function LoadingScreen({
  ready = true,
  minDuration = 1200,
  fadeDuration = 500,
  onDone = () => {},
}: LoadingScreenProps) {
  const [mounted, setMounted] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const start = Date.now();
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let unmountTimer: ReturnType<typeof setTimeout> | undefined;

    const tryFinish = () => {
      const elapsed = Date.now() - start;
      const wait = Math.max(minDuration - elapsed, 0);
      fadeTimer = setTimeout(() => {
        setFading(true);
        unmountTimer = setTimeout(() => {
          setMounted(false);
          onDone();
        }, fadeDuration);
      }, wait);
    };

    if (ready) tryFinish();

    return () => {
      if (fadeTimer) clearTimeout(fadeTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: "#0b0f14",
        opacity: fading ? 0 : 1,
        transition: `opacity ${fadeDuration}ms ease`,
        pointerEvents: fading ? "none" : "auto",
      }}
      role="status"
      aria-live="polite"
      aria-label="Loading Varuna"
    >
      <style>{`
        @keyframes aegisOrbit1 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes aegisOrbit2 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes aegisCounter1 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes aegisCounter2 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes aegisPulse { 0%, 100% { r: 7; opacity: 1; } 50% { r: 9; opacity: 0.6; } }
        @keyframes aegisFadeUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes aegisDots { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }

        .aegis-orbit1 { transform-origin: 60px 60px; animation: aegisOrbit1 7s linear infinite; }
        .aegis-counter1 { transform-origin: 0px 0px; animation: aegisCounter1 7s linear infinite reverse; }
        .aegis-orbit2 { transform-origin: 60px 60px; animation: aegisOrbit2 5s linear infinite reverse; }
        .aegis-counter2 { transform-origin: 0px 0px; animation: aegisCounter2 5s linear infinite; }
        .aegis-pulse { animation: aegisPulse 2s infinite; transform-origin: 60px 60px; }
        .aegis-wordmark { animation: aegisFadeUp 600ms ease 200ms both; }
        .aegis-dot { animation: aegisDots 1.4s infinite; }
        .aegis-dot:nth-child(2) { animation-delay: 0.2s; }
        .aegis-dot:nth-child(3) { animation-delay: 0.4s; }

        @media (prefers-reduced-motion: reduce) {
          .aegis-orbit1, .aegis-orbit2, .aegis-counter1, .aegis-counter2,
          .aegis-pulse, .aegis-dot { animation: none; }
        }
      `}</style>

      <svg
        width="160"
        height="160"
        viewBox="0 0 120 120"
        role="img"
        aria-label="Varuna animated orbit logo with warship markers"
      >
        <title>Varuna logo mark</title>
        <circle cx="60" cy="60" r="52" fill="none" stroke="#ef9f27" strokeWidth="1" opacity="0.25" />
        <circle cx="60" cy="60" r="36" fill="none" stroke="#ef9f27" strokeWidth="1" opacity="0.35" />

        <g className="aegis-orbit1">
          <g transform="translate(60,8)">
            <g className="aegis-counter1">
              <path d="M -6,2 L 6,2 L 6,3.4 L 4.5,4.8 L -5,4.8 L -6,3.4 Z" fill="#ef9f27" />
              <path d="M -2.2,-1.4 L 2.6,-1.4 L 2.6,2 L -2.2,2 Z" fill="#ef9f27" opacity="0.9" />
              <path d="M 0.2,-4.8 L 1,-4.8 L 1,-1.4 L 0.2,-1.4 Z" fill="#ef9f27" opacity="0.85" />
              <path d="M -4.6,0.6 L -2.6,0.6 L -3,2 L -4.2,2 Z" fill="#ef9f27" opacity="0.7" />
            </g>
          </g>
        </g>

        <g className="aegis-orbit2">
          <g transform="translate(96,60)">
            <g className="aegis-counter2">
              <path d="M -4.5,1.5 L 4.5,1.5 L 4.5,2.6 L 3.4,3.6 L -3.8,3.6 L -4.5,2.6 Z" fill="#ef9f27" opacity="0.75" />
              <path d="M -1.6,-1 L 2,-1 L 2,1.5 L -1.6,1.5 Z" fill="#ef9f27" opacity="0.65" />
              <path d="M 0.15,-3.6 L 0.75,-3.6 L 0.75,-1 L 0.15,-1 Z" fill="#ef9f27" opacity="0.6" />
            </g>
          </g>
        </g>

        <circle className="aegis-pulse" cx="60" cy="60" r="7" fill="#ef9f27" />
      </svg>

      <div className="aegis-wordmark" style={{ textAlign: "center" }}>
        <div style={{ color: "#fff", fontSize: 20, fontWeight: 500, letterSpacing: 3 }}>
          Varuna
        </div>
        <div style={{ color: "#6b7280", fontSize: 11, letterSpacing: 2, marginTop: 10 }}>
          LOADING
          <span className="aegis-dot" style={{ display: "inline-block", marginLeft: 4 }}>.</span>
          <span className="aegis-dot" style={{ display: "inline-block" }}>.</span>
          <span className="aegis-dot" style={{ display: "inline-block" }}>.</span>
        </div>
      </div>
    </div>
  );
}
