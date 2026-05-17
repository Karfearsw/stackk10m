import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type XpBookingFilters = {
  experienceId: string;
  status: string;
  kind: string;
  locationId: string;
  vehicleId: string;
  conciergeUserId: string;
  from: string;
  to: string;
};

export type XpSavedViewId = "all" | "today" | "upcoming_7" | "pending_payment" | "confirmed" | "cancelled";

export function XpBookingsSavedViews({
  value,
  onChange,
  className,
}: {
  value: XpSavedViewId;
  onChange: (v: XpSavedViewId) => void;
  className?: string;
}) {
  const items: Array<{ id: XpSavedViewId; label: string }> = [
    { id: "all", label: "All" },
    { id: "today", label: "Today" },
    { id: "upcoming_7", label: "Next 7 days" },
    { id: "pending_payment", label: "Pending payment" },
    { id: "confirmed", label: "Confirmed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((i) => (
        <Button
          key={i.id}
          type="button"
          size="sm"
          variant={value === i.id ? "default" : "secondary"}
          onClick={() => onChange(i.id)}
        >
          {i.label}
        </Button>
      ))}
    </div>
  );
}
