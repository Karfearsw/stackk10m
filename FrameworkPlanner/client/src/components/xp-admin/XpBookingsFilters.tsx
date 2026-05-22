import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { XpBookingFilters } from "./XpBookingsSavedViews";

type ExperienceLite = { id: number; title: string };
type LocationLite = { id: number; name: string };
type VehicleLite = { id: number; name: string };
type ConciergeLite = { id: number; email: string; firstName?: string | null; lastName?: string | null };

export function XpBookingsFilters({
  experiences,
  locations,
  vehicles,
  concierges,
  showConcierge,
  filters,
  onChange,
  className,
}: {
  experiences: ExperienceLite[];
  locations: LocationLite[];
  vehicles: VehicleLite[];
  concierges: ConciergeLite[];
  showConcierge: boolean;
  filters: XpBookingFilters;
  onChange: (next: XpBookingFilters) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-12", className)}>
      <div className="space-y-2 md:col-span-4">
        <Label>Experience</Label>
        <Select value={filters.experienceId} onValueChange={(v) => onChange({ ...filters, experienceId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="All experiences" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {experiences.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>Status</Label>
        <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending_payment">Pending payment</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>Kind</Label>
        <Select value={filters.kind} onValueChange={(v) => onChange({ ...filters, kind: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="time_slot">Time slot</SelectItem>
            <SelectItem value="date_range">Date range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>Location</Label>
        <Select value={filters.locationId} onValueChange={(v) => onChange({ ...filters, locationId: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>Vehicle</Label>
        <Select value={filters.vehicleId} onValueChange={(v) => onChange({ ...filters, vehicleId: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={String(v.id)}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showConcierge ? (
        <div className="space-y-2 md:col-span-4">
          <Label>Concierge</Label>
          <Select value={filters.conciergeUserId} onValueChange={(v) => onChange({ ...filters, conciergeUserId: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {concierges.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2 md:col-span-2">
        <Label>From</Label>
        <Input type="date" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })} />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>To</Label>
        <Input type="date" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })} />
      </div>
    </div>
  );
}
