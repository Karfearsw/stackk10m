/**
 * Animated loading screen: yellow house builds around the logo.
 * The house outline draws itself via SVG stroke animation, then the logo fades in.
 * Used for auth-boot, lazy-route Suspense fallbacks, and the pre-JS boot splash.
 */
export function HouseLogoLoader({ size = 120 }: { size?: number }) {
  const s = size;
  // House dimensions - slightly larger than logo
  const pad = s * 0.15;
  const w = s + pad * 2;
  const h = s + pad * 2 + s * 0.25; // extra for roof
  
  // House path: roof + walls around the logo area
  // Logo sits in the center, house builds around it
  const roofApexY = pad * 0.5;
  const wallTopY = pad + s * 0.25;
  const wallBottomY = h - pad * 0.5;
  const leftX = pad * 0.5;
  const rightX = w - pad * 0.5;
  const midX = w / 2;
  
  const housePath = `
    M ${leftX} ${wallTopY}
    L ${midX} ${roofApexY}
    L ${rightX} ${wallTopY}
    L ${rightX} ${wallBottomY}
    L ${leftX} ${wallBottomY}
    Z
  `.trim().replace(/\s+/g, ' ');

  // Door path (small, centered at bottom)
  const doorW = s * 0.18;
  const doorH = s * 0.28;
  const doorX = midX - doorW / 2;
  const doorY = wallBottomY - doorH;
  const doorPath = `M ${doorX} ${wallBottomY} L ${doorX} ${doorY} L ${doorX + doorW} ${doorY} L ${doorX + doorW} ${wallBottomY}`;

  return (
    <div className="flex flex-col items-center justify-center gap-4 select-none" role="status" aria-label="Loading">
      <div className="relative" style={{ width: w, height: h }}>
        {/* House outline - draws itself */}
        <svg
          className="absolute inset-0"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
        >
          <path
            d={housePath}
            stroke="#D4AF37"
            strokeWidth="3"
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
        
        {/* Logo - fades in after house starts building */}
        <div 
          className="absolute logo-fade-in"
          style={{
            left: pad,
            top: pad + s * 0.125,
            width: s,
            height: s,
          }}
        >
          <img
            src="/luxe-logo.png"
            alt=""
            width={s}
            height={s}
            className="h-full w-full object-contain rounded-sm"
            draggable={false}
          />
        </div>
      </div>
      
      {/* Loading text with animated dots */}
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
          animation: logo-appear 0.8s ease-out 0.5s forwards;
        }
        .loading-dots span {
          animation: dot-bounce 1.4s infinite;
          display: inline-block;
        }
        .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes draw-house {
          to { stroke-dashoffset: 0; }
        }
        @keyframes logo-appear {
          to { opacity: 1; transform: scale(1); }
        }
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
      <HouseLogoLoader size={120} />
      {message && (
        <p className="absolute bottom-1/3 text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
