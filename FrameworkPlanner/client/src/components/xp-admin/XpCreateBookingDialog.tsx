import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

type ExperienceLite = { id: number; title: string; slug: string };

function dtLocalToIso(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error("Clipboard unavailable"));
}

export function XpCreateBookingDialog({
  open,
  onOpenChange,
  experiences,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  experiences: ExperienceLite[];
  onCreated: (bookingId: number) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [experienceId, setExperienceId] = useState<string>("all");
  const selected = useMemo(() => experiences.find((e) => String(e.id) === experienceId) || null, [experiences, experienceId]);

  const [kind, setKind] = useState<"time_slot" | "date_range">("time_slot");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);

  const [messageTemplate, setMessageTemplate] = useState<"payment_link" | "custom">("payment_link");
  const [customMessage, setCustomMessage] = useState("");

  const [lastCheckoutUrl, setLastCheckoutUrl] = useState<string | null>(null);
  const [lastBookingId, setLastBookingId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (experienceId === "all") throw new Error("Select an experience");
      const startIso = dtLocalToIso(startAt);
      const endIso = dtLocalToIso(endAt);
      if (!startIso || !endIso) throw new Error("Start/end required");
      const payload: any = {
        experienceId: parseInt(experienceId, 10),
        kind,
        startAt: startIso,
        endAt: endIso,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || undefined,
        sendEmail: !!sendEmail,
        sendSms: !!sendSms,
        messageTemplate,
        customMessage: messageTemplate === "custom" ? customMessage.trim() : undefined,
      };
      const res = await apiRequest("POST", "/api/xp/admin/bookings/checkout", payload);
      return res.json();
    },
    onSuccess: async (data: any) => {
      const bookingId = Number(data?.booking?.id || 0);
      const checkoutUrl = typeof data?.checkoutUrl === "string" ? data.checkoutUrl : null;
      setLastBookingId(Number.isFinite(bookingId) ? bookingId : null);
      setLastCheckoutUrl(checkoutUrl);
      await qc.invalidateQueries({ queryKey: ["xp-admin-bookings"] });
      toast({ title: "Booking created" });
      if (Number.isFinite(bookingId) && bookingId > 0) onCreated(bookingId);
    },
    onError: (err: any) => toast({ title: "Create failed", description: String(err?.message || err), variant: "destructive" as any }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create booking + send payment link</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Experience</Label>
              <Select value={experienceId} onValueChange={setExperienceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Select…</SelectItem>
                  {experiences.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v === "date_range" ? "date_range" : "time_slot")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time_slot">Time slot</SelectItem>
                  <SelectItem value="date_range">Date range</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label>Customer name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label>Email</Label>
              <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label>Phone</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+1…" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label>Message</Label>
              <Select value={messageTemplate} onValueChange={(v) => setMessageTemplate(v === "custom" ? "custom" : "payment_link")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_link">Payment link template</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-8 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={sendEmail} onCheckedChange={(v) => setSendEmail(Boolean(v))} />
                <div className="text-sm">Send email</div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={sendSms} onCheckedChange={(v) => setSendSms(Boolean(v))} />
                <div className="text-sm">Send SMS</div>
              </div>
            </div>
          </div>

          {messageTemplate === "custom" ? (
            <div className="space-y-2">
              <Label>Custom message</Label>
              <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Write your message. Payment link is appended if missing." />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Uses the default payment-link template for {selected?.title || "the selected experience"}.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Create booking
            </Button>
            {lastCheckoutUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => copyText(lastCheckoutUrl).then(() => toast({ title: "Copied link" })).catch(() => {})}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </Button>
                <Button type="button" variant="secondary" onClick={() => typeof window !== "undefined" && window.open(lastCheckoutUrl, "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </Button>
                {lastBookingId ? <div className="text-xs text-muted-foreground">Booking #{lastBookingId}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

