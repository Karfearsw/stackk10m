import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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

function kindLabel(kind: string) {
  const k = String(kind || "").toLowerCase();
  if (k === "date_range") return "Date range";
  return "Time slot";
}

export function XpBookingsTable({
  rows,
  experienceTitleById,
  onOpen,
  className,
}: {
  rows: XpBookingRow[];
  experienceTitleById: Map<number, string>;
  onOpen: (id: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border/60 bg-background", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20">
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead>Experience</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="w-[220px]">Window</TableHead>
            <TableHead className="w-[180px]">Concierge</TableHead>
            <TableHead className="w-[180px]">Vehicle</TableHead>
            <TableHead className="w-[200px]">Location</TableHead>
            <TableHead className="w-[140px]">Created</TableHead>
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
                <TableCell>{statusBadge(b.status)}</TableCell>
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
              </TableRow>
            );
          })}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                No bookings match this view.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
