import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, Ticket, User, Mail, Phone, MapPin, Car, Link2, CalendarClock, CreditCard, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BookingDetail = {
  booking: any;
  experience: any | null;
  events?: any[];
  messages?: any[];
  refunds?: any[];
};

type LocationLite = { id: number; name: string };
type VehicleLite = { id: number; name: string };
type ConciergeLite = { id: number; email: string; firstName?: string | null; lastName?: string | null };

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error("Clipboard unavailable"));
}

export function XpBookingDrawer({
  open,
  onOpenChange,
  bookingId,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: number | null;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detailQuery = useQuery<BookingDetail>({
    queryKey: ["xp-admin-booking", bookingId],
    enabled: open && typeof bookingId === "number" && Number.isFinite(bookingId),
    queryFn: async () => {
      const res = await fetch(`/api/xp/admin/bookings/${encodeURIComponent(String(bookingId))}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load booking");
      return json as any;
    },
  });

  const locationsQuery = useQuery<{ items: LocationLite[] }>({
    queryKey: ["/api/xp/admin/locations", "active"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/xp/admin/locations?activeOnly=true", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load locations");
      return json;
    },
  });

  const vehiclesQuery = useQuery<{ items: VehicleLite[] }>({
    queryKey: ["/api/xp/admin/vehicles", "active"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/xp/admin/vehicles?activeOnly=true", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load vehicles");
      return json;
    },
  });

  const conciergesQuery = useQuery<{ items: ConciergeLite[] }>({
    queryKey: ["/api/xp/admin/concierges"],
    enabled: open && isAdmin,
    queryFn: async () => {
      const res = await fetch("/api/xp/admin/concierges", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load concierges");
      return json;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!bookingId) throw new Error("Missing booking");
      const res = await apiRequest("POST", `/api/xp/admin/bookings/${bookingId}/cancel`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking", bookingId] });
      toast({ title: "Booking cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Cancel failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const assignmentMutation = useMutation({
    mutationFn: async (input: { locationId: string; vehicleId: string; conciergeUserId: string }) => {
      if (!bookingId) throw new Error("Missing booking");
      const payload: any = {
        locationId: input.locationId === "none" ? null : parseInt(input.locationId, 10),
        vehicleId: input.vehicleId === "none" ? null : parseInt(input.vehicleId, 10),
      };
      if (isAdmin) {
        payload.conciergeUserId = input.conciergeUserId === "none" ? null : parseInt(input.conciergeUserId, 10);
      }
      const res = await apiRequest("PUT", `/api/xp/admin/bookings/${bookingId}/assignment`, payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking", bookingId] });
      toast({ title: "Assignment updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!bookingId) throw new Error("Missing booking");
      const res = await apiRequest("POST", `/api/xp/admin/bookings/${bookingId}/notes`, { body });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking", bookingId] });
      toast({ title: "Note added" });
    },
    onError: (err: any) => {
      toast({ title: "Note failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const paymentLinkMutation = useMutation({
    mutationFn: async () => {
      if (!bookingId) throw new Error("Missing booking");
      const res = await apiRequest("GET", `/api/xp/admin/bookings/${bookingId}/payment-link`);
      return res.json();
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async (input: { startAt: string; endAt: string }) => {
      if (!bookingId) throw new Error("Missing booking");
      const res = await apiRequest("PUT", `/api/xp/admin/bookings/${bookingId}/reschedule`, input);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking-events", bookingId] });
      toast({ title: "Rescheduled" });
    },
    onError: (err: any) => {
      toast({ title: "Reschedule failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (input: { channel: "email" | "sms"; to: string; subject?: string; body: string }) => {
      if (!bookingId) throw new Error("Missing booking");
      const res = await apiRequest("POST", `/api/xp/admin/bookings/${bookingId}/messages`, input);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking-messages", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking-events", bookingId] });
      toast({ title: "Message sent" });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!bookingId) throw new Error("Missing booking");
      const res = await apiRequest("POST", `/api/xp/admin/bookings/${bookingId}/refund`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking-refunds", bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["xp-admin-booking-events", bookingId] });
      toast({ title: "Refund created" });
    },
    onError: (err: any) => {
      toast({ title: "Refund failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const eventsQuery = useQuery<{ items: any[] }>({
    queryKey: ["xp-admin-booking-events", bookingId],
    enabled: open && !!bookingId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/xp/admin/bookings/${bookingId}/events`);
      return res.json();
    },
  });

  const messagesQuery = useQuery<{ items: any[] }>({
    queryKey: ["xp-admin-booking-messages", bookingId],
    enabled: open && !!bookingId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/xp/admin/bookings/${bookingId}/messages`);
      return res.json();
    },
  });

  const refundsQuery = useQuery<{ items: any[] }>({
    queryKey: ["xp-admin-booking-refunds", bookingId],
    enabled: open && !!bookingId && isAdmin,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/xp/admin/bookings/${bookingId}/refunds`);
      return res.json();
    },
  });

  const booking = detailQuery.data?.booking;
  const experience = detailQuery.data?.experience;

  const status = String(booking?.status || "").toLowerCase();
  const start = booking?.startAt ? new Date(booking.startAt) : null;
  const end = booking?.endAt ? new Date(booking.endAt) : null;
  const startOk = start && Number.isFinite(start.getTime());
  const endOk = end && Number.isFinite(end.getTime());

  const assignment = booking?.assignment || null;
  const locations = Array.isArray(locationsQuery.data?.items) ? locationsQuery.data?.items : [];
  const vehicles = Array.isArray(vehiclesQuery.data?.items) ? vehiclesQuery.data?.items : [];
  const concierges = Array.isArray(conciergesQuery.data?.items) ? conciergesQuery.data?.items : [];

  const [assignmentForm, setAssignmentForm] = useState<{ locationId: string; vehicleId: string; conciergeUserId: string }>({
    locationId: "none",
    vehicleId: "none",
    conciergeUserId: "none",
  });

  useEffect(() => {
    if (!open) return;
    if (!booking) return;
    setAssignmentForm({
      locationId: assignment?.locationId ? String(assignment.locationId) : "none",
      vehicleId: assignment?.vehicleId ? String(assignment.vehicleId) : "none",
      conciergeUserId: assignment?.conciergeUserId ? String(assignment.conciergeUserId) : "none",
    });
  }, [open, bookingId, booking, assignment?.locationId, assignment?.vehicleId, assignment?.conciergeUserId]);

  const notes = useMemo(() => (Array.isArray(booking?.notes) ? booking.notes : []), [booking?.notes]);
  const [noteBody, setNoteBody] = useState("");

  function toDtLocal(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const [rescheduleForm, setRescheduleForm] = useState<{ startAt: string; endAt: string }>({ startAt: "", endAt: "" });
  useEffect(() => {
    if (!open) return;
    if (!startOk || !endOk) return;
    setRescheduleForm({ startAt: toDtLocal(start!), endAt: toDtLocal(end!) });
  }, [open, bookingId, startOk, endOk]);

  const [messageChannel, setMessageChannel] = useState<"email" | "sms">("email");
  const [messageTo, setMessageTo] = useState("");
  const [messageSubject, setMessageSubject] = useState("Ocean Luxe XP booking");
  const [messageBody, setMessageBody] = useState("");

  useEffect(() => {
    if (!open) return;
    const to = messageChannel === "email" ? String(booking?.customerEmail || "") : String(booking?.customerPhone || "");
    if (to) setMessageTo(to);
  }, [open, bookingId, booking?.customerEmail, booking?.customerPhone, messageChannel]);

  const paymentLink = typeof (paymentLinkMutation.data as any)?.checkoutUrl === "string" ? ((paymentLinkMutation.data as any).checkoutUrl as string) : null;
  const events = Array.isArray(eventsQuery.data?.items) ? eventsQuery.data?.items : Array.isArray(detailQuery.data?.events) ? (detailQuery.data?.events as any[]) : [];
  const messages = Array.isArray(messagesQuery.data?.items) ? messagesQuery.data?.items : Array.isArray(detailQuery.data?.messages) ? (detailQuery.data?.messages as any[]) : [];
  const refunds = Array.isArray(refundsQuery.data?.items) ? refundsQuery.data?.items : Array.isArray(detailQuery.data?.refunds) ? (detailQuery.data?.refunds as any[]) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-muted-foreground" />
              Booking {bookingId ? `#${bookingId}` : ""}
            </div>
            <Badge variant={status === "confirmed" ? "default" : status === "cancelled" ? "secondary" : "outline"}>
              {status || "pending"}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {detailQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : detailQuery.error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {String((detailQuery.error as any)?.message || detailQuery.error)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-muted/10 p-4">
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Experience</div>
                  <div className="text-sm font-semibold">{experience?.title || `Experience #${booking?.experienceId || "—"}`}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Window</div>
                  <div className="text-sm">
                    {startOk ? format(start!, "EEE, MMM d, yyyy · h:mm a") : String(booking?.startAt || "—")}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {endOk ? format(end!, "EEE, MMM d, yyyy · h:mm a") : String(booking?.endAt || "—")}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Customer</div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{String(booking?.customerName || "—")}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{String(booking?.customerEmail || "—")}</span>
                    </div>
                    {booking?.customerEmail ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => copyText(String(booking.customerEmail)).then(() => toast({ title: "Copied email" })).catch(() => {})}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{String(booking?.customerPhone || "—")}</span>
                    </div>
                    {booking?.customerPhone ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => copyText(String(booking.customerPhone)).then(() => toast({ title: "Copied phone" })).catch(() => {})}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="text-sm font-semibold">Assignments</div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      Location
                    </Label>
                    <Select value={assignmentForm.locationId} onValueChange={(v) => setAssignmentForm((p) => ({ ...p, locationId: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isAdmin ? (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        Concierge
                      </Label>
                      <Select value={assignmentForm.conciergeUserId} onValueChange={(v) => setAssignmentForm((p) => ({ ...p, conciergeUserId: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {concierges.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        Concierge
                      </Label>
                      <Input value={String(assignment?.conciergeName || assignment?.conciergeEmail || "Assigned")} readOnly />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Car className="h-4 w-4 text-muted-foreground" />
                      Vehicle
                    </Label>
                    <Select value={assignmentForm.vehicleId} onValueChange={(v) => setAssignmentForm((p) => ({ ...p, vehicleId: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not attached</SelectItem>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      disabled={assignmentMutation.isPending || locationsQuery.isLoading || vehiclesQuery.isLoading || (isAdmin && conciergesQuery.isLoading)}
                      onClick={() => assignmentMutation.mutate(assignmentForm)}
                    >
                      Update assignment
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => detailQuery.refetch()} disabled={detailQuery.isFetching}>
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    Payment
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => paymentLinkMutation.mutate()} disabled={paymentLinkMutation.isPending}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Get link
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-muted-foreground">Status</div>
                    <div className="font-medium">{String(status || "pending")}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-muted-foreground">Due now</div>
                    <div className="font-medium">
                      {String(booking?.currency || "USD")} {String(booking?.depositAmount || "—")}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-muted-foreground">Checkout session</div>
                    <div className="flex items-center gap-2">
                      <div className="max-w-[220px] truncate text-xs">{String(booking?.stripeCheckoutSessionId || "—")}</div>
                      {booking?.stripeCheckoutSessionId ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => copyText(String(booking.stripeCheckoutSessionId)).then(() => toast({ title: "Copied session id" })).catch(() => {})}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-muted-foreground">Payment intent</div>
                    <div className="flex items-center gap-2">
                      <div className="max-w-[220px] truncate text-xs">{String(booking?.stripePaymentIntentId || "—")}</div>
                      {booking?.stripePaymentIntentId ? (
                        <Button type="button" variant="secondary" size="sm" onClick={() => copyText(String(booking.stripePaymentIntentId)).then(() => toast({ title: "Copied payment intent" })).catch(() => {})}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {paymentLink ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/10 p-3">
                      <div className="max-w-[300px] truncate text-xs">{paymentLink}</div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => copyText(paymentLink).then(() => toast({ title: "Copied link" })).catch(() => {})}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy link
                        </Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => typeof window !== "undefined" && window.open(paymentLink, "_blank")}>
                          Open
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  Reschedule
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input value={rescheduleForm.startAt} onChange={(e) => setRescheduleForm((p) => ({ ...p, startAt: e.target.value }))} type="datetime-local" />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input value={rescheduleForm.endAt} onChange={(e) => setRescheduleForm((p) => ({ ...p, endAt: e.target.value }))} type="datetime-local" />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={rescheduleMutation.isPending || !rescheduleForm.startAt || !rescheduleForm.endAt}
                  onClick={() => {
                    const startIso = new Date(rescheduleForm.startAt).toISOString();
                    const endIso = new Date(rescheduleForm.endAt).toISOString();
                    rescheduleMutation.mutate({ startAt: startIso, endAt: endIso });
                  }}
                >
                  Update window
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Messaging
                </div>
                <Tabs value={messageChannel} onValueChange={(v) => setMessageChannel(v === "sms" ? "sms" : "email")}>
                  <TabsList className="w-full">
                    <TabsTrigger value="email" className="flex-1">
                      Email
                    </TabsTrigger>
                    <TabsTrigger value="sms" className="flex-1">
                      SMS
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="email" className="space-y-3 pt-4">
                    <div className="space-y-2">
                      <Label>To</Label>
                      <Input value={messageTo} onChange={(e) => setMessageTo(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Body</Label>
                      <Textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Write your message…" />
                    </div>
                    <Button
                      type="button"
                      disabled={sendMessageMutation.isPending || !messageTo.trim() || !messageBody.trim()}
                      onClick={() => sendMessageMutation.mutate({ channel: "email", to: messageTo.trim(), subject: messageSubject.trim(), body: messageBody.trim() })}
                    >
                      Send email
                    </Button>
                  </TabsContent>
                  <TabsContent value="sms" className="space-y-3 pt-4">
                    <div className="space-y-2">
                      <Label>To</Label>
                      <Input value={messageTo} onChange={(e) => setMessageTo(e.target.value)} placeholder="+1…" />
                    </div>
                    <div className="space-y-2">
                      <Label>Body</Label>
                      <Textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Write your message…" />
                    </div>
                    <Button
                      type="button"
                      disabled={sendMessageMutation.isPending || !messageTo.trim() || !messageBody.trim()}
                      onClick={() => sendMessageMutation.mutate({ channel: "sms", to: messageTo.trim(), body: messageBody.trim() })}
                    >
                      Send SMS
                    </Button>
                  </TabsContent>
                </Tabs>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">History</div>
                  {messages.length ? (
                    <div className="space-y-2">
                      {messages.slice(0, 6).map((m: any) => {
                        const createdAt = m?.createdAt ? new Date(m.createdAt) : null;
                        const createdOk = createdAt && Number.isFinite(createdAt.getTime());
                        return (
                          <div key={m.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-medium">
                                {String(m.channel || "").toUpperCase()} → {String(m.toAddress || "")}
                              </div>
                              <div className="text-xs text-muted-foreground">{createdOk ? format(createdAt!, "MMM d · h:mm a") : ""}</div>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-sm">{String(m.body || "")}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No messages yet.</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="text-sm font-semibold">Timeline</div>
                {events.length ? (
                  <div className="space-y-2">
                    {events.slice(0, 10).map((e: any) => {
                      const createdAt = e?.createdAt ? new Date(e.createdAt) : null;
                      const createdOk = createdAt && Number.isFinite(createdAt.getTime());
                      return (
                        <div key={e.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-medium">{String(e.type || "").replace(/_/g, " ")}</div>
                            <div className="text-xs text-muted-foreground">{createdOk ? format(createdAt!, "MMM d · h:mm a") : ""}</div>
                          </div>
                          {e.payload ? <div className="mt-2 text-xs text-muted-foreground">{JSON.stringify(e.payload)}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No events yet.</div>
                )}
              </div>

              {isAdmin ? (
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Refunds</div>
                    <Button type="button" variant="destructive" disabled={refundMutation.isPending || status !== "confirmed"} onClick={() => refundMutation.mutate()}>
                      Refund
                    </Button>
                  </div>
                  {refunds.length ? (
                    <div className="space-y-2">
                      {refunds.slice(0, 6).map((r: any) => {
                        const createdAt = r?.createdAt ? new Date(r.createdAt) : null;
                        const createdOk = createdAt && Number.isFinite(createdAt.getTime());
                        return (
                          <div key={r.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-medium">{String(r.status || "created")}</div>
                              <div className="text-xs text-muted-foreground">{createdOk ? format(createdAt!, "MMM d · h:mm a") : ""}</div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {String(r.currency || "")} {String(r.amountCents || "")} · {String(r.stripeRefundId || "")}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No refunds yet.</div>
                  )}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="text-sm font-semibold">Internal notes</div>
                <div className="space-y-3">
                  {notes.length ? (
                    <div className="space-y-3">
                      {notes.map((n: any) => {
                        const createdAt = n?.createdAt ? new Date(n.createdAt) : null;
                        const createdOk = createdAt && Number.isFinite(createdAt.getTime());
                        const who = n?.author ? [n.author.firstName, n.author.lastName].filter(Boolean).join(" ") || n.author.email : "System";
                        return (
                          <div key={n.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-medium">{who}</div>
                              <div className="text-xs text-muted-foreground">{createdOk ? format(createdAt!, "MMM d · h:mm a") : ""}</div>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-sm">{String(n.body || "")}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No notes yet.</div>
                  )}

                  <div className="space-y-2">
                    <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add an internal note for ops + concierge…" />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        disabled={addNoteMutation.isPending || !noteBody.trim()}
                        onClick={() => {
                          const body = noteBody.trim();
                          if (!body) return;
                          addNoteMutation.mutate(body);
                          setNoteBody("");
                        }}
                      >
                        Add note
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setNoteBody("")} disabled={!noteBody}>
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/60 bg-background p-4">
                <div className="text-sm font-semibold">Actions</div>
                <div className="flex flex-wrap gap-2">
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={cancelMutation.isPending || status === "cancelled"}
                      onClick={() => cancelMutation.mutate()}
                    >
                      Cancel booking
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" onClick={() => detailQuery.refetch()} disabled={detailQuery.isFetching}>
                    Refresh
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
