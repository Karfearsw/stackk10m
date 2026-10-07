import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

export type ManualCompPayload = {
  address: string;
  city: string;
  state: string;
  zip: string;
  soldPrice: string;
  soldDate: string;
  sqft: string;
  beds: string;
  baths: string;
  rentPerMonth: string;
  isRentalComp: boolean;
  source: string;
  notes: string;
};

const empty: ManualCompPayload = {
  address: "",
  city: "",
  state: "",
  zip: "",
  soldPrice: "",
  soldDate: "",
  sqft: "",
  beds: "",
  baths: "",
  rentPerMonth: "",
  isRentalComp: false,
  source: "",
  notes: "",
};

/**
 * Manual comp entry dialog. Manual comps are REAL data the agent looked up
 * themselves — address, a price signal, and the source are required. Nothing
 * here is ever fabricated; rows are flagged manual and badged in the grid.
 */
export function ManualCompDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ManualCompPayload) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<ManualCompPayload>(empty);
  const set = (k: keyof ManualCompPayload) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e?.target?.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = () => {
    onSubmit(form);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setForm(empty);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Manual Comp</DialogTitle>
          <DialogDescription>
            Enter a comparable you verified yourself. Address, a price (sold or rent), and the source are required —
            manual comps are never invented.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <Label>Property address *</Label>
            <Input value={form.address} onChange={set("address")} placeholder="123 Main St" data-testid="input-manual-comp-address" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={set("city")} /></div>
            <div className="space-y-1"><Label>State</Label><Input value={form.state} onChange={set("state")} maxLength={2} placeholder="FL" /></div>
            <div className="space-y-1"><Label>Zip</Label><Input value={form.zip} onChange={set("zip")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Sold price *</Label><Input type="number" min="0" value={form.soldPrice} onChange={set("soldPrice")} placeholder="250000" data-testid="input-manual-comp-price" /></div>
            <div className="space-y-1"><Label>Sold date</Label><Input type="date" value={form.soldDate} onChange={set("soldDate")} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label>Sqft</Label><Input type="number" min="0" value={form.sqft} onChange={set("sqft")} /></div>
            <div className="space-y-1"><Label>Beds</Label><Input type="number" min="0" value={form.beds} onChange={set("beds")} /></div>
            <div className="space-y-1"><Label>Baths</Label><Input type="number" min="0" step="0.5" value={form.baths} onChange={set("baths")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div className="space-y-1"><Label>Rent / mo (rental comp)</Label><Input type="number" min="0" value={form.rentPerMonth} onChange={set("rentPerMonth")} placeholder="1800" /></div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox checked={form.isRentalComp} onCheckedChange={(v) => setForm((f) => ({ ...f, isRentalComp: !!v }))} />
              Rental comp
            </label>
          </div>
          <div className="space-y-1">
            <Label>Source *</Label>
            <Input value={form.source} onChange={set("source")} placeholder="e.g. MLS, listing agent, Zillow, county records" data-testid="input-manual-comp-source" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Optional context" />
          </div>
          <p className="text-xs text-muted-foreground">* required — one of sold price or rent is required</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={isPending || !form.address.trim() || !form.source.trim() || (!form.soldPrice && !form.rentPerMonth)} data-testid="button-save-manual-comp">
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Save Comp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
