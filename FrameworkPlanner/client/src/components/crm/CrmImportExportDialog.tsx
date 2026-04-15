import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type EntityType = "lead" | "opportunity" | "contact" | "buyer";

type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  type: "string" | "int" | "decimal" | "email" | "bool" | "date" | "string_array";
};

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function CrmImportExportDialog({
  entityType,
  triggerVariant = "outline",
}: {
  entityType: EntityType;
  triggerVariant?: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link";
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: fieldsResp } = useQuery({
    queryKey: ["/api/crm/fields", entityType],
    queryFn: async () => {
      const res = await fetch(`/api/crm/fields?entityType=${encodeURIComponent(entityType)}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).message || "Failed to load fields");
      }
      return res.json();
    },
    enabled: !!user,
  });

  const fields = (fieldsResp?.fields || []) as FieldDef[];

  const requiredFields = useMemo(() => fields.filter((f) => f.required), [fields]);
  const optionalFields = useMemo(() => fields.filter((f) => !f.required), [fields]);

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"import" | "export">("import");

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultLeadSource, setDefaultLeadSource] = useState<string>("");
  const [onDuplicate, setOnDuplicate] = useState<"merge" | "overwrite" | "skip">("merge");
  const [dryRun, setDryRun] = useState(false);
  const [importJobId, setImportJobId] = useState<number | null>(null);
  const [importJob, setImportJob] = useState<any>(null);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [importPolling, setImportPolling] = useState(false);

  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("csv");
  const [exportFilters, setExportFilters] = useState({ createdFrom: "", createdTo: "", status: "", assignedTo: "" });
  const exportColumnsDefault = useMemo(() => {
    const base = ["id", "createdAt", "updatedAt"];
    const fromDefs = fields.map((f) => f.key);
    return Array.from(new Set([...base, ...fromDefs]));
  }, [fields]);
  const [exportColumns, setExportColumns] = useState<Record<string, boolean>>({});
  const [exportJobId, setExportJobId] = useState<number | null>(null);
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string>("");
  const [exportJob, setExportJob] = useState<any>(null);
  const [exportPolling, setExportPolling] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setPreviewError("");
    setFile(null);
    setMapping({});
    setDefaultLeadSource("");
    setOnDuplicate("merge");
    setDryRun(false);
    setImportJobId(null);
    setImportJob(null);
    setImportErrors([]);
    setImportPolling(false);
    setExportFormat("csv");
    setExportFilters({ createdFrom: "", createdTo: "", status: "", assignedTo: "" });
    const initCols: Record<string, boolean> = {};
    for (const c of exportColumnsDefault) initCols[c] = true;
    setExportColumns(initCols);
    setExportJobId(null);
    setExportDownloadUrl("");
    setExportJob(null);
    setExportPolling(false);
  }, [open, exportColumnsDefault]);

  useEffect(() => {
    if (!importJobId || !importPolling) return;
    const t = window.setInterval(async () => {
      const res = await fetch(`/api/crm/import/jobs/${importJobId}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setImportJob(data.job);
      setImportErrors(data.errors || []);
      const status = String(data.job?.status || "");
      if (status === "completed" || status === "failed") setImportPolling(false);
    }, 1000);
    return () => window.clearInterval(t);
  }, [importJobId, importPolling]);

  useEffect(() => {
    if (!exportJobId || !exportPolling) return;
    const t = window.setInterval(async () => {
      const res = await fetch(`/api/crm/export/jobs/${exportJobId}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setExportJob(data.job);
      const status = String(data.job?.status || "");
      if (status === "completed" || status === "failed") setExportPolling(false);
    }, 1000);
    return () => window.clearInterval(t);
  }, [exportJobId, exportPolling]);

  const handlePreview = async (f: File) => {
    setPreview(null);
    setPreviewError("");
    setMapping({});
    try {
      const fd = new FormData();
      fd.append("entityType", entityType);
      fd.append("file", f);
      const res = await fetch("/api/crm/import/preview", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Preview failed");
      setPreview(data);
      setMapping(data.suggestedMapping || {});
    } catch (e: any) {
      setPreviewError(e.message || "Preview failed");
    }
  };

  const { data: leadSourceOptions = [] } = useQuery<any[]>({
    queryKey: ["/api/lead-source-options"],
    queryFn: async () => {
      const res = await fetch("/api/lead-source-options", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user && entityType === "lead",
  });

  useEffect(() => {
    if (entityType !== "lead") return;
    if (defaultLeadSource) return;
    if (!Array.isArray(leadSourceOptions) || !leadSourceOptions.length) return;
    const v = String(leadSourceOptions[0]?.value || "").trim();
    if (v) setDefaultLeadSource(v);
  }, [defaultLeadSource, entityType, leadSourceOptions]);

  const startImport = async () => {
    if (!file) return;
    try {
      const effectiveMapping: Record<string, string> = { ...(mapping || {}) };
      if (entityType === "lead" && !effectiveMapping.source && defaultLeadSource) {
        effectiveMapping.source = `static:${defaultLeadSource}`;
      }

      const fd = new FormData();
      fd.append("entityType", entityType);
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(effectiveMapping));
      fd.append("options", JSON.stringify({ onDuplicate, dryRun }));
      const res = await fetch("/api/crm/import/jobs", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).message || "Import failed");
      setImportJobId((data as any).jobId);
      setImportPolling(true);
      toast({ title: "Import started", description: `Job #${(data as any).jobId}` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message || "Import failed", variant: "destructive" });
    }
  };

  const startExport = async () => {
    try {
      const cols = Object.entries(exportColumns)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const filters: any = {};
      if (exportFilters.createdFrom) filters.createdFrom = exportFilters.createdFrom;
      if (exportFilters.createdTo) filters.createdTo = exportFilters.createdTo;
      if (exportFilters.status && entityType !== "contact") filters.status = exportFilters.status;
      if ((entityType === "lead" || entityType === "opportunity") && exportFilters.assignedTo)
        filters.assignedTo = parseInt(exportFilters.assignedTo, 10);

      const res = await fetch("/api/crm/export/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          format: exportFormat,
          filters,
          columns: cols,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).message || "Export failed");
      setExportJobId((data as any).jobId);
      setExportDownloadUrl((data as any).downloadUrl || "");
      setExportPolling(true);
      toast({ title: "Export started", description: `Job #${(data as any).jobId}` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message || "Export failed", variant: "destructive" });
    }
  };

  if (!user) return null;

  const title =
    entityType === "lead"
      ? "Leads"
      : entityType === "opportunity"
        ? "Opportunities"
        : entityType === "contact"
          ? "Contacts"
          : "Buyers";

  const supportsStatusFilter = entityType !== "contact";
  const supportsAssignedToFilter = entityType === "lead" || entityType === "opportunity";
  const missingRequired = requiredFields.some((f) => {
    if (entityType === "lead" && f.key === "source") return !mapping.source && !defaultLeadSource;
    return !mapping[f.key];
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm">
          Import/Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title} Import/Export</DialogTitle>
          <DialogDescription>CSV and Excel supported. Import validates, detects duplicates, and reports row-level errors.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-4">
            <div className="space-y-2">
              <Label>Upload CSV/XLSX</Label>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f) handlePreview(f);
                }}
              />
              {previewError ? <div className="text-sm text-destructive">{previewError}</div> : null}
              {preview ? (
                <div className="text-sm text-muted-foreground">
                  Detected {preview.format?.toUpperCase()} with {preview.headers?.length || 0} columns and {preview.totalRows || 0} rows.
                </div>
              ) : null}
            </div>

            {preview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>On Duplicate</Label>
                    <Select value={onDuplicate} onValueChange={(v) => setOnDuplicate(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merge">Merge</SelectItem>
                        <SelectItem value="overwrite">Overwrite</SelectItem>
                        <SelectItem value="skip">Skip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox checked={dryRun} onCheckedChange={(v) => setDryRun(!!v)} />
                    <Label>Dry run (no writes)</Label>
                  </div>

                  {entityType === "lead" ? (
                    <div className="space-y-2">
                      <Label>Default Lead Source</Label>
                      <Select value={defaultLeadSource} onValueChange={setDefaultLeadSource}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(leadSourceOptions) ? leadSourceOptions : []).map((o: any) => (
                            <SelectItem key={String(o.value || "")} value={String(o.value || "")}>
                              {String(o.label || o.value || "")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <Label>Field Mapping (Required)</Label>
                    {requiredFields.map((f) => (
                      <div key={f.key} className="grid grid-cols-2 gap-2 items-center min-w-0">
                        <div className="text-sm min-w-0 truncate">{f.label}</div>
                        <Select
                          value={mapping[f.key] || ""}
                          onValueChange={(v) => setMapping((prev) => ({ ...prev, [f.key]: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            {preview.headers.map((h: string) => (
                              <SelectItem key={h} value={h}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <Label>Field Mapping (Optional)</Label>
                    <ScrollArea className="h-[min(14rem,40dvh)] border rounded-md p-2">
                      <div className="space-y-3">
                        {optionalFields.map((f) => (
                          <div key={f.key} className="grid grid-cols-2 gap-2 items-center min-w-0">
                            <div className="text-sm min-w-0 truncate">{f.label}</div>
                            <Select
                              value={mapping[f.key] || ""}
                              onValueChange={(v) => setMapping((prev) => ({ ...prev, [f.key]: v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="(not mapped)" />
                              </SelectTrigger>
                              <SelectContent>
                                {preview.headers.map((h: string) => (
                                  <SelectItem key={h} value={h}>
                                    {h}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Preview Rows</Label>
                  <ScrollArea className="h-[min(14rem,40dvh)] border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {(preview.headers || []).slice(0, 4).map((h: string) => (
                            <TableHead key={h}>
                              <div className="max-w-[240px] truncate">{h}</div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(preview.sampleRows || []).map((r: any, idx: number) => (
                          <TableRow key={idx}>
                            {(preview.headers || []).slice(0, 4).map((h: string) => (
                              <TableCell key={h}>
                                <div className="max-w-[240px] truncate">{String(r?.[h] ?? "")}</div>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>

                  {importJobId ? (
                    <div className="space-y-2">
                      <div className="text-sm">
                        Job #{importJobId} {importJob?.status ? `(${importJob.status})` : ""}
                      </div>
                      {importJob ? (
                        <div className="text-xs text-muted-foreground">
                          Processed {importJob.processedRows || 0}/{importJob.totalRows || preview.totalRows || 0} • Created{" "}
                          {importJob.createdCount || 0} • Updated {importJob.updatedCount || 0} • Skipped {importJob.skippedCount || 0} • Errors{" "}
                          {importJob.errorCount || 0}
                        </div>
                      ) : null}

                      {importErrors.length ? (
                        <ScrollArea className="h-[min(10rem,30dvh)] border rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Row</TableHead>
                                <TableHead>Error</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {importErrors.map((e: any) => {
                                const parsed = safeJsonParse<any[]>(String(e.errors || "[]"), []);
                                const msg = parsed.map((x) => `${x.field ? `${x.field}: ` : ""}${x.message}`).join(" | ");
                                return (
                                  <TableRow key={e.id}>
                                    <TableCell>{e.rowNumber}</TableCell>
                                    <TableCell>{msg}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!importJobId) return;
                            window.open(`/api/crm/import/jobs/${importJobId}/errors.csv`, "_blank");
                          }}
                          disabled={!importJobId}
                        >
                          Download Error CSV
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                onClick={() => startImport()}
                disabled={!preview || !file || missingRequired || importPolling}
              >
                Start Import
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="export" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Created From</Label>
                    <Input
                      type="date"
                      value={exportFilters.createdFrom}
                      onChange={(e) => setExportFilters((p) => ({ ...p, createdFrom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Created To</Label>
                    <Input
                      type="date"
                      value={exportFilters.createdTo}
                      onChange={(e) => setExportFilters((p) => ({ ...p, createdTo: e.target.value }))}
                    />
                  </div>
                </div>

                {supportsStatusFilter ? (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Input
                      placeholder="e.g. new / active"
                      value={exportFilters.status}
                      onChange={(e) => setExportFilters((p) => ({ ...p, status: e.target.value }))}
                    />
                  </div>
                ) : null}

                {supportsAssignedToFilter ? (
                  <div className="space-y-2">
                    <Label>Assigned User ID</Label>
                    <Input
                      placeholder="e.g. 12"
                      value={exportFilters.assignedTo}
                      onChange={(e) => setExportFilters((p) => ({ ...p, assignedTo: e.target.value }))}
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <Label>Columns</Label>
                <ScrollArea className="h-[min(16rem,45dvh)] border rounded-md p-2">
                  <div className="space-y-2">
                    {exportColumnsDefault.map((c) => (
                      <div key={c} className="flex items-center gap-2">
                        <Checkbox
                          checked={!!exportColumns[c]}
                          onCheckedChange={(v) => setExportColumns((p) => ({ ...p, [c]: !!v }))}
                        />
                        <div className="text-sm">{c}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {exportJobId ? (
              <div className="space-y-2">
                <div className="text-sm">
                  Job #{exportJobId} {exportJob?.status ? `(${exportJob.status})` : ""}
                </div>
                {exportDownloadUrl ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => window.open(exportDownloadUrl, "_blank")}
                      disabled={String(exportJob?.status || "") !== "completed"}
                    >
                      Download
                    </Button>
                    <div className="text-xs text-muted-foreground">Secure link expires automatically.</div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button onClick={() => startExport()} disabled={exportPolling}>
                Generate Export
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
