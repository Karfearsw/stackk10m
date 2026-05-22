import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { XpBookingFilters, XpSavedViewId } from "./XpBookingsSavedViews";
import { useQuery } from "@tanstack/react-query";

type Summary = {
  total: number;
  counts: Record<string, number>;
  missing: { concierge: number; vehicle: number; location: number };
  arrivals: number;
};

function toIsoDayStart(d: Date) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString();
}

function toIsoDayEnd(d: Date) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt.toISOString();
}

export function XpBookingsSummary({
  filters,
  isAdmin,
  onPickView,
  className,
}: {
  filters: XpBookingFilters;
  isAdmin: boolean;
  onPickView: (id: XpSavedViewId) => void;
  className?: string;
}) {
  const today = new Date();

  const summaryQuery = useQuery<Summary>({
    queryKey: ["xp-admin-bookings-summary", filters, isAdmin],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (filters.experienceId !== "all") qs.set("experienceId", filters.experienceId);
      if (filters.status !== "all") qs.set("status", filters.status);
      if (filters.kind !== "all") qs.set("kind", filters.kind);
      if (filters.locationId !== "all") qs.set("locationId", filters.locationId);
      if (filters.vehicleId !== "all") qs.set("vehicleId", filters.vehicleId);
      if (isAdmin && filters.conciergeUserId !== "all") qs.set("conciergeUserId", filters.conciergeUserId);
      if (filters.from) qs.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
      if (filters.to) qs.set("to", new Date(`${filters.to}T23:59:59`).toISOString());
      qs.set("arrivalsFrom", toIsoDayStart(today));
      qs.set("arrivalsTo", toIsoDayEnd(today));

      const res = await fetch(`/api/xp/admin/bookings/summary?${qs.toString()}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json as any;
    },
  });

  const s = summaryQuery.data;
  const counts = s?.counts || {};
  const pending = Number(counts.pending_payment || 0);
  const confirmed = Number(counts.confirmed || 0);
  const cancelled = Number(counts.cancelled || 0);
  const refunded = Number(counts.refunded || 0);
  const unassigned = Number(s?.missing?.concierge || 0);
  const needsVehicle = Number(s?.missing?.vehicle || 0);
  const needsLocation = Number(s?.missing?.location || 0);
  const arrivals = Number(s?.arrivals || 0);

  function metric(label: string, value: number, onClick: () => void) {
    return (
      <Button type="button" variant="secondary" className="h-auto w-full justify-between px-4 py-3" onClick={onClick}>
        <div className="text-left">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{Number.isFinite(value) ? value : 0}</div>
        </div>
      </Button>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8", className)}>
      {metric("Total", Number(s?.total || 0), () => onPickView("all"))}
      {metric("Pending", pending, () => onPickView("pending_payment"))}
      {metric("Unassigned", unassigned, () => onPickView("unassigned_concierge"))}
      {metric("Needs vehicle", needsVehicle, () => onPickView("needs_vehicle"))}
      {metric("Needs location", needsLocation, () => onPickView("needs_location"))}
      {metric("Arrivals today", arrivals, () => onPickView("arrivals_today"))}
      {metric("Cancelled", cancelled, () => onPickView("cancelled"))}
      {metric("Refunded", refunded, () => onPickView("refunded"))}
      {summaryQuery.isError ? <div className="col-span-full text-xs text-destructive">{String((summaryQuery.error as any)?.message || summaryQuery.error)}</div> : null}
    </div>
  );
}

