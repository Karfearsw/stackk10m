import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";

type XpExperience = {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  mode?: string | null;
  currency?: string | null;
  depositAmount?: string | number | null;
  capacity?: number | null;
};

type XpAvailabilityTimeSlot = {
  id: number;
  startAt: string;
  endAt: string;
  capacity: number;
  remaining: number;
};

export default function XpExperiencePage() {
  const { toast } = useToast();
  const [, params] = useRoute("/xp/:slug");
  const slug = String(params?.slug || "").trim();

  const experienceQuery = useQuery<{ experience: XpExperience }>({
    queryKey: ["/api/xp/experiences", slug],
    enabled: !!slug,
    queryFn: async () => {
      const res = await fetch(`/api/xp/experiences/${encodeURIComponent(slug)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Not found");
      return json;
    },
  });

  const experience = experienceQuery.data?.experience;
  const mode = String(experience?.mode || "");

  const [kind, setKind] = useState<"time_slot" | "date_range">("time_slot");
  useEffect(() => {
    if (!mode) return;
    if (mode === "date_range") setKind("date_range");
    if (mode === "time_slot") setKind("time_slot");
  }, [mode]);

  const windowFromTo = useMemo(() => {
    const from = new Date();
    const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return { from, to, fromIso: from.toISOString(), toIso: to.toISOString() };
  }, []);

  const availabilityQuery = useQuery<any>({
    queryKey: ["/api/xp/experiences", slug, "availability", windowFromTo.fromIso, windowFromTo.toIso],
    enabled: !!slug && !!experience && (mode === "time_slot" || mode === "both" || mode === "date_range"),
    queryFn: async () => {
      const url = `/api/xp/experiences/${encodeURIComponent(slug)}/availability?from=${encodeURIComponent(windowFromTo.fromIso)}&to=${encodeURIComponent(windowFromTo.toIso)}`;
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load availability");
      return json;
    },
  });

  const timeSlots: XpAvailabilityTimeSlot[] = Array.isArray(availabilityQuery.data?.timeSlots) ? availabilityQuery.data.timeSlots : [];

  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const selectedSlot = useMemo(() => {
    const id = parseInt(selectedSlotId, 10);
    return Number.isFinite(id) ? timeSlots.find((s) => Number(s.id) === id) : undefined;
  }, [selectedSlotId, timeSlots]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        experienceSlug: slug,
        kind,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || undefined,
      };

      if (!payload.customerName || !payload.customerEmail) throw new Error("Name and email are required");

      if (kind === "time_slot") {
        if (!selectedSlot) throw new Error("Select a time slot");
        payload.startAt = selectedSlot.startAt;
        payload.endAt = selectedSlot.endAt;
      } else {
        if (!startDate || !endDate) throw new Error("Select dates");
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error("Invalid dates");
        payload.startAt = start.toISOString();
        payload.endAt = end.toISOString();
      }

      const res = await apiRequest("POST", "/api/xp/bookings/checkout", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      const url = String(data?.checkoutUrl || "").trim();
      if (!url) {
        toast({ title: "Checkout failed", description: "Missing checkout URL", variant: "destructive" as any });
        return;
      }
      window.location.href = url;
    },
    onError: (err: any) => {
      toast({ title: "Checkout failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const allowTimeSlot = mode === "time_slot" || mode === "both";
  const allowDateRange = mode === "date_range" || mode === "both";

  const ready = !!experience && ((kind === "time_slot" && !!selectedSlot) || (kind === "date_range" && !!startDate && !!endDate));

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{experience?.title || "Experience"}</h1>
            {experience?.description ? <p className="text-muted-foreground">{experience.description}</p> : null}
          </div>
          <Link href="/xp">
            <Button variant="outline">All experiences</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Booking details</CardTitle>
            <CardDescription>Deposit required to confirm your reservation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "both" && (
              <div className="space-y-2">
                <Label>Booking type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v === "date_range" ? "date_range" : "time_slot")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time_slot">Time slot</SelectItem>
                    <SelectItem value="date_range">Date range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {kind === "time_slot" && (
              <div className="space-y-2">
                <Label>Time slot</Label>
                {!allowTimeSlot ? (
                  <div className="text-sm text-destructive">This experience does not support time-slot bookings.</div>
                ) : (
                  <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a time slot" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots
                        .filter((s) => Number(s.remaining || 0) > 0)
                        .map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {new Date(s.startAt).toLocaleString()} ({s.remaining}/{s.capacity} left)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {kind === "date_range" && (
              <div className="space-y-3">
                {!allowDateRange ? (
                  <div className="text-sm text-destructive">This experience does not support date-range bookings.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Start date</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>End date</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Phone (optional)</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+1…" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Deposit: {experience?.depositAmount ?? "—"} {String(experience?.currency || "USD").toUpperCase()}
              </div>
              <Button disabled={!ready || checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()}>
                Pay deposit
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
