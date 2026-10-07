/**
 * Investor portal shell: a SEPARATE layout from the agent CRM.
 * Dark luxury theme — near-black backgrounds, gold accent (#D4AF37),
 * white serif headings.
 */
import { ReactNode, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Compass, Heart, FileText, SlidersHorizontal, MessageCircle, User, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvestorSession } from "./api";

const NAV = [
  { href: "/investor/discover", label: "Discover", icon: Compass },
  { href: "/investor/saved", label: "Saved", icon: Heart },
  { href: "/investor/offers", label: "My Offers", icon: FileText },
  { href: "/investor/buy-box", label: "Buy Box", icon: SlidersHorizontal },
  { href: "/investor/messages", label: "Messages", icon: MessageCircle },
  { href: "/investor/account", label: "Account", icon: User },
];

export function InvestorLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useInvestorSession();

  const nav = (
    <nav className="flex flex-col gap-1 p-4">
      {NAV.map((item) => {
        const active = location === item.href || location.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <a
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[#D4AF37]/15 text-[#D4AF37]"
                  : "text-neutral-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </a>
          </Link>
        );
      })}
      <button
        onClick={async () => { await logout(); setLocation("/investor/login"); }}
        className="mt-4 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-neutral-500 hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-5 w-5" />
        Sign out
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/investor/discover">
            <a className="flex items-center gap-2">
              <span className="font-serif text-xl tracking-wide text-white">Ocean<span className="text-[#D4AF37]">Luxe</span></span>
              <span className="rounded-full border border-[#D4AF37]/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#D4AF37]">Investor</span>
            </a>
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-neutral-400 sm:block">
                {user.firstName} {user.lastName}
              </span>
            )}
            <button className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
        {mobileOpen && <div className="border-t border-white/10 md:hidden">{nav}</div>}
      </header>

      <div className="mx-auto flex max-w-6xl">
        <aside className="hidden w-60 shrink-0 border-r border-white/10 md:block">
          <div className="sticky top-[57px]">{nav}</div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function InvestorPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="font-serif text-2xl text-white sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Guard: requires an active investor session; redirects to /investor/login. */
export function RequireInvestor({ children }: { children: ReactNode }) {
  const { user, loading } = useInvestorSession();
  const [, setLocation] = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]" />
      </div>
    );
  }
  if (!user) {
    setLocation("/investor/login");
    return null;
  }
  return <InvestorLayout>{children}</InvestorLayout>;
}

/** Re-exported for route files. */
export function useInvestorRoute() {
  return useRoute("/investor/:page");
}
