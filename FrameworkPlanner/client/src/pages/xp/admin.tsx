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
import { XpAdminHeader } from "@/components/xp-admin/XpAdminHeader";
import { XpBookingsSavedViews, type XpBookingFilters, type XpSavedViewId } from "@/components/xp-admin/XpBookingsSavedViews";
import { XpBookingsFilters } from "@/components/xp-admin/XpBookingsFilters";
import { XpBookingsTable } from "@/components/xp-admin/XpBookingsTable";
import { XpBookingDrawer } from "@/components/xp-admin/XpBookingDrawer";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";

type XpExperience = {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  mode?: string | null;
  currency?: string | null;
  priceTotal?: string | number | null;
  depositAmount?: string | number | null;
  capacity?: number | null;
  active?: boolean | null;
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
  startAt: string | Date;
  endAt: string | Date;
  stripeCheckoutSessionId?: string | null;
  createdAt?: string | Date | null;
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

type XpLocation = {
  id: number;
  name: string;
  type?: string | null;
  active?: boolean | null;
};

type XpVehicle = {
  id: number;
  name: string;
  type?: string | null;
  licensePlate?: string | null;
  locationId?: number | null;
  active?: boolean | null;
};

type ConciergeUser = {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  isActive?: boolean | null;
};

function isAdmin(user: any): boolean {
  return Boolean(user?.isSuperAdmin) || String(user?.role || "").toLowerCase() === "admin";
}

function isXpOps(user: any): boolean {
  const r = String(user?.role || "").toLowerCase();
  return Boolean(user?.isSuperAdmin) || r === "admin" || r === "concierge";
}

function dtLocalToIso(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export default function XpAdminPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const ops = isXpOps(user);

  const experiencesQuery = useQuery<{ items: XpExperience[] }>({
    queryKey: [admin ? "/api/xp/admin/experiences" : "/api/xp/experiences"],
    enabled: ops,
    queryFn: async () => {
      const url = admin ? "/api/xp/admin/experiences" : "/api/xp/experiences";
      const res = await fetch(url, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const experiences = Array.isArray(experiencesQuery.data?.items) ? experiencesQuery.data?.items : [];
  const experiencesById = useMemo(() => new Map<number, XpExperience>(experiences.map((e) => [e.id, e])), [experiences]);
  const experienceTitleById = useMemo(() => new Map<number, string>(experiences.map((e) => [e.id, e.title])), [experiences]);

  const [selectedExperienceId, setSelectedExperienceId] = useState<string>("");
  const selectedId = parseInt(selectedExperienceId, 10);
  const selectedExperience = Number.isFinite(selectedId) ? experiencesById.get(selectedId) : null;

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    title: "",
    description: "",
    mode: "both",
    depositAmount: "",
    priceTotal: "",
    capacity: "1",
    active: true,
  });

  const createExperience = useMutation({
    mutationFn: async () => {
      const payload: any = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        mode: form.mode,
        depositAmount: form.depositAmount.trim(),
        priceTotal: form.priceTotal.trim() || undefined,
        capacity: parseInt(form.capacity, 10) || 1,
        active: !!form.active,
      };
      const res = await apiRequest("POST", "/api/xp/admin/experiences", payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/experiences"] });
      setCreateOpen(false);
      setForm({ slug: "", title: "", description: "", mode: "both", depositAmount: "", priceTotal: "", capacity: "1", active: true });
      toast({ title: "Experience created" });
    },
    onError: (err: any) => {
      toast({ title: "Create failed", description: String(err?.message || err), variant: "destructive" as any });
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

  const [savedView, setSavedView] = useState<XpSavedViewId>("all");
  const [filters, setFilters] = useState<XpBookingFilters>({
    experienceId: "all",
    status: "all",
    kind: "all",
    locationId: "all",
    vehicleId: "all",
    conciergeUserId: "all",
    from: "",
    to: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    const id = setTimeout(() => setAppliedFilters(filters), 250);
    return () => clearTimeout(id);
  }, [filters]);

  useEffect(() => {
    setPageIndex(0);
  }, [appliedFilters]);

  useEffect(() => {
    if (savedView === "all") return;
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");
    const next7 = format(addDays(today, 7), "yyyy-MM-dd");

    if (savedView === "today") {
      setFilters((p) => ({ ...p, status: "all", from: todayStr, to: todayStr }));
      return;
    }
    if (savedView === "upcoming_7") {
      setFilters((p) => ({ ...p, status: "all", from: todayStr, to: next7 }));
      return;
    }
    if (savedView === "pending_payment") {
      setFilters((p) => ({ ...p, status: "pending_payment" }));
      return;
    }
    if (savedView === "confirmed") {
      setFilters((p) => ({ ...p, status: "confirmed" }));
      return;
    }
    if (savedView === "cancelled") {
      setFilters((p) => ({ ...p, status: "cancelled" }));
      return;
    }
  }, [savedView]);

  const locationsQuery = useQuery<{ items: XpLocation[] }>({
    queryKey: ["/api/xp/admin/locations", "active"],
    enabled: ops,
    queryFn: async () => {
      const res = await fetch("/api/xp/admin/locations?activeOnly=true", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const vehiclesQuery = useQuery<{ items: XpVehicle[] }>({
    queryKey: ["/api/xp/admin/vehicles", "active"],
    enabled: ops,
    queryFn: async () => {
      const res = await fetch("/api/xp/admin/vehicles?activeOnly=true", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const conciergesQuery = useQuery<{ items: ConciergeUser[] }>({
    queryKey: ["/api/xp/admin/concierges"],
    enabled: admin,
    queryFn: async () => {
      const res = await fetch("/api/xp/admin/concierges", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const locations = Array.isArray(locationsQuery.data?.items) ? locationsQuery.data!.items : [];
  const vehicles = Array.isArray(vehiclesQuery.data?.items) ? vehiclesQuery.data!.items : [];
  const concierges = Array.isArray(conciergesQuery.data?.items) ? conciergesQuery.data!.items : [];

  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [locationForm, setLocationForm] = useState<{ name: string; type: string }>({ name: "", type: "resort" });

  const upsertLocation = useMutation({
    mutationFn: async () => {
      const name = locationForm.name.trim();
      if (!name) throw new Error("Name required");
      if (editingLocationId) {
        const res = await apiRequest("PATCH", `/api/xp/admin/locations/${editingLocationId}`, { name, type: locationForm.type });
        return res.json();
      }
      const res = await apiRequest("POST", "/api/xp/admin/locations", { name, type: locationForm.type });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/locations"] });
      setLocationDialogOpen(false);
      setEditingLocationId(null);
      setLocationForm({ name: "", type: "resort" });
      toast({ title: "Location saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const deactivateLocation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/xp/admin/locations/${id}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/locations"] });
      toast({ title: "Location deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Deactivate failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);
  const [vehicleForm, setVehicleForm] = useState<{ name: string; type: string; licensePlate: string; locationId: string }>({
    name: "",
    type: "tesla",
    licensePlate: "",
    locationId: "none",
  });

  const upsertVehicle = useMutation({
    mutationFn: async () => {
      const name = vehicleForm.name.trim();
      if (!name) throw new Error("Name required");
      const payload: any = {
        name,
        type: vehicleForm.type,
        licensePlate: vehicleForm.licensePlate.trim() || null,
        locationId: vehicleForm.locationId === "none" ? null : parseInt(vehicleForm.locationId, 10),
      };
      if (editingVehicleId) {
        const res = await apiRequest("PATCH", `/api/xp/admin/vehicles/${editingVehicleId}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/xp/admin/vehicles", payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/vehicles"] });
      setVehicleDialogOpen(false);
      setEditingVehicleId(null);
      setVehicleForm({ name: "", type: "tesla", licensePlate: "", locationId: "none" });
      toast({ title: "Vehicle saved" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const deactivateVehicle = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/xp/admin/vehicles/${id}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/xp/admin/vehicles"] });
      toast({ title: "Vehicle deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Deactivate failed", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const bookingsQuery = useQuery<{ items: XpBooking[]; total: number }>({
    queryKey: ["xp-admin-bookings", appliedFilters, pageIndex, pageSize],
    enabled: ops,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (appliedFilters.experienceId !== "all") qs.set("experienceId", appliedFilters.experienceId);
      if (appliedFilters.status !== "all") qs.set("status", appliedFilters.status);
      if (appliedFilters.kind !== "all") qs.set("kind", appliedFilters.kind);
      if (appliedFilters.locationId !== "all") qs.set("locationId", appliedFilters.locationId);
      if (appliedFilters.vehicleId !== "all") qs.set("vehicleId", appliedFilters.vehicleId);
      if (admin && appliedFilters.conciergeUserId !== "all") qs.set("conciergeUserId", appliedFilters.conciergeUserId);
      if (appliedFilters.from) qs.set("from", new Date(`${appliedFilters.from}T00:00:00`).toISOString());
      if (appliedFilters.to) qs.set("to", new Date(`${appliedFilters.to}T23:59:59`).toISOString());
      qs.set("limit", String(pageSize));
      qs.set("offset", String(pageIndex * pageSize));
      const res = await fetch(`/api/xp/admin/bookings?${qs.toString()}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).message || "Failed to load");
      return json;
    },
  });

  const bookings = Array.isArray(bookingsQuery.data?.items) ? bookingsQuery.data.items : [];
  const bookingsTotal = Number(bookingsQuery.data?.total || 0);
  const bookingsPages = Math.max(1, Math.ceil(bookingsTotal / pageSize));
  const canPrev = pageIndex > 0;
  const canNext = pageIndex + 1 < bookingsPages;

  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  if (!ops) {
    return (
      <Layout>
        <Card>
          <CardHeader>
            <CardTitle>XP Booking</CardTitle>
            <CardDescription>Ops access required.</CardDescription>
          </CardHeader>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <XpAdminHeader
        title="XP Booking"
        subtitle="High-volume booking operations. Built to scale like PNRs."
        right={admin ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Create experience</Button>
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
                    <Label>Deposit amount (USD)</Label>
                    <Input value={form.depositAmount} onChange={(e) => setForm((p) => ({ ...p, depositAmount: e.target.value }))} placeholder="100.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Price total (optional)</Label>
                    <Input value={form.priceTotal} onChange={(e) => setForm((p) => ({ ...p, priceTotal: e.target.value }))} placeholder="500.00" />
                  </div>
                </div>
                <Button disabled={createExperience.isPending} onClick={() => createExperience.mutate()}>
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
        className="mb-6"
      />

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          {admin ? <TabsTrigger value="experiences">Experiences</TabsTrigger> : null}
          {admin ? <TabsTrigger value="availability">Availability</TabsTrigger> : null}
          {admin ? <TabsTrigger value="concierge">Concierge ops</TabsTrigger> : null}
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
          <div className="mb-6 max-w-lg space-y-2">
            <Label>Experience</Label>
            <Select value={selectedExperienceId} onValueChange={setSelectedExperienceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an experience" />
              </SelectTrigger>
              <SelectContent>
                {experiences.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

        <TabsContent value="concierge">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Locations</CardTitle>
                  <CardDescription>Resorts, pickup points, and service areas.</CardDescription>
                </div>
                <Dialog
                  open={locationDialogOpen}
                  onOpenChange={(v) => {
                    setLocationDialogOpen(v);
                    if (!v) {
                      setEditingLocationId(null);
                      setLocationForm({ name: "", type: "resort" });
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingLocationId(null);
                        setLocationForm({ name: "", type: "resort" });
                      }}
                    >
                      Add location
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingLocationId ? "Edit location" : "Add location"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={locationForm.name} onChange={(e) => setLocationForm((p) => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={locationForm.type} onValueChange={(v) => setLocationForm((p) => ({ ...p, type: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="resort">Resort</SelectItem>
                            <SelectItem value="pickup">Pickup</SelectItem>
                            <SelectItem value="service_area">Service area</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button disabled={upsertLocation.isPending} onClick={() => upsertLocation.mutate()}>
                        Save
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.name}</TableCell>
                        <TableCell>{l.type || "resort"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingLocationId(l.id);
                                setLocationForm({ name: l.name, type: String(l.type || "resort") });
                                setLocationDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deactivateLocation.isPending}
                              onClick={() => deactivateLocation.mutate(l.id)}
                            >
                              Deactivate
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {locations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                          No locations yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Vehicles</CardTitle>
                  <CardDescription>Fleet for meet-and-greet and transport workflows.</CardDescription>
                </div>
                <Dialog
                  open={vehicleDialogOpen}
                  onOpenChange={(v) => {
                    setVehicleDialogOpen(v);
                    if (!v) {
                      setEditingVehicleId(null);
                      setVehicleForm({ name: "", type: "tesla", licensePlate: "", locationId: "none" });
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingVehicleId(null);
                        setVehicleForm({ name: "", type: "tesla", licensePlate: "", locationId: "none" });
                      }}
                    >
                      Add vehicle
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingVehicleId ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={vehicleForm.name} onChange={(e) => setVehicleForm((p) => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={vehicleForm.type} onValueChange={(v) => setVehicleForm((p) => ({ ...p, type: v }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tesla">Tesla</SelectItem>
                              <SelectItem value="driver">Driver</SelectItem>
                              <SelectItem value="sprinter">Sprinter</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>License plate</Label>
                          <Input value={vehicleForm.licensePlate} onChange={(e) => setVehicleForm((p) => ({ ...p, licensePlate: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Select value={vehicleForm.locationId} onValueChange={(v) => setVehicleForm((p) => ({ ...p, locationId: v }))}>
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
                      <Button disabled={upsertVehicle.isPending} onClick={() => upsertVehicle.mutate()}>
                        Save
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>{v.name}</TableCell>
                        <TableCell>{v.type || "tesla"}</TableCell>
                        <TableCell>{v.locationId ? locations.find((l) => l.id === v.locationId)?.name || `#${v.locationId}` : ""}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingVehicleId(v.id);
                                setVehicleForm({
                                  name: v.name,
                                  type: String(v.type || "tesla"),
                                  licensePlate: String(v.licensePlate || ""),
                                  locationId: v.locationId ? String(v.locationId) : "none",
                                });
                                setVehicleDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deactivateVehicle.isPending}
                              onClick={() => deactivateVehicle.mutate(v.id)}
                            >
                              Deactivate
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {vehicles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No vehicles yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bookings">
          <div className="mt-6 space-y-4">
            <XpBookingsSavedViews value={savedView} onChange={setSavedView} />
            <XpBookingsFilters
              experiences={experiences.map((e) => ({ id: e.id, title: e.title }))}
              locations={locations.map((l) => ({ id: l.id, name: l.name }))}
              vehicles={vehicles.map((v) => ({ id: v.id, name: v.name }))}
              concierges={concierges.map((c) => ({ id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName }))}
              showConcierge={admin}
              filters={filters}
              onChange={setFilters}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">Total: {bookingsTotal}</div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={!canPrev} onClick={() => setPageIndex((p) => Math.max(0, p - 1))}>
                  Prev
                </Button>
                <div className="text-xs text-muted-foreground">
                  Page {pageIndex + 1} / {bookingsPages}
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={!canNext} onClick={() => setPageIndex((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
            <XpBookingsTable
              rows={bookings as any}
              experienceTitleById={experienceTitleById}
              onOpen={(id) => {
                setSelectedBookingId(id);
                setDrawerOpen(true);
              }}
            />
            <XpBookingDrawer open={drawerOpen} onOpenChange={setDrawerOpen} bookingId={selectedBookingId} isAdmin={admin} />
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
