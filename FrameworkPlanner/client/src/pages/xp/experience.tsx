import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { XpPublicShell } from "@/components/xp/XpPublicShell";
import { coerceXpItinerary } from "@/lib/xp/itinerary";
import { CalendarDays, Clock3, MapPin, ShieldCheck } from "lucide-react";
import type { DateRange } from "react-day-picker";

type XpExperience = {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  mode?: string | null;
  paymentMode?: string | null;
  currency?: string | null;
  priceTotal?: string | number | null;
  depositAmount?: string | number | null;
  capacity?: number | null;
  images?: string[] | null;
  location?: string | null;
  locationId?: number | null;
  destination?: {
    id: number;
    name: string;
    slug?: string | null;
    heroImage?: string | null;
    images?: string[] | null;
    description?: string | null;
    highlights?: string[] | null;
  } | null;
  durationMinutes?: number | null;
  highlights?: string[] | null;
  inclusions?: string[] | null;
  cancellationPolicy?: string | null;
  itinerary?: any;
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
  const { isAuthenticated, user } = useAuth();
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
  const paymentMode = String(experience?.paymentMode || "deposit").toLowerCase();
  const currency = String(experience?.currency || "USD").toUpperCase();
  const itinerary = useMemo(() => coerceXpItinerary(experience?.itinerary), [experience?.itinerary]);
  const destinationName = String(experience?.destination?.name || experience?.location || "").trim();
  const galleryImages = useMemo(() => {
    const exp = (Array.isArray(experience?.images) ? experience?.images : []).map((x) => String(x || "").trim()).filter(Boolean);
    if (exp.length) return exp;
    const hero = String(experience?.destination?.heroImage || "").trim();
    const dest = (Array.isArray(experience?.destination?.images) ? experience?.destination?.images : []).map((x) => String(x || "").trim()).filter(Boolean);
    return Array.from(new Set([hero, ...dest].filter(Boolean)));
  }, [experience?.destination?.heroImage, experience?.destination?.images, experience?.images]);

  const [kind, setKind] = useState<"time_slot" | "date_range">("time_slot");
  useEffect(() => {
    if (!mode) return;
    if (mode === "date_range") setKind("date_range");
    if (mode === "time_slot") setKind("time_slot");
    if (mode === "both") setKind("time_slot");
  }, [mode]);

  const windowFromTo = useMemo(() => {
    const from = new Date();
    const to = addDays(from, 60);
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

  const availabilityBlackouts: Array<{ startAt: string; endAt: string }> = Array.isArray(availabilityQuery.data?.blackouts) ? availabilityQuery.data.blackouts : [];
  const availabilityBooked: Array<{ startAt: string; endAt: string }> = Array.isArray(availabilityQuery.data?.booked) ? availabilityQuery.data.booked : [];
  const dateRangeCapacity = typeof availabilityQuery.data?.capacity === "number" ? availabilityQuery.data.capacity : 1;

  const blackoutRanges = useMemo(() => {
    return availabilityBlackouts
      .map((r) => ({ start: new Date(r.startAt), end: new Date(r.endAt) }))
      .filter((r) => Number.isFinite(r.start.getTime()) && Number.isFinite(r.end.getTime()));
  }, [availabilityBlackouts]);

  const bookedRanges = useMemo(() => {
    return availabilityBooked
      .map((r) => ({ start: new Date(r.startAt), end: new Date(r.endAt) }))
      .filter((r) => Number.isFinite(r.start.getTime()) && Number.isFinite(r.end.getTime()));
  }, [availabilityBooked]);

  function isInAnyRange(date: Date, ranges: Array<{ start: Date; end: Date }>) {
    const t = date.getTime();
    for (const r of ranges) {
      if (t >= r.start.getTime() && t < r.end.getTime()) return true;
    }
    return false;
  }

  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const name = `${String(user.firstName || "").trim()} ${String(user.lastName || "").trim()}`.trim();
    if (name && !customerName) setCustomerName(name);
    if (user.email && !customerEmail) setCustomerEmail(user.email);
  }, [customerEmail, customerName, isAuthenticated, user]);

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
        if (!range?.from || !range?.to) throw new Error("Select dates");
        const start = new Date(`${format(range.from, "yyyy-MM-dd")}T00:00:00`);
        const end = new Date(`${format(range.to, "yyyy-MM-dd")}T00:00:00`);
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

  const ready = !!experience && ((kind === "time_slot" && !!selectedSlot) || (kind === "date_range" && !!range?.from && !!range?.to));

  const dueNow = paymentMode === "full" ? experience?.priceTotal : experience?.depositAmount;
  const total = experience?.priceTotal;

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, XpAvailabilityTimeSlot[]>();
    for (const s of timeSlots.filter((x) => Number(x.remaining || 0) > 0)) {
      const d = new Date(s.startAt);
      const key = Number.isFinite(d.getTime()) ? d.toDateString() : "Other";
      const list = groups.get(key) || [];
      list.push(s);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([k, v]) => ({ key: k, date: new Date(k), slots: v.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()) }));
  }, [timeSlots]);

  return (
    <XpPublicShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-background/60 backdrop-blur">
                Experiences
              </Badge>
              {destinationName ? (
                <Badge variant="outline" className="bg-background/40">
                  <MapPin className="mr-1 h-3.5 w-3.5" />
                  {destinationName}
                </Badge>
              ) : null}
              {experience?.durationMinutes ? (
                <Badge variant="outline" className="bg-background/40">
                  <Clock3 className="mr-1 h-3.5 w-3.5" />
                  {experience.durationMinutes} min
                </Badge>
              ) : null}
              {experience?.mode ? (
                <Badge variant="outline" className="bg-background/40">
                  <CalendarDays className="mr-1 h-3.5 w-3.5" />
                  {String(experience.mode).replace(/_/g, " ")}
                </Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {experience?.title || "Experience"}
            </h1>
            {experience?.description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                {experience.description}
              </p>
            ) : null}
          </div>

          <Link href="/xp">
            <Button variant="secondary">All experiences</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {galleryImages.slice(0, 4).map((src) => (
                <div key={src} className="aspect-[16/10] overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                  <img src={src} alt={experience?.title || "Experience"} className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>

            {Array.isArray(experience?.highlights) && experience?.highlights?.length ? (
              <Card className="border-border/60 bg-background/60 backdrop-blur">
                <CardContent className="p-5">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Highlights</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {experience.highlights.map((h) => (
                      <Badge key={h} variant="secondary" className="bg-muted/30">
                        {h}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {itinerary?.sections?.length ? (
              <Card className="border-border/60 bg-background/60 backdrop-blur">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold tracking-tight">Itinerary</div>
                    <div className="text-xs text-muted-foreground">Curated by Ocean Luxe</div>
                  </div>
                  <div className="space-y-4">
                    {itinerary.sections.map((s) => (
                      <div key={s.title} className="space-y-2">
                        <div className="text-sm font-semibold">{s.title}</div>
                        {s.bullets.length ? (
                          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                            {s.bullets.map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {experience?.cancellationPolicy ? (
              <Card className="border-border/60 bg-background/60 backdrop-blur">
                <CardContent className="p-5 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cancellation</div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{experience.cancellationPolicy}</div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="lg:col-span-5">
            <Card className="border-border/60 bg-background/70 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] backdrop-blur">
              <CardContent className="p-5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold tracking-tight">Book this experience</div>
                    <div className="text-sm text-muted-foreground">
                      {paymentMode === "full" ? "Full payment confirms your reservation." : "Deposit confirms your reservation."}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Secure checkout
                  </div>
                </div>

                {mode === "both" ? (
                  <div className="space-y-2">
                    <Label>Booking type</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={kind === "time_slot" ? "default" : "secondary"}
                        onClick={() => setKind("time_slot")}
                        disabled={!allowTimeSlot}
                        className="flex-1"
                      >
                        Time slot
                      </Button>
                      <Button
                        type="button"
                        variant={kind === "date_range" ? "default" : "secondary"}
                        onClick={() => setKind("date_range")}
                        disabled={!allowDateRange}
                        className="flex-1"
                      >
                        Date range
                      </Button>
                    </div>
                  </div>
                ) : null}

                {kind === "time_slot" ? (
                  <div className="space-y-2">
                    <Label>Time slot</Label>
                    {!allowTimeSlot ? (
                      <div className="text-sm text-destructive">This experience does not support time-slot bookings.</div>
                    ) : (
                      <div className="space-y-3">
                        {groupedSlots.length === 0 ? (
                          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                            No available time slots in the next 60 days.
                          </div>
                        ) : (
                          groupedSlots.map((g) => (
                            <div key={g.key} className="space-y-2">
                              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {Number.isFinite(g.date.getTime()) ? format(g.date, "EEE, MMM d") : g.key}
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                {g.slots.map((s) => {
                                  const selected = String(s.id) === selectedSlotId;
                                  const start = new Date(s.startAt);
                                  const label = Number.isFinite(start.getTime())
                                    ? format(start, "h:mm a")
                                    : new Date(s.startAt).toLocaleString();
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      className={[
                                        "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition",
                                        selected ? "border-primary bg-primary/10" : "border-border/60 bg-background/50 hover:bg-background/80",
                                      ].join(" ")}
                                      onClick={() => setSelectedSlotId(String(s.id))}
                                    >
                                      <div className="text-sm font-medium">{label}</div>
                                      <div className="text-xs text-muted-foreground">{s.remaining}/{s.capacity} left</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Date range</Label>
                    {!allowDateRange ? (
                      <div className="text-sm text-destructive">This experience does not support date-range bookings.</div>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="secondary" className="w-full justify-between">
                            {range?.from && range?.to ? (
                              <span>
                                {format(range.from, "MMM d, yyyy")} → {format(range.to, "MMM d, yyyy")}
                              </span>
                            ) : (
                              <span>Select dates</span>
                            )}
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="range"
                            selected={range}
                            onSelect={setRange}
                            numberOfMonths={2}
                            disabled={(date) => {
                              if (isInAnyRange(date, blackoutRanges)) return true;
                              if (dateRangeCapacity <= 1 && isInAnyRange(date, bookedRanges)) return true;
                              return false;
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Blackout dates are disabled. Final confirmation happens at checkout.
                    </div>
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

                <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Due now</div>
                    <div className="text-sm font-semibold">
                      {dueNow ?? "—"} {currency}
                    </div>
                  </div>
                  {paymentMode !== "full" && total ? (
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Total</span>
                      <span>
                        {total} {currency}
                      </span>
                    </div>
                  ) : null}
                </div>

                <Button disabled={!ready || checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()} className="w-full">
                  {paymentMode === "full" ? "Pay now" : "Pay deposit"}
                </Button>

                {isAuthenticated ? (
                  <div className="text-xs text-muted-foreground">
                    Staff note: bookings will appear in CRM for follow-up and adjustments.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </XpPublicShell>
  );
}
