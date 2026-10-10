/**
 * Ticket 18 — Storage settings UI.
 *
 * - Shows the active storage backend (S3-compatible object storage or local dev fallback)
 * - Bucket/region/endpoint configuration (values only — secrets stay in env vars)
 * - Storage inventory with migration status
 * - "Migrate now" with dry-run preview first
 * - Storage usage stats
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  HardDrive, Cloud, ShieldCheck, AlertTriangle, RefreshCw,
  FileCheck, Database, Lock, Play, Eye,
} from "lucide-react";

interface InventoryResponse {
  success: boolean;
  backend: string;
  bucket: string;
  region: string;
  endpoint: string | null;
  devBucketConfigured: boolean;
  usage: {
    backend: string;
    bucket: string;
    totalFiles: number;
    totalBytes: number;
    immutableFiles: number;
    byEntity: Array<{ entityType: string; files: number; bytes: number }>;
  };
  pendingMigration: number;
  recentFiles: Array<{
    id: number;
    originalName: string;
    storageKey: string;
    bucket: string;
    sizeBytes: number;
    mimeType: string;
    entityType: string;
    isImmutable: boolean;
    createdAt: string;
  }>;
}

interface MigrateResponse {
  success: boolean;
  dryRun: boolean;
  scanned: number;
  candidates: number;
  uploaded: number;
  verified: number;
  failed: Array<{ source: string; error: string }>;
  skipped: number;
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function StorageSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dryRunResult, setDryRunResult] = useState<MigrateResponse | null>(null);
  const [liveResult, setLiveResult] = useState<MigrateResponse | null>(null);

  const { data, isLoading, refetch } = useQuery<InventoryResponse>({
    queryKey: ["/api/storage/inventory"],
    queryFn: async () => {
      const res = await fetch("/api/storage/inventory", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load storage inventory");
      return res.json();
    },
  });

  const migrateMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await fetch("/api/storage/migrate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Migration request failed");
      }
      return (await res.json()) as MigrateResponse;
    },
    onSuccess: (result, dryRun) => {
      if (dryRun) {
        setDryRunResult(result);
        toast({ title: "Dry run complete", description: `${result.candidates} file(s) would be migrated.` });
      } else {
        setLiveResult(result);
        setDryRunResult(null);
        queryClient.invalidateQueries({ queryKey: ["/api/storage/inventory"] });
        toast({
          title: "Migration complete",
          description: `${result.verified} verified, ${result.failed.length} failed.`,
          variant: result.failed.length ? "destructive" : "default",
        });
      }
    },
    onError: (e: any) => {
      toast({ title: "Migration failed", description: e?.message || "Unknown error", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin mb-3" />
          Loading storage inventory…
        </CardContent>
      </Card>
    );
  }

  const inv = data;
  const isS3 = inv?.backend === "s3";

  return (
    <div className="space-y-6">
      {/* Backend status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isS3 ? <Cloud className="h-5 w-5" /> : <HardDrive className="h-5 w-5" />}
            Storage Backend
          </CardTitle>
          <CardDescription>
            Private-by-default durable object storage. Downloads use expiring signed URLs — never public.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={isS3 ? "default" : "secondary"} className="text-sm px-3 py-1">
              {isS3 ? "S3-compatible object storage" : "Local filesystem (dev only)"}
            </Badge>
            {!isS3 && (
              <Alert className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Not production-safe</AlertTitle>
                <AlertDescription>
                  Local storage vanishes on deploy (Vercel is ephemeral). Set{" "}
                  <code className="font-mono text-xs">STORAGE_BUCKET</code> (+ region/credentials) to
                  enable durable object storage.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Bucket</p>
              <p className="font-mono font-medium truncate">{inv?.bucket || "—"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Region</p>
              <p className="font-mono font-medium">{inv?.region || "—"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Endpoint</p>
              <p className="font-mono font-medium truncate" title={inv?.endpoint || ""}>
                {inv?.endpoint ? new URL(inv.endpoint).hostname : "AWS default"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Dev bucket</p>
              <p className="font-medium">{inv?.devBucketConfigured ? "Configured (separate)" : "Falls back to main"}</p>
            </div>
          </div>

          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Configuration via environment variables</AlertTitle>
            <AlertDescription className="font-mono text-xs space-y-1">
              <p>STORAGE_PROVIDER=s3 · STORAGE_BUCKET=&lt;prod&gt; · STORAGE_BUCKET_DEV=&lt;dev&gt;</p>
              <p>STORAGE_REGION · STORAGE_ENDPOINT · STORAGE_ACCESS_KEY_ID · STORAGE_SECRET_ACCESS_KEY</p>
              <p className="font-sans">Secrets are never stored in the database or shown here.</p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Usage stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Files stored</p>
              <p className="text-2xl font-bold">{inv?.usage.totalFiles ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Total size</p>
              <p className="text-2xl font-bold">{formatBytes(inv?.usage.totalBytes ?? 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Immutable (legal)
              </p>
              <p className="text-2xl font-bold">{inv?.usage.immutableFiles ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Pending migration</p>
              <p className="text-2xl font-bold">{inv?.pendingMigration ?? 0}</p>
            </div>
          </div>

          {(inv?.usage.byEntity?.length ?? 0) > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity type</TableHead>
                  <TableHead className="text-right">Files</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inv!.usage.byEntity.map((r) => (
                  <TableRow key={r.entityType}>
                    <TableCell className="capitalize">{r.entityType.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right">{r.files}</TableCell>
                    <TableCell className="text-right">{formatBytes(r.bytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Migration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" /> Migrate to Object Storage
          </CardTitle>
          <CardDescription>
            Move local files and database blobs into durable object storage with SHA-256
            checksum verification. Sources are never deleted — cleanup is a separate,
            explicit step after you verify.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => migrateMutation.mutate(true)}
              disabled={migrateMutation.isPending}
            >
              <Eye className="h-4 w-4 mr-2" />
              {migrateMutation.isPending ? "Scanning…" : "Dry-run preview"}
            </Button>
            <Button
              onClick={() => migrateMutation.mutate(false)}
              disabled={migrateMutation.isPending || !dryRunResult}
              title={!dryRunResult ? "Run a dry-run preview first" : "Migrate for real"}
            >
              <Play className="h-4 w-4 mr-2" />
              {migrateMutation.isPending ? "Migrating…" : "Migrate now"}
            </Button>
            <Button variant="ghost" onClick={() => { setDryRunResult(null); setLiveResult(null); refetch(); }}>
              Refresh
            </Button>
          </div>

          {!dryRunResult && (
            <p className="text-xs text-muted-foreground">
              Run a dry-run preview first — the live migration button stays disabled until a
              preview completes.
            </p>
          )}

          {dryRunResult && (
            <Alert>
              <FileCheck className="h-4 w-4" />
              <AlertTitle>Dry-run preview (no files moved)</AlertTitle>
              <AlertDescription>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-sm">
                  <div>Scanned: <strong>{dryRunResult.scanned}</strong></div>
                  <div>Would migrate: <strong>{dryRunResult.candidates}</strong></div>
                  <div>Already stored: <strong>{dryRunResult.skipped}</strong></div>
                  <div>Failed: <strong>{dryRunResult.failed.length}</strong></div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {liveResult && (
            <Alert variant={liveResult.failed.length ? "destructive" : "default"}>
              <FileCheck className="h-4 w-4" />
              <AlertTitle>Migration result</AlertTitle>
              <AlertDescription>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-sm">
                  <div>Uploaded: <strong>{liveResult.uploaded}</strong></div>
                  <div>Verified: <strong>{liveResult.verified}</strong></div>
                  <div>Skipped: <strong>{liveResult.skipped}</strong></div>
                  <div>Failed: <strong>{liveResult.failed.length}</strong></div>
                </div>
                {liveResult.failed.length > 0 && (
                  <ul className="mt-2 text-xs space-y-1 max-h-32 overflow-y-auto">
                    {liveResult.failed.map((f, i) => (
                      <li key={i} className="font-mono">{f.source}: {f.error}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          {(inv?.recentFiles?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Recent files in durable storage</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv!.recentFiles.slice(0, 10).map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium truncate max-w-[200px]" title={f.originalName}>
                        {f.originalName}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{f.entityType}</TableCell>
                      <TableCell className="text-right text-xs">{formatBytes(f.sizeBytes)}</TableCell>
                      <TableCell>
                        {f.isImmutable && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Lock className="h-3 w-3 mr-1" /> Immutable
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retention policy doc */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Retention &amp; Backup Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Signed legal docs (immutable):</strong> retained indefinitely,
            write-once. Ordinary roles get read-only access via expiring signed URLs. Deletion requires
            super-admin + a documented legal hold release.</p>
          <p><strong className="text-foreground">Call recordings:</strong> retained 13 months (statute-of-limitations
            window + margin), then auto-flagged for review before purge.</p>
          <p><strong className="text-foreground">General uploads:</strong> retained while linked to an active record;
            orphaned files flagged after 90 days.</p>
          <p><strong className="text-foreground">Backups:</strong> enable bucket versioning + cross-region replication
            on the object store; Postgres remains the metadata source of truth and is backed up on its own schedule.
            Verify restores quarterly.</p>
          <p><strong className="text-foreground">Dev/prod separation:</strong> dev writes go to{" "}
            <code className="font-mono text-xs">STORAGE_BUCKET_DEV</code>; prod to{" "}
            <code className="font-mono text-xs">STORAGE_BUCKET</code>. Credentials are per-environment.</p>
        </CardContent>
      </Card>
    </div>
  );
}
