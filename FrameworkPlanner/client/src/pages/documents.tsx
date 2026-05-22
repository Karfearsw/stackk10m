import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, apiUpload } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type VaultDocument = {
  id: number;
  teamId: number;
  title: string;
  kind: string | null;
  mimeType: string;
  sizeBytes: number | null;
  storageKey: string;
  sha256: string | null;
  tags: string[] | null;
  isPrivate: boolean | null;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type DocumentListResponse = { items: VaultDocument[]; total: number };

type DocumentDetailResponse = { document: VaultDocument; links: any[]; versions: any[] };

const entityTypeOptions = [
  { value: "", label: "None" },
  { value: "lead", label: "Lead" },
  { value: "opportunity", label: "Opportunity" },
  { value: "buyer", label: "Buyer" },
  { value: "company", label: "Company" },
  { value: "contact", label: "Contact" },
  { value: "contract", label: "Contract" },
];

function tagsToString(tags: string[] | null) {
  return (tags || []).join(", ");
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [uploadForm, setUploadForm] = useState({
    title: "",
    kind: "",
    tags: "",
    isPrivate: false,
    entityType: "",
    entityId: "",
    relation: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "200");
    if (q.trim()) p.set("q", q.trim());
    if (tag.trim()) p.set("tag", tag.trim());
    return p;
  }, [q, tag]);

  const listKey = useMemo(() => `/api/documents?${params.toString()}`, [params]);

  const { data, isLoading, isFetching, refetch } = useQuery<DocumentListResponse>({
    queryKey: [listKey],
    enabled: !!user,
  });

  const detailKey = useMemo(() => (selectedId ? `/api/documents/${selectedId}` : null), [selectedId]);
  const { data: detail } = useQuery<DocumentDetailResponse>({
    queryKey: detailKey ? [detailKey] : [""],
    enabled: !!user && !!detailKey,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a file");
      const fd = new FormData();
      fd.set("file", file);
      if (uploadForm.title.trim()) fd.set("title", uploadForm.title.trim());
      if (uploadForm.kind.trim()) fd.set("kind", uploadForm.kind.trim());
      if (uploadForm.tags.trim()) fd.set("tags", uploadForm.tags.trim());
      fd.set("isPrivate", uploadForm.isPrivate ? "true" : "false");
      if (uploadForm.entityType) fd.set("entityType", uploadForm.entityType);
      if (uploadForm.entityId.trim()) fd.set("entityId", uploadForm.entityId.trim());
      if (uploadForm.relation.trim()) fd.set("relation", uploadForm.relation.trim());
      const res = await apiUpload("POST", "/api/documents/upload", fd);
      return await res.json();
    },
    onSuccess: async () => {
      toast.success("Uploaded");
      setOpen(false);
      setFile(null);
      setUploadForm({ title: "", kind: "", tags: "", isPrivate: false, entityType: "", entityId: "", relation: "" });
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
            <FileText className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Documents</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Upload
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Upload document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>File</Label>
                    <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={uploadForm.title} onChange={(e) => setUploadForm((p) => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Kind</Label>
                      <Input value={uploadForm.kind} onChange={(e) => setUploadForm((p) => ({ ...p, kind: e.target.value }))} placeholder="contract, pof, id" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <Input value={uploadForm.tags} onChange={(e) => setUploadForm((p) => ({ ...p, tags: e.target.value }))} placeholder="closing, rehab, photos" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={uploadForm.isPrivate} onCheckedChange={(v) => setUploadForm((p) => ({ ...p, isPrivate: v === true }))} />
                    <div className="text-sm">Private</div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Link type</Label>
                      <Select value={uploadForm.entityType} onValueChange={(v) => setUploadForm((p) => ({ ...p, entityType: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {entityTypeOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Link id</Label>
                      <Input value={uploadForm.entityId} onChange={(e) => setUploadForm((p) => ({ ...p, entityId: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Relation</Label>
                    <Input value={uploadForm.relation} onChange={(e) => setUploadForm((p) => ({ ...p, relation: e.target.value }))} placeholder="inspection, pof, nda" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending}>
                    Upload
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title/kind…" className="sm:w-80" />
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag…" className="w-40" />
          </div>
          <div className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${items.length} / ${data?.total ?? 0}`}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Private</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell>{d.kind || "—"}</TableCell>
                <TableCell>{d.isPrivate ? "Yes" : "No"}</TableCell>
                <TableCell>{tagsToString(d.tags) || "—"}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button variant="outline" size="icon" onClick={() => window.open(`/api/documents/${d.id}/download`, "_blank")}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedId(d.id)}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && !isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No documents found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Dialog open={selectedId !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!detail ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Title</div>
                      <div className="text-sm">{detail.document.title}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Kind</div>
                      <div className="text-sm">{detail.document.kind || "—"}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Private</div>
                      <div className="text-sm">{detail.document.isPrivate ? "Yes" : "No"}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Tags</div>
                      <div className="text-sm">{tagsToString(detail.document.tags) || "—"}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Links</div>
                    <div className="text-sm text-muted-foreground">{detail.links.length ? "" : "No links"}</div>
                    {detail.links.map((l: any) => (
                      <div key={l.id} className="text-sm">
                        {String(l.entityType)} #{String(l.entityId)}{l.relation ? ` (${String(l.relation)})` : ""}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Versions</div>
                    <div className="text-sm text-muted-foreground">{detail.versions.length ? "" : "No versions"}</div>
                    {detail.versions.map((v: any) => (
                      <div key={v.id} className="text-sm">
                        v{String(v.version)} · {String(v.mimeType || v.mime_type || "")}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              {selectedId !== null && (
                <>
                  <Button variant="outline" onClick={() => window.open(`/api/documents/${selectedId}/download`, "_blank")}>
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!selectedId) return;
                      const res = await apiRequest("GET", `/api/documents/${selectedId}`);
                      await res.json();
                      await qc.invalidateQueries({ queryKey: [listKey] });
                    }}
                  >
                    Refresh
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

