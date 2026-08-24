import { useState, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Plus, Search, Play, BarChart3, Upload, Clock, Hash, Star, FileText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { ScriptEditorDialog } from "@/components/scripts/ScriptEditorDialog";
import { ScriptPracticeDialog } from "@/components/scripts/ScriptPracticeDialog";

const CATEGORY_LABELS: Record<string, string> = {
  general: "General", intro: "Intro / Cold Call", followup: "Follow-up",
  closing: "Closing / Offer", objection: "Objection Handling",
  disposition: "Post-Call Notes", custom: "Custom",
};

type SI = { id: number; name: string; content: string; description?: string;
  category?: string; tags?: string[]; isDefault?: boolean; isArchived?: boolean;
  useCount?: number; avgPracticeSeconds?: number; totalPracticeCount?: number;
  lastPracticedAt?: string; createdAt?: string; };

export default function Scripts() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editScript, setEditScript] = useState<SI | null>(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [pracScript, setPracScript] = useState<SI | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/scripts", catFilter, search],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (catFilter) p.set("category", catFilter);
      if (search) p.set("search", search);
      const r = await apiRequest("GET", "/api/scripts?" + p.toString());
      return r.json();
    },
  });

  const scripts: SI[] = Array.isArray(data?.items) ? data.items : [];
  const categories: string[] = Array.isArray(data?.categories) ? data.categories : [];

  const fmtDur = (s: number) => { if (!s) return "0:00"; const m = Math.floor(s/60); return m + ":" + String(s%60).padStart(2,"0"); };

  const handleImport = async () => {
    try {
      const p = JSON.parse(importText);
      const arr = Array.isArray(p) ? p : [p];
      const r = await apiRequest("POST", "/api/scripts/import", { scripts: arr });
      const res = await r.json();
      toast.success("Imported " + res.created + " scripts");
      setImportText(""); setImportOpen(false); refetch();
    } catch { toast.error("Invalid JSON"); }
  };

  return (
    <Layout>
      <div className="space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-7 w-7 text-primary" /> Script Library
            </h1>
            <div className="text-sm text-muted-foreground">Create, organize, and practice your calling scripts</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(!importOpen)} className="flex-1 sm:flex-none">
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
            <Button onClick={() => { setEditScript(null); setEditorOpen(true); }} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4 mr-2" /> New Script
            </Button>
          </div>
        </div>

        {importOpen && (
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">Import Scripts</CardTitle>
            <CardDescription>Paste JSON array of &#123;name, content, category&#125; objects</CardDescription></CardHeader>
            <CardContent>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
                className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder='[{"name":"My Script","content":"Hello...","category":"intro"}]' />
              <div className="flex gap-2 mt-2">
                <Button onClick={handleImport} disabled={!importText.trim()}>Import</Button>
                <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
              </div>
            </CardContent></Card>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input placeholder="Search scripts..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <Button variant={catFilter === "" ? "default" : "outline"} size="sm" onClick={() => setCatFilter("")}>All</Button>
            {categories.map((cat) => (
              <Button key={cat} variant={catFilter === cat ? "default" : "outline"} size="sm"
                onClick={() => setCatFilter(cat)} className="whitespace-nowrap">
                {CATEGORY_LABELS[cat] || cat}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading scripts...</div>
        ) : scripts.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <div className="text-lg font-medium">No scripts yet</div>
            <div className="text-sm text-muted-foreground mb-4">Create your first script or import from a file</div>
            <Button onClick={() => { setEditScript(null); setEditorOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Create Script</Button>
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {scripts.map((s) => (
              <Card key={s.id} className="min-w-0 flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{s.name}</CardTitle>
                      {s.description && <CardDescription className="truncate mt-0.5">{s.description}</CardDescription>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.isDefault && <Star className="h-4 w-4 text-yellow-500" />}
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">{CATEGORY_LABELS[s.category || "general"]}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-2">
                  <div className="text-sm text-muted-foreground line-clamp-3 min-h-[3rem]">{s.content || "No content"}</div>
                  {s.tags && s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">{s.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-1">
                    <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> Used {s.useCount || 0}x</span>
                    {s.totalPracticeCount ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {s.totalPracticeCount} practices</span> : null}
                    {s.avgPracticeSeconds ? <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Avg {fmtDur(s.avgPracticeSeconds)}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" variant="default" onClick={() => { setPracScript(s); setPracticeOpen(true); }}>
                      <Play className="h-3 w-3 mr-1" /> Practice</Button>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(s.content || ""); toast.success("Copied!"); }}>Copy</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditScript(s); setEditorOpen(true); }}>Edit</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <ScriptEditorDialog open={editorOpen} onOpenChange={setEditorOpen} script={editScript} onSaved={() => refetch()} onDeleted={() => refetch()} />
      {pracScript && <ScriptPracticeDialog open={practiceOpen} onOpenChange={setPracticeOpen} script={pracScript} onPracticeLogged={() => refetch()} />}
    </Layout>
  );
}