/**
 * Animated loading screen: gold house draws OVER the logo image.
 * The house outline draws itself on top of the logo via SVG stroke animation,
 * logo fades in with a soft pulse.
 * Used for auth-boot, lazy-route Suspense fallbacks, and the pre-JS boot splash.
 */
export function HouseLogoLoader({
  size = 140,
  src = "/logo.jpg",
}: {
  size?: number;
  src?: string;
}) {
  const s = size;
  // House overlay: inset slightly from image edges
  const m = s * 0.07;
  const roofY = m + 4;
  const wallTop = m + s * 0.28;
  const bot = s - m;
  const l = m;
  const r = s - m;
  const mid = s / 2;

  const housePath = `M ${l} ${wallTop} L ${mid} ${roofY} L ${r} ${wallTop} L ${r} ${bot} L ${l} ${bot} Z`;

  const dw = s * 0.16;
  const dh = s * 0.24;
  const dx = mid - dw / 2;
  const dy = bot - dh;
  const doorPath = `M ${dx} ${bot} L ${dx} ${dy} L ${dx + dw} ${dy} L ${dx + dw} ${bot}`;

  return (
    <div className="flex flex-col items-center justify-center gap-4 select-none" role="status" aria-label="Loading">
      <div className="relative" style={{ width: s, height: s }}>
        {/* Logo image */}
        <img
          src={src}
          alt=""
          width={s}
          height={s}
          className="absolute inset-0 h-full w-full object-contain rounded-lg logo-fade-in"
          draggable={false}
        />
        {/* House overlay - draws on top */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={s}
          height={s}
          viewBox={`0 0 ${s} ${s}`}
          fill="none"
        >
          <path
            d={housePath}
            stroke="#D4AF37"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="house-draw"
          />
          <path
            d={doorPath}
            stroke="#D4AF37"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="house-draw-door"
          />
        </svg>
      </div>

      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>Loading</span>
        <span className="loading-dots">
          <span>.</span><span>.</span><span>.</span>
        </span>
      </div>

      <style>{`
        .house-draw {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: draw-house 1.8s ease-out forwards;
        }
        .house-draw-door {
          stroke-dasharray: 300;
          stroke-dashoffset: 300;
          animation: draw-house 1.2s ease-out 0.8s forwards;
        }
        .logo-fade-in {
          opacity: 0;
          transform: scale(0.9);
          animation: logo-appear 0.8s ease-out 0.3s forwards, logo-pulse 2s ease-in-out 1.3s infinite;
        }
        @keyframes draw-house {
          to { stroke-dashoffset: 0; }
        }
        @keyframes logo-appear {
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes logo-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.03); opacity: 0.92; }
        }
        .loading-dots span {
          animation: dot-bounce 1.4s infinite;
          display: inline-block;
        }
        .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * Full-screen loading overlay with the house animation.
 */
export function HouseLoadingScreen({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <HouseLogoLoader size={140} />
      {message && (
        <p className="absolute mt-48 text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
