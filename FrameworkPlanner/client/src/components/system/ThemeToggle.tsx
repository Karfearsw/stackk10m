import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** Keep the browser-chrome tint (mobile address bar, PWA) in sync with the theme. */
function syncThemeColorMeta(theme: string | undefined) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#141414" : "#ffffff");
}

/**
 * Binary dark/light toggle. next-themes applies the `dark` class on <html>
 * and persists the choice in localStorage under the `theme` key.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes only knows the persisted theme after hydration; until then
  // render a stable placeholder so server/first-paint markup matches.
  useEffect(() => {
    setMounted(true);
    syncThemeColorMeta(resolvedTheme);
  }, [resolvedTheme]);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      onClick={() => {
        const next = isDark ? "light" : "dark";
        setTheme(next);
        syncThemeColorMeta(next);
      }}
    >
      {isDark ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  );
}
