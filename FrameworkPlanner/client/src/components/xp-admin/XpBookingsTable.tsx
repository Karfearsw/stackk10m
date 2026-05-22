import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MoreHorizontal } from "lucide-react";

export type XpBookingRow = {
  id: number;
  experienceId: number;
  kind: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  startAt: string;
  endAt: string;
  stripeCheckoutSessionId?: string | null;
  createdAt?: string | null;
  opsFlags?: {
    paymentStale?: boolean;
    startsSoon?: boolean;
    missingConcierge?: boolean;
    missingVehicle?: boolean;
    missingLocation?: boolean;
    hasRefund?: boolean;
  };
  assignment?: {
    locationId: number | null;
    locationName: string | null;
    vehicleId: number | null;
    vehicleName: string | null;
    conciergeUserId: number | null;
    conciergeName: string | null;
    conciergeEmail: string | null;
    assignedAt: string | Date | null;
  } | null;
};

function statusBadge(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "confirmed") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Confirmed</Badge>;
  if (s === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function opsBadges(flags: any) {
  const items: Array<{ key: string; label: string; className: string }> = [];
  if (flags?.paymentStale) items.push({ key: "paymentStale", label: "Payment stale", className: "bg-amber-500 hover:bg-amber-500 text-white" });
  if (flags?.startsSoon) items.push({ key: "startsSoon", label: "Starts soon", className: "bg-rose-600 hover:bg-rose-600 text-white" });
  if (flags?.missingConcierge) items.push({ key: "missingConcierge", label: "No concierge", className: "bg-slate-700 hover:bg-slate-700 text-white" });
  if (flags?.missingVehicle) items.push({ key: "missingVehicle", label: "No vehicle", className: "bg-slate-700 hover:bg-slate-700 text-white" });
  if (flags?.missingLocation) items.push({ key: "missingLocation", label: "No location", className: "bg-slate-700 hover:bg-slate-700 text-white" });
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.slice(0, 3).map((i) => (
        <Badge key={i.key} className={cn("px-2 py-0.5 text-[10px] font-medium", i.className)}>
          {i.label}
        </Badge>
      ))}
    </div>
  );
}

function kindLabel(kind: string) {
  const k = String(kind || "").toLowerCase();
  if (k === "date_range") return "Date range";
  return "Time slot";
}

export function XpBookingsTable({
  rows,
  experienceTitleById,
  onOpen,
  selectedIds,
  onSelectedIdsChange,
  onCreateBooking,
  onClearFilters,
  isAdmin,
  className,
}: {
  rows: XpBookingRow[];
  experienceTitleById: Map<number, string>;
  onOpen: (id: number) => void;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  onCreateBooking?: () => void;
  onClearFilters?: () => void;
  isAdmin: boolean;
  className?: string;
}) {
  const selected = new Set(selectedIds);
  const allChecked = rows.length > 0 && selectedIds.length === rows.length;
  const someChecked = selectedIds.length > 0 && selectedIds.length < rows.length;

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border/60 bg-background", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20">
            <TableHead className="w-[44px]">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={(v) => {
                  if (v) onSelectedIdsChange(rows.map((r) => r.id));
                  else onSelectedIdsChange([]);
                }}
              />
            </TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="w-[220px]">Window</TableHead>
            <TableHead className="w-[180px]">Concierge</TableHead>
            <TableHead className="w-[180px]">Vehicle</TableHead>
            <TableHead className="w-[200px]">Location</TableHead>
            <TableHead className="w-[140px]">Created</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => {
            const start = new Date(b.startAt);
            const end = new Date(b.endAt);
            const created = b.createdAt ? new Date(b.createdAt) : null;
            const startOk = Number.isFinite(start.getTime());
            const endOk = Number.isFinite(end.getTime());
            const createdOk = created && Number.isFinite(created.getTime());
            return (
              <TableRow
                key={b.id}
                className="cursor-pointer hover:bg-muted/20"
                onClick={() => onOpen(b.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(b.id)}
                    onCheckedChange={(v) => {
                      if (v) onSelectedIdsChange(Array.from(new Set([...selectedIds, b.id])));
                      else onSelectedIdsChange(selectedIds.filter((id) => id !== b.id));
                    }}
                  />
                </TableCell>
                <TableCell>
                  {statusBadge(b.status)}
                  {opsBadges(b.opsFlags)}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{experienceTitleById.get(b.experienceId) || `Experience #${b.experienceId}`}</div>
                  <div className="text-xs text-muted-foreground">Booking #{b.id}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{b.customerName}</div>
                  <div className="text-xs text-muted-foreground">{b.customerEmail}</div>
                  <div className="text-xs text-muted-foreground">{kindLabel(b.kind)}{b.stripeCheckoutSessionId ? " · Stripe" : ""}</div>
                </TableCell>
                <TableCell>
                  {startOk ? (
                    <div className="text-xs">{format(start, "MMM d, yyyy · h:mm a")}</div>
                  ) : (
                    <div className="text-xs">{String(b.startAt)}</div>
                  )}
                  {endOk ? (
                    <div className="text-xs text-muted-foreground">{format(end, "MMM d, yyyy · h:mm a")}</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">{String(b.endAt)}</div>
                  )}
                </TableCell>
                <TableCell>
                  {b.assignment?.conciergeUserId ? (
                    <>
                      <div className="text-xs font-medium">{b.assignment.conciergeName || "Assigned"}</div>
                      <div className="text-xs text-muted-foreground">{b.assignment.conciergeEmail || ""}</div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">Unassigned</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className={cn("text-xs", b.assignment?.vehicleId ? "text-foreground" : "text-muted-foreground")}>
                    {b.assignment?.vehicleName || "Not attached"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className={cn("text-xs", b.assignment?.locationId ? "text-foreground" : "text-muted-foreground")}>
                    {b.assignment?.locationName || "Not set"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">
                    {createdOk ? format(created!, "MMM d") : "—"}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpen(b.id)}>Details</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onOpen(b.id)}>Assign</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onOpen(b.id)}>Reschedule</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onOpen(b.id)}>Message guest</DropdownMenuItem>
                      {isAdmin ? <DropdownMenuItem onClick={() => onOpen(b.id)}>Refund</DropdownMenuItem> : null}
                      {isAdmin ? <DropdownMenuItem onClick={() => onOpen(b.id)}>Cancel</DropdownMenuItem> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="py-10 text-center">
                <div className="mx-auto max-w-md space-y-3">
                  <div className="text-sm text-muted-foreground">No bookings match this view.</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {onClearFilters ? (
                      <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
                        Clear filters
                      </Button>
                    ) : null}
                    {onCreateBooking && isAdmin ? (
                      <Button type="button" size="sm" onClick={onCreateBooking}>
                        Create booking
                      </Button>
                    ) : null}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
