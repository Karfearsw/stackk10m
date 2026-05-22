import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";

type AuditEvent = {
  id: number;
  teamId: number;
  actorUserId: number | null;
  entityType: string;
  entityId: number | null;
  action: string;
  beforeJsonParsed: any;
  afterJsonParsed: any;
  diffJsonParsed: any;
  createdAt: string;
  actor: any | null;
};

type AuditResponse = { items: AuditEvent[]; total: number };

const entityOptions = [
  { value: "all", label: "All" },
  { value: "company", label: "Company" },
  { value: "document", label: "Document" },
  { value: "automation", label: "Automation" },
  { value: "lead", label: "Lead" },
  { value: "opportunity", label: "Opportunity" },
];

export default function AuditPage() {
  const { user } = useAuth();

  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "200");
    if (entityType !== "all") p.set("entityType", entityType);
    if (action.trim()) p.set("action", action.trim());
    if (actorUserId.trim()) p.set("actorUserId", actorUserId.trim());
    return p;
  }, [action, actorUserId, entityType]);

  const key = useMemo(() => `/api/audit?${params.toString()}`, [params]);

  const { data, isLoading, isFetching, refetch } = useQuery<AuditResponse>({
    queryKey: [key],
    enabled: !!user,
  });

  const items = data?.items || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ScrollText className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Audit log</h1>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entityOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action…" className="sm:w-56" />
            <Input value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="Actor user id…" className="sm:w-44" />
          </div>
          <div className="text-sm text-muted-foreground">{isLoading ? "Loading…" : `${items.length} / ${data?.total ?? 0}`}</div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
                <TableCell>{e.actor?.email || (e.actorUserId ? `User ${e.actorUserId}` : "System")}</TableCell>
                <TableCell>
                  {e.entityType}
                  {e.entityId ? ` #${e.entityId}` : ""}
                </TableCell>
                <TableCell>{e.action}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" onClick={() => setSelected(e)}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && !isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No audit events
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Dialog open={selected !== null} onOpenChange={(v) => !v && setSelected(null)}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Audit event</DialogTitle>
            </DialogHeader>
            {selected ? (
              <div className="space-y-4">
                <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(selected.diffJsonParsed || null, null, 2)}</pre>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Before</div>
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(selected.beforeJsonParsed || null, null, 2)}</pre>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">After</div>
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(selected.afterJsonParsed || null, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

