import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export function XpPublicShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isAuthenticated, user } = useAuth();
  const isAdmin = Boolean(user?.isSuperAdmin) || String(user?.role || "").toLowerCase() === "admin";

  return (
    <div className={cn("min-h-screen bg-[radial-gradient(1200px_800px_at_15%_10%,rgba(214,188,145,0.22),transparent_60%),radial-gradient(900px_700px_at_85%_0%,rgba(13,54,69,0.18),transparent_55%),linear-gradient(to_bottom,rgba(255,255,255,0.02),rgba(0,0,0,0.0))] bg-background", className)}>
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/75 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/xp" className="flex items-center gap-3">
              <div className="h-9 w-9 overflow-hidden rounded-md ring-1 ring-border/60 bg-muted/30">
                <img src="/logo.jpg" alt="Ocean Luxe" className="h-full w-full object-cover" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-wide">Ocean Luxe</div>
                <div className="text-[11px] text-muted-foreground">Experiences</div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/xp">
              <Button variant="ghost" size="sm">
                Browse
              </Button>
            </Link>
            <Link href="/xp/destinations">
              <Button variant="ghost" size="sm">
                Destinations
              </Button>
            </Link>
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="secondary" size="sm">
                    CRM
                  </Button>
                </Link>
                {isAdmin ? (
                  <Link href="/xp/admin">
                    <Button size="sm">XP Admin</Button>
                  </Link>
                ) : null}
              </>
            ) : (
              <Link href="/login">
                <Button variant="secondary" size="sm">
                  Staff login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      <footer className="border-t border-border/50 px-4 py-10">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">Ocean Luxe</div>
            <div className="text-xs text-muted-foreground">
              Bookings processed securely. For itinerary changes, contact your concierge.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
