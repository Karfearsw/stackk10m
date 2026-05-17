import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { XpItineraryEditor } from "@/components/xp/XpItineraryEditor";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import type { XpItinerary } from "@/lib/xp/itinerary";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

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
  active?: boolean | null;
  images?: string[] | null;
  itinerary?: any;
  location?: string | null;
  durationMinutes?: number | null;
  highlights?: string[] | null;
  inclusions?: string[] | null;
  cancellationPolicy?: string | null;
};

type XpTimeSlot = {
  id: number;
  experienceId: number;
  startAt: string;
  endAt: string;
  capacity: number;
  active: boolean;
};

type XpBlackout = {
  id: number;
  experienceId: number;
  startAt: string;
  endAt: string;
  reason?: string | null;
};

type XpBooking = {
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
};

function isAdmin(user: any): boolean {
  return Boolean(user?.isSuperAdmin) || String(user?.role || "").toLowerCase() === "admin";
}

function dtLocalToIso(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function linesToList(v: string): string[] | null {
  const items = String(v || "")
    .split(/\r?\n/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function listToLines(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v.map((x) => String(x || "").trim()).filter(Boolean).join("\n");
}

export default function XpAdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const admin = isAdmin(user);

  const experiencesQuery = useQuery<{ items: XpExperience[] }>({
    queryKey: ["/api/xp/admin/experiences"],
    enabled: admin,
    queryFn: async () => {
      const res = await fetch("/api/xp/admin/experiences", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const experiences = Array.isArray(experiencesQuery.data?.items) ? experiencesQuery.data?.items : [];
  const experiencesById = useMemo(() => new Map<number, XpExperience>(experiences.map((e) => [e.id, e])), [experiences]);

  const [selectedExperienceId, setSelectedExperienceId] = useState<string>("");
  const selectedId = parseInt(selectedExperienceId, 10);
  const selectedExperience = Number.isFinite(selectedId) ? experiencesById.get(selectedId) : null;
  const [editForm, setEditForm] = useState({
    slug: "",
    title: "",
    description: "",
    mode: "both",
    paymentMode: "deposit",
    depositAmount: "",
    priceTotal: "",
    capacity: "1",
    active: true,
    location: "",
    durationMinutes: "",
    images: "",
    highlights: "",
    inclusions: "",
    cancellationPolicy: "",
  });
  const [editItinerary, setEditItinerary] = useState<XpItinerary | null>(null);

  useEffect(() => {
    if (!selectedExperience) {
      setEditForm({
        slug: "",
        title: "",
        description: "",
        mode: "both",
        paymentMode: "deposit",
        depositAmount: "",
        priceTotal: "",
        capacity: "1",
        active: true,
        location: "",
        durationMinutes: "",
        images: "",
        highlights: "",
        inclusions: "",
        cancellationPolicy: "",
      });
      setEditItinerary(null);
      return;
    }
    setEditForm({
      slug: String(selectedExperience.slug || ""),
      title: String(selectedExperience.title || ""),
      description: String(selectedExperience.description || ""),
      mode: String(selectedExperience.mode || "both"),
      paymentMode: String(selectedExperience.paymentMode || "deposit"),
      depositAmount: selectedExperience.depositAmount != null ? String(selectedExperience.depositAmount) : "",
      priceTotal: selectedExperience.priceTotal != null ? String(selectedExperience.priceTotal) : "",
      capacity: selectedExperience.capacity != null ? String(selectedExperience.capacity) : "1",
      active: selectedExperience.active !== false,
      location: String(selectedExperience.location || ""),
      durationMinutes: selectedExperience.durationMinutes != null ? String(selectedExperience.durationMinutes) : "",
      images: listToLines(selectedExperience.images),
      highlights: listToLines(selectedExperience.highlights),
      inclusions: listToLines(selectedExperience.inclusions),
      cancellationPolicy: String(selectedExperience.cancellationPolicy || ""),
    });
    const raw = (selectedExperience as any).itinerary;
    if (raw && Array.isArray(raw.sections)) setEditItinerary(raw as any);
    else setEditItinerary(null);
  }, [selectedExperienceId]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    description: "",
    mode: "both",
    paymentMode: "deposit",
    depositAmount: "",
    priceTotal: "",
    capacity: "1",
    active: true,
    location: "",
    durationMinutes: "",
    images: "",
    highlights: "",
    inclusions: "",
    cancellationPolicy: "",
  });
  const [createItinerary, setCreateItinerary] = useState<XpItinerary | null>(null);

  const createExperience = useMutation({
    mutationFn: async () => {
      const payload: any = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        mode: form.mode,
        paymentMode: form.paymentMode,
        depositAmount: form.paymentMode === "full" ? undefined : form.depositAmount.trim() || undefined,
        priceTotal: form.priceTotal.trim() || undefined,
        capacity: parseInt(form.capacity, 10) || 1,
        active: !!form.active,
        location: form.location.trim() || undefined,
        durationMinutes: form.durationMinutes.trim() ? parseInt(form.durationMinutes, 10) : undefined,
        images: linesToList(form.images),
        highlights: linesToList(form.highlights),
        inclusions: linesToList(form.inclusions),
        cancellationPolicy: form.cancellationPolicy.trim() || undefined,
        itinerary: createItinerary && Array.isArray(createItinerary.sections) && createItinerary.sections.length ? createItinerary : null,
      };
      const res = await apiRequest("POST", "/api/xp/admin/experiences", payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences"] });
      setCreateOpen(false);
      setForm({
        slug: "",
        title: "",
        description: "",
        mode: "both",
        paymentMode: "deposit",
        depositAmount: "",
        priceTotal: "",
        capacity: "1",
        active: true,
        location: "",
        durationMinutes: "",
        images: "",
        highlights: "",
        inclusions: "",
        cancellationPolicy: "",
      });
      setCreateItinerary(null);
      toast({ title: "Experience created" });
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const updateExperience = useMutation({
    mutationFn: async (input: { id: number; payload: any }) => {
      const res = await apiRequest("PATCH", `/api/xp/admin/experiences/${input.id}`, input.payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences"] });
      if (Number.isFinite(selectedId)) {
        await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences", selectedId, "time-slots"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences", selectedId, "blackouts"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/bookings", String(selectedId)] });
      }
      toast({ title: "Experience updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const deleteExperience = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/xp/admin/experiences/${id}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences"] });
      toast({ title: "Experience deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const timeSlotsQuery = useQuery<{ items: XpTimeSlot[] }>({
    queryKey: ["/api/xp/admin/experiences", selectedId, "time-slots"],
    enabled: admin && Number.isFinite(selectedId),
    queryFn: async () => {
      const res = await fetch(`/api/xp/admin/experiences/${selectedId}/time-slots`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const blackoutsQuery = useQuery<{ items: XpBlackout[] }>({
    queryKey: ["/api/xp/admin/experiences", selectedId, "blackouts"],
    enabled: admin && Number.isFinite(selectedId),
    queryFn: async () => {
      const res = await fetch(`/api/xp/admin/experiences/${selectedId}/blackouts`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const bookingsQuery = useQuery<{ items: XpBooking[]; total: number }>({
    queryKey: ["/api/xp/admin/bookings", selectedId || ""],
    enabled: admin,
    queryFn: async () => {
      const qs = selectedId ? `?experienceId=${encodeURIComponent(String(selectedId))}` : "";
      const res = await fetch(`/api/xp/admin/bookings${qs}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [slotCapacity, setSlotCapacity] = useState("1");

  const createTimeSlot = useMutation({
    mutationFn: async () => {
      if (!Number.isFinite(selectedId)) throw new Error("Select experience");
      const startAt = dtLocalToIso(slotStart);
      const endAt = dtLocalToIso(slotEnd);
      if (!startAt || !endAt) throw new Error("Start/end required");
      const payload: any = { startAt, endAt, capacity: parseInt(slotCapacity, 10) || 1, active: true };
      const res = await apiRequest("POST", `/api/xp/admin/experiences/${selectedId}/time-slots`, payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences", selectedId, "time-slots"] });
      setSlotStart("");
      setSlotEnd("");
      setSlotCapacity("1");
      toast({ title: "Time slot created" });
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const deleteTimeSlot = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/xp/admin/time-slots/${id}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences", selectedId, "time-slots"] });
      toast({ title: "Time slot deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const [blackoutStart, setBlackoutStart] = useState("");
  const [blackoutEnd, setBlackoutEnd] = useState("");
  const [blackoutReason, setBlackoutReason] = useState("");

  const createBlackout = useMutation({
    mutationFn: async () => {
      if (!Number.isFinite(selectedId)) throw new Error("Select experience");
      const startAt = dtLocalToIso(blackoutStart);
      const endAt = dtLocalToIso(blackoutEnd);
      if (!startAt || !endAt) throw new Error("Start/end required");
      const payload: any = { startAt, endAt, reason: blackoutReason.trim() || undefined };
      const res = await apiRequest("POST", `/api/xp/admin/experiences/${selectedId}/blackouts`, payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences", selectedId, "blackouts"] });
      setBlackoutStart("");
      setBlackoutEnd("");
      setBlackoutReason("");
      toast({ title: "Blackout created" });
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const deleteBlackout = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/xp/admin/blackouts/${id}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences", selectedId, "blackouts"] });
      toast({ title: "Blackout deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const cancelBooking = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/xp/admin/bookings/${id}/cancel`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/bookings", selectedId || ""] });
      toast({ title: "Booking cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Cancel failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  if (!admin) {
    return (
      <Layout>
        <Card>
          <CardHeader>
            <CardTitle>XP Admin</CardTitle>
            <CardDescription>Admins only.</CardDescription>
          </CardHeader>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">XP Admin</h1>
          <p className="text-muted-foreground">Manage experiences, availability, and bookings.</p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>Create experience</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create experience</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} placeholder="ocean-luxe" />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ocean Luxe Experience" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mode</Label>
                  <Select value={form.mode} onValueChange={(v) => setForm((p) => ({ ...p, mode: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_slot">Time slot</SelectItem>
                      <SelectItem value="date_range">Date range</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capacity (date range)</Label>
                  <Input value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Payment mode</Label>
                  <Select value={form.paymentMode} onValueChange={(v) => setForm((p) => ({ ...p, paymentMode: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">Deposit</SelectItem>
                      <SelectItem value="full">Full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{form.paymentMode === "full" ? "Total price (USD)" : "Deposit amount (USD)"}</Label>
                  <Input value={form.paymentMode === "full" ? form.priceTotal : form.depositAmount} onChange={(e) => setForm((p) => ({ ...p, [form.paymentMode === "full" ? "priceTotal" : "depositAmount"]: e.target.value }))} placeholder={form.paymentMode === "full" ? "500.00" : "100.00"} />
                </div>
                <div className="space-y-2">
                  <Label>{form.paymentMode === "full" ? "Deposit (auto)" : "Price total (optional)"}</Label>
                  <Input value={form.paymentMode === "full" ? "" : form.priceTotal} onChange={(e) => setForm((p) => ({ ...p, priceTotal: e.target.value }))} placeholder={form.paymentMode === "full" ? "—" : "500.00"} disabled={form.paymentMode === "full"} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Nassau, Bahamas" />
                </div>
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input value={form.durationMinutes} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value }))} placeholder="180" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Image URLs (one per line)</Label>
                <Textarea value={form.images} onChange={(e) => setForm((p) => ({ ...p, images: e.target.value }))} placeholder={"https://...\nhttps://..."} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Highlights (one per line)</Label>
                  <Textarea value={form.highlights} onChange={(e) => setForm((p) => ({ ...p, highlights: e.target.value }))} placeholder={"Private crew\nChampagne service"} />
                </div>
                <div className="space-y-2">
                  <Label>Inclusions (one per line)</Label>
                  <Textarea value={form.inclusions} onChange={(e) => setForm((p) => ({ ...p, inclusions: e.target.value }))} placeholder={"Transfers\nWelcome drink"} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cancellation policy</Label>
                <Textarea value={form.cancellationPolicy} onChange={(e) => setForm((p) => ({ ...p, cancellationPolicy: e.target.value }))} />
              </div>
              <XpItineraryEditor value={createItinerary} onChange={setCreateItinerary} />
              <Button disabled={createExperience.isPending} onClick={() => createExperience.mutate()}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Experience selection</CardTitle>
          <CardDescription>Select an experience to manage availability and view bookings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedExperienceId} onValueChange={setSelectedExperienceId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select experience" />
            </SelectTrigger>
            <SelectContent>
              {experiences.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.title} ({e.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedExperience ? (
            <div className="text-sm text-muted-foreground">
              Deposit: {selectedExperience.depositAmount ?? "—"} {String(selectedExperience.currency || "USD").toUpperCase()}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedExperience ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit experience</CardTitle>
            <CardDescription>Update public-facing details and checkout settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Editing: <span className="font-medium text-foreground">{selectedExperience.title}</span>
              </div>
              <Button
                disabled={updateExperience.isPending}
                onClick={() =>
                  updateExperience.mutate({
                    id: selectedId,
                    payload: {
                      slug: editForm.slug.trim(),
                      title: editForm.title.trim(),
                      description: editForm.description.trim() || null,
                      mode: editForm.mode,
                      paymentMode: editForm.paymentMode,
                      priceTotal: editForm.priceTotal.trim() || null,
                      depositAmount: editForm.paymentMode === "full" ? undefined : editForm.depositAmount.trim() || null,
                      capacity: editForm.capacity.trim() ? parseInt(editForm.capacity, 10) : 1,
                      active: !!editForm.active,
                      location: editForm.location.trim() || null,
                      durationMinutes: editForm.durationMinutes.trim() ? parseInt(editForm.durationMinutes, 10) : null,
                      images: linesToList(editForm.images),
                      highlights: linesToList(editForm.highlights),
                      inclusions: linesToList(editForm.inclusions),
                      cancellationPolicy: editForm.cancellationPolicy.trim() || null,
                      itinerary: editItinerary && editItinerary.sections.length ? editItinerary : null,
                    },
                  })
                }
              >
                Save changes
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={editForm.slug} onChange={(e) => setEditForm((p) => ({ ...p, slug: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={editForm.mode} onValueChange={(v) => setEditForm((p) => ({ ...p, mode: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time_slot">Time slot</SelectItem>
                    <SelectItem value="date_range">Date range</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Payment mode</Label>
                <Select value={editForm.paymentMode} onValueChange={(v) => setEditForm((p) => ({ ...p, paymentMode: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">Deposit</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price total</Label>
                <Input value={editForm.priceTotal} onChange={(e) => setEditForm((p) => ({ ...p, priceTotal: e.target.value }))} placeholder="500.00" />
              </div>
              <div className="space-y-2">
                <Label>Deposit amount</Label>
                <Input
                  value={editForm.depositAmount}
                  onChange={(e) => setEditForm((p) => ({ ...p, depositAmount: e.target.value }))}
                  placeholder="100.00"
                  disabled={editForm.paymentMode === "full"}
                />
              </div>
              <div className="space-y-2">
                <Label>Capacity (date range)</Label>
                <Input value={editForm.capacity} onChange={(e) => setEditForm((p) => ({ ...p, capacity: e.target.value }))} placeholder="1" />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={editForm.location} onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input value={editForm.durationMinutes} onChange={(e) => setEditForm((p) => ({ ...p, durationMinutes: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Highlights (one per line)</Label>
                <Textarea value={editForm.highlights} onChange={(e) => setEditForm((p) => ({ ...p, highlights: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Inclusions (one per line)</Label>
                <Textarea value={editForm.inclusions} onChange={(e) => setEditForm((p) => ({ ...p, inclusions: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cancellation policy</Label>
              <Textarea value={editForm.cancellationPolicy} onChange={(e) => setEditForm((p) => ({ ...p, cancellationPolicy: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Image URLs (one per line)</Label>
              <Textarea value={editForm.images} onChange={(e) => setEditForm((p) => ({ ...p, images: e.target.value }))} />
            </div>

            <XpItineraryEditor value={editItinerary} onChange={setEditItinerary} />
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="experiences">
        <TabsList>
          <TabsTrigger value="experiences">Experiences</TabsTrigger>
          <TabsTrigger value="availability" disabled={!selectedExperience}>Availability</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
        </TabsList>

        <TabsContent value="experiences">
          <Card>
            <CardHeader>
              <CardTitle>Catalog</CardTitle>
              <CardDescription>Deactivate experiences to remove them from public listing.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiences.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.title}</TableCell>
                      <TableCell>{e.slug}</TableCell>
                      <TableCell>{e.mode}</TableCell>
                      <TableCell>{e.active ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="destructive" size="sm" disabled={deleteExperience.isPending} onClick={() => deleteExperience.mutate(e.id)}>
                          Deactivate
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Time slots</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input type="datetime-local" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input type="datetime-local" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Capacity</Label>
                    <Input value={slotCapacity} onChange={(e) => setSlotCapacity(e.target.value)} />
                  </div>
                </div>
                <Button disabled={createTimeSlot.isPending || !selectedExperience} onClick={() => createTimeSlot.mutate()}>
                  Add time slot
                </Button>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Cap</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(timeSlotsQuery.data?.items) ? timeSlotsQuery.data?.items : []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{new Date(s.startAt).toLocaleString()}</TableCell>
                        <TableCell>{new Date(s.endAt).toLocaleString()}</TableCell>
                        <TableCell>{s.capacity}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="destructive" size="sm" disabled={deleteTimeSlot.isPending} onClick={() => deleteTimeSlot.mutate(s.id)}>
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Blackouts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input type="datetime-local" value={blackoutStart} onChange={(e) => setBlackoutStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input type="datetime-local" value={blackoutEnd} onChange={(e) => setBlackoutEnd(e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Reason</Label>
                    <Input value={blackoutReason} onChange={(e) => setBlackoutReason(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
                <Button disabled={createBlackout.isPending || !selectedExperience} onClick={() => createBlackout.mutate()}>
                  Add blackout
                </Button>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(blackoutsQuery.data?.items) ? blackoutsQuery.data?.items : []).map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>{new Date(b.startAt).toLocaleString()}</TableCell>
                        <TableCell>{new Date(b.endAt).toLocaleString()}</TableCell>
                        <TableCell>{b.reason || ""}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="destructive" size="sm" disabled={deleteBlackout.isPending} onClick={() => deleteBlackout.mutate(b.id)}>
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bookings">
          <Card>
            <CardHeader>
              <CardTitle>Bookings</CardTitle>
              <CardDescription>Total: {Number(bookingsQuery.data?.total || 0)}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Experience</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Array.isArray(bookingsQuery.data?.items) ? bookingsQuery.data?.items : []).map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.id}</TableCell>
                      <TableCell>{experiencesById.get(b.experienceId)?.title || b.experienceId}</TableCell>
                      <TableCell>{b.kind}</TableCell>
                      <TableCell>{b.status}</TableCell>
                      <TableCell>
                        <div className="text-sm">{b.customerName}</div>
                        <div className="text-xs text-muted-foreground">{b.customerEmail}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{new Date(b.startAt).toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">{new Date(b.endAt).toLocaleString()}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="destructive" size="sm" disabled={cancelBooking.isPending || b.status === "cancelled"} onClick={() => cancelBooking.mutate(b.id)}>
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
