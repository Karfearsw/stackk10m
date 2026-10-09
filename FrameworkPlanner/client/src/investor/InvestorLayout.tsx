/**
 * Investor Deal Matchroom shell (Phase 9): a SEPARATE layout from the agent CRM.
 *
 * Primary nav: Discover, Matches, Buy Boxes, Locked Up, More.
 * Desktop = side nav; mobile = fixed bottom nav. "More" opens a bottom
 * sheet with the wider Ocean Luxe workspace links.
 *
 * Original Ocean Luxe editorial design — no third-party app branding,
 * wording, or icons are copied here.
 */
import { ReactNode, useState } from "react";
import type { ReactNode as RN } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  Compass, Crosshair, Boxes, Lock, MoreHorizontal, LogOut,
  Users, Handshake, Contact, FileSignature, ScrollText, DoorOpen,
  ListChecks, Clock, FlaskConical, BarChart3, Settings, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvestorSession } from "./api";
import { LuxeBottomSheet } from "@/components/luxe";

export const TAGLINE = "Date the deal. Match the buy box. Lock up the opportunity.";

const PRIMARY_NAV = [
  { href: "/investor/discover", label: "Discover", icon: Compass },
  { href: "/investor/matches", label: "Matches", icon: Crosshair },
  { href: "/investor/buy-boxes", label: "Buy Boxes", icon: Boxes },
  { href: "/investor/locked-up", label: "Locked Up", icon: Lock },
] as const;

type MoreGroup = { heading: string; links: { href: string; label: string; icon: RN }[] };

const MORE_GROUPS: MoreGroup[] = [
  {
    heading: "Workspace",
    links: [
      { href: "/leads", label: "Leads", icon: <Users className="h-5 w-5" /> },
      { href: "/buyers", label: "Buyers", icon: <Handshake className="h-5 w-5" /> },
      { href: "/contacts", label: "Contacts", icon: <Contact className="h-5 w-5" /> },
      { href: "/lois", label: "Offers", icon: <FileSignature className="h-5 w-5" /> },
      { href: "/contracts", label: "Contracts", icon: <ScrollText className="h-5 w-5" /> },
      { href: "/opportunities", label: "Deal Rooms", icon: <DoorOpen className="h-5 w-5" /> },
    ],
  },
  {
    heading: "Work",
    links: [
      { href: "/tasks", label: "Tasks", icon: <ListChecks className="h-5 w-5" /> },
      { href: "/timesheet", label: "Timesheets", icon: <Clock className="h-5 w-5" /> },
      { href: "/playground", label: "Playground", icon: <FlaskConical className="h-5 w-5" /> },
      { href: "/analytics", label: "Reports", icon: <BarChart3 className="h-5 w-5" /> },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
    ],
  },
];

function isActivePath(location: string, href: string): boolean {
  return location === href || location.startsWith(href + "/");
}

export function InvestorLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, logout } = useInvestorSession();

  const signOut = async () => {
    await logout();
    setMoreOpen(false);
    setLocation("/investor/login");
  };

  const primaryItem = (href: string, label: string, Icon: (typeof PRIMARY_NAV)[number]["icon"], mobile: boolean) => {
    const active = isActivePath(location, href);
    return (
      <Link key={href} href={href}>
        <a
          className={cn(
            "flex items-center gap-3 transition-colors",
            mobile
              ? "flex-col gap-1 px-2 py-2 text-[10px] font-medium"
              : "rounded-lg px-4 py-3 text-sm font-medium",
            active
              ? mobile
                ? "text-primary"
                : "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
            !mobile && !active && "hover:bg-muted/50",
          )}
        >
          <Icon className={cn(mobile ? "h-5 w-5" : "h-5 w-5", active && mobile && "text-primary")} />
          {label}
        </a>
      </Link>
    );
  };

  const moreButton = (mobile: boolean) => (
    <button
      type="button"
      onClick={() => setMoreOpen(true)}
      className={cn(
        "flex items-center gap-3 transition-colors",
        mobile
          ? "flex-col gap-1 px-2 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          : "w-full rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <MoreHorizontal className="h-5 w-5" />
      More
    </button>
  );

  const desktopNav = (
    <nav className="flex flex-col gap-1 p-4">
      {PRIMARY_NAV.map((item) => primaryItem(item.href, item.label, item.icon, false))}
      {moreButton(false)}
      <button
        type="button"
        onClick={signOut}
        className="mt-4 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <LogOut className="h-5 w-5" />
        Sign out
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/investor/discover">
            <a className="flex min-w-0 items-center gap-2">
              <span className="font-serif text-xl tracking-wide">Ocean<span className="text-primary">Luxe</span></span>
              <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                Investor
              </span>
              <span className="hidden truncate text-xs text-muted-foreground lg:inline">{TAGLINE}</span>
            </a>
          </Link>
          {user && (
            <span className="hidden truncate text-sm text-muted-foreground sm:block">
              {user.firstName} {user.lastName}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl">
        <aside className="hidden w-60 shrink-0 border-r border-border md:block">
          <div className="sticky top-[57px]">{desktopNav}</div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden" aria-label="Investor">
        <div className="grid grid-cols-5">
          {PRIMARY_NAV.map((item) => primaryItem(item.href, item.label, item.icon, true))}
          {moreButton(true)}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* More sheet */}
      <LuxeBottomSheet open={moreOpen} onOpenChange={setMoreOpen} title="More" description="The wider Ocean Luxe workspace.">
        <div className="flex flex-col gap-6">
          {MORE_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {group.heading}
              </p>
              <div className="flex flex-col gap-1">
                {group.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                  >
                    <span className="text-primary">{link.icon}</span>
                    {link.label}
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </LuxeBottomSheet>
    </div>
  );
}

export function InvestorPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="font-serif text-2xl text-foreground sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
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
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
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
