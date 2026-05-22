import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Company = {
  id: number;
  teamId: number;
  name: string;
  companyType: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  tags: string[] | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type CompanyListResponse = { items: Company[]; total: number };

const typeOptions = [
  { value: "all", label: "All" },
  { value: "title_company", label: "Title Company" },
  { value: "brokerage", label: "Brokerage" },
  { value: "lender", label: "Lender" },
  { value: "builder", label: "Builder" },
  { value: "vendor", label: "Vendor" },
  { value: "llc", label: "LLC" },
  { value: "other", label: "Other" },
];

function tagsToString(tags: string[] | null) {
  return (tags || []).join(", ");
}

function stringToTags(raw: string) {
  const xs = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return xs.length ? xs : null;
}

export default function CompaniesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    companyType: "",
    website: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    tags: "",
  });

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "200");
    if (q.trim()) p.set("q", q.trim());
    if (type !== "all") p.set("type", type);
    return p;
  }, [q, type]);

  const listKey = useMemo(() => `/api/companies?${params.toString()}`, [params]);

  const { data, isLoading, isFetching, refetch } = useQuery<CompanyListResponse>({
    queryKey: [listKey],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name.trim(),
        companyType: form.companyType.trim() || null,
        website: form.website.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        tags: stringToTags(form.tags),
      };
      const res = await apiRequest("POST", "/api/companies", payload);
      return (await res.json()) as Company;
    },
    onSuccess: async () => {
      toast.success("Company created");
      setOpen(false);
      setForm({ name: "", companyType: "", website: "", phone: "", email: "", address: "", notes: "", tags: "" });
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/companies/${id}`);
      return await res.json();
    },
    onSuccess: async () => {
      toast.success("Company deleted");
      await qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(String(e?.message || e)),
  });

  const items = data?.items || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Companies</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add company</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.companyType || "other"} onValueChange={(v) => setForm((p) => ({ ...p, companyType: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {typeOptions
                          .filter((o) => o.value !== "all")
                          .map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Textarea value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="title, lender, vip" />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      if (!form.name.trim()) return toast.error("Name is required");
                      createMutation.mutate();
                    }}
                    disabled={createMutation.isPending}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name/email/phone…" className="sm:w-80" />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${items.length} / ${data?.total ?? 0}`}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.companyType || "—"}</TableCell>
                <TableCell>{c.email || "—"}</TableCell>
                <TableCell>{c.phone || "—"}</TableCell>
                <TableCell>{tagsToString(c.tags) || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (confirm("Delete this company?")) deleteMutation.mutate(c.id);
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && !isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No companies found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}

