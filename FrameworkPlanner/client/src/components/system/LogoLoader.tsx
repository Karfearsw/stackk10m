/**
 * Branded loading indicator: the seashell logo with a soft pulse.
 * Used for auth-boot, lazy-route Suspense fallbacks, and the pre-JS boot splash.
 * Pure CSS animation so it renders identically in the static boot splash (index.html)
 * and inside React (shared tailwind classes below).
 */
export function LogoLoader({ size = 64 }: { size?: number }) {
  return (
    <div
      className="animate-pulse select-none"
      style={{ width: size, height: size }}
      aria-label="Loading"
      role="status"
    >
      <img
        src="/luxe-logo.png"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
