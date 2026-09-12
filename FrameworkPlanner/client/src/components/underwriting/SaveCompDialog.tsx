import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractCompFromClipboardText } from "@/components/underwriting/comp-text";

export type SaveCompDialogValues = {
  address: string;
  url: string;
  soldPrice: string;
  beds: string;
  baths: string;
  sqft: string;
};

function parseNullableNumber(v: string): number | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * M8 fix: comps are now saved through this dialog with explicit, user-editable
 * fields (price/beds/baths/sqft) prefilled from the clipboard when possible.
 * The old "C" hotkey saved the subject page itself as a $0 junk comp.
 */
export function SaveCompDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAddress: string;
  defaultUrl: string;
  onSave: (comp: {
    address?: string;
    url?: string;
    soldPrice?: number | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
  }) => void;
}) {
  const [values, setValues] = useState<SaveCompDialogValues>(() => ({
    address: props.defaultAddress,
    url: props.defaultUrl,
    soldPrice: "",
    beds: "",
    baths: "",
    sqft: "",
  }));
  const [clipboardTried, setClipboardTried] = useState(false);

  useEffect(() => {
    if (!props.open) {
      setClipboardTried(false);
      return;
    }
    if (clipboardTried) return;
    setClipboardTried(true);
    let cancelled = false;
    (async () => {
      let clip = "";
      try {
        clip = await navigator.clipboard.readText();
      } catch {
        // clipboard unavailable/denied — fields stay empty for manual entry
      }
      if (cancelled || !clip) return;
      const extracted = extractCompFromClipboardText(clip);
      setValues((v) => ({
        ...v,
        soldPrice: v.soldPrice || (extracted.soldPrice != null ? String(extracted.soldPrice) : ""),
        beds: v.beds || (extracted.beds != null ? String(extracted.beds) : ""),
        baths: v.baths || (extracted.baths != null ? String(extracted.baths) : ""),
        sqft: v.sqft || (extracted.sqft != null ? String(extracted.sqft) : ""),
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [props.open, clipboardTried]);

  const set = (patch: Partial<SaveCompDialogValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = () => {
    props.onSave({
      address: values.address.trim(),
      url: values.url.trim(),
      soldPrice: parseNullableNumber(values.soldPrice),
      beds: parseNullableNumber(values.beds),
      baths: parseNullableNumber(values.baths),
      sqft: parseNullableNumber(values.sqft),
    });
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Save comp</DialogTitle>
          <DialogDescription>
            Prefilled from your clipboard when possible — review before saving.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="comp-address">Address</Label>
            <Input
              id="comp-address"
              value={values.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Comp address"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="comp-url">URL</Label>
            <Input
              id="comp-url"
              value={values.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-price">Sold price ($)</Label>
            <Input
              id="comp-price"
              inputMode="decimal"
              value={values.soldPrice}
              onChange={(e) => set({ soldPrice: e.target.value })}
              placeholder="e.g. 215000"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-sqft">Sqft</Label>
            <Input
              id="comp-sqft"
              inputMode="decimal"
              value={values.sqft}
              onChange={(e) => set({ sqft: e.target.value })}
              placeholder="e.g. 1450"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-beds">Beds</Label>
            <Input
              id="comp-beds"
              inputMode="decimal"
              value={values.beds}
              onChange={(e) => set({ beds: e.target.value })}
              placeholder="e.g. 3"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="comp-baths">Baths</Label>
            <Input
              id="comp-baths"
              inputMode="decimal"
              value={values.baths}
              onChange={(e) => set({ baths: e.target.value })}
              placeholder="e.g. 2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save comp</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
