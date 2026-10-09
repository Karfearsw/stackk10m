import { useState, useMemo, useEffect, useRef } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Play,
  Plus,
  Search,
  Star,
  Clock,
  CheckCircle,
  ChevronLeft,
  Pencil,
  Timer,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Script = {
  id: number;
  name: string;
  content: string;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  isDefault?: boolean | null;
  isArchived?: boolean | null;
  useCount?: number | null;
  totalPracticeCount?: number | null;
  avgPracticeSeconds?: number | null;
  lastPracticedAt?: string | null;
};

type PracticeSession = {
  id: number;
  script_id: number;
  script_name?: string;
  duration_seconds: number;
  notes?: string | null;
  created_at: string;
};

function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now() - elapsed * 1000;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => { if (!active) setElapsed(0); }, [active]);
  return elapsed;
}

// ── Script Library (left panel / step 1) ────────────────────────────────────

function ScriptLibrary({
  scripts,
  categories,
  selectedId,
  onSelect,
  onCreate,
  onEdit,
  onSetDefault,
  search,
  setSearch,
  category,
  setCategory,
  isLoading,
}: {
  scripts: Script[];
  categories: string[];
  selectedId: number | null;
  onSelect: (s: Script) => void;
  onCreate: () => void;
  onEdit: (s: Script) => void;
  onSetDefault: (s: Script) => void;
  search: string;
  setSearch: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <BookOpen className="h-4 w-4" aria-hidden /> Scripts
        </h2>
        <Button size="sm" onClick={onCreate} data-testid="playground-new-script">
          <Plus className="h-4 w-4 mr-1" aria-hidden /> New
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          placeholder="Search scripts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
          aria-label="Search scripts"
        />
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={category === "" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setCategory("")}
          >
            All
          </Badge>
          {categories.map((c) => (
            <Badge
              key={c}
              variant={category === c ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setCategory(c)}
            >
              {c}
            </Badge>
          ))}
        </div>
      )}
      <ScrollArea className="flex-1 min-h-[200px] pr-1">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading scripts…</p>
        ) : scripts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" aria-hidden />
            <p className="text-sm font-medium">No scripts yet</p>
            <p className="text-xs mt-1">Create your first sales script to start practicing</p>
          </div>
        ) : (
          <div className="space-y-2">
            {scripts.map((s) => (
              <Card
                key={s.id}
                className={cn(
                  "cursor-pointer transition-colors hover:border-primary/50",
                  selectedId === s.id && "border-primary bg-primary/5"
                )}
                onClick={() => onSelect(s)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {s.isDefault && (
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" aria-label="Default script" />
                        )}
                      </div>
                      {s.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{s.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                        {s.category && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.category}</Badge>}
                        {(s.totalPracticeCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" aria-hidden />
                            {s.totalPracticeCount}× · avg {formatDuration(s.avgPracticeSeconds)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(s)} aria-label={`Edit ${s.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!s.isDefault && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSetDefault(s)} aria-label={`Set ${s.name} as default`}>
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ── Practice Session (center panel / step 2) ────────────────────────────────

function PracticePanel({
  script,
  onEndPractice,
}: {
  script: Script | null;
  onEndPractice: (durationSeconds: number, notes: string) => void;
}) {
  const [practicing, setPracticing] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const elapsed = useElapsed(practicing);

  if (!script) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center py-12 text-muted-foreground">
        <Play className="h-12 w-12 mb-3 opacity-30" aria-hidden />
        <p className="font-medium">Select a script to practice</p>
        <p className="text-sm mt-1 max-w-xs">Pick a script from the library, read through it out loud, then log your session.</p>
      </div>
    );
  }

  const sections = script.content.split(/\n\s*\n/).filter((s) => s.trim());

  const handleEnd = () => {
    if (practicing && !confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    onEndPractice(elapsed, notes);
    setPracticing(false);
    setNotes("");
    setConfirmEnd(false);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate flex items-center gap-2">
            {script.name}
            {script.isDefault && <Badge variant="secondary" className="text-[10px]">Default for dialer</Badge>}
          </h2>
          {script.description && <p className="text-xs text-muted-foreground truncate">{script.description}</p>}
        </div>
        {practicing && (
          <Badge variant="default" className="text-sm px-3 py-1 tabular-nums" aria-live="polite">
            <Clock className="h-3.5 w-3.5 mr-1.5" aria-hidden />
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-[200px] rounded-lg border bg-card p-4">
        <div className="space-y-4">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">This script has no content yet. Edit it to add sections.</p>
          ) : (
            sections.map((section, i) => (
              <div key={i}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{section.trim()}</p>
                {i < sections.length - 1 && <hr className="my-4 border-border/60" />}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {practicing && (
        <div className="space-y-2">
          <label htmlFor="practice-notes" className="text-xs font-medium text-muted-foreground">
            Session notes — what went well, what to improve
          </label>
          <Textarea
            id="practice-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Nailed the opening, stumbled on the price objection…"
            rows={2}
          />
        </div>
      )}

      <div className="flex gap-2">
        {!practicing ? (
          <Button className="flex-1" size="lg" onClick={() => setPracticing(true)} data-testid="playground-start-practice">
            <Play className="h-4 w-4 mr-2" aria-hidden /> Start Practice
          </Button>
        ) : (
          <>
            <Button variant="outline" className="flex-1" size="lg" onClick={() => { setPracticing(false); setConfirmEnd(false); }}>
              Pause
            </Button>
            <Button
              variant={confirmEnd ? "destructive" : "default"}
              className="flex-1"
              size="lg"
              onClick={handleEnd}
              data-testid="playground-end-practice"
            >
              {confirmEnd ? (
                <>End & log {formatDuration(elapsed)}?</>
              ) : (
                <><Square className="h-4 w-4 mr-2" aria-hidden /> End & Log Session</>
              )}
            </Button>
          </>
        )}
      </div>
      {confirmEnd && (
        <p className="text-xs text-muted-foreground text-center">Tap again to confirm — your {formatDuration(elapsed)} session will be logged.</p>
      )}
    </div>
  );
}

// ── Details / History (right panel / step 3) ────────────────────────────────

function DetailsPanel({ script }: { script: Script | null }) {
  const { data: sessions = [], isLoading } = useQuery<PracticeSession[]>({
    queryKey: ["/api/scripts", script?.id, "practice"],
    queryFn: async () => {
      const res = await fetch(`/api/scripts/${script!.id}/practice`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.items || data || [];
    },
    enabled: Boolean(script?.id),
  });

  if (!script) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Practice history will appear here.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <h2 className="text-sm font-semibold">Session details</h2>
      <Card>
        <CardContent className="p-3 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Practice sessions</span><span className="font-medium">{script.totalPracticeCount ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Avg duration</span><span className="font-medium">{formatDuration(script.avgPracticeSeconds)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Last practiced</span><span className="font-medium">{script.lastPracticedAt ? new Date(script.lastPracticedAt).toLocaleDateString() : "Never"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Dialer uses</span><span className="font-medium">{script.useCount ?? 0}×</span></div>
        </CardContent>
      </Card>

      <h2 className="text-sm font-semibold mt-1">Recent practice</h2>
      <ScrollArea className="flex-1 min-h-[150px]">
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No practice sessions logged yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 10).map((s) => (
              <Card key={s.id} className="p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden />
                    {formatDuration(s.duration_seconds)}
                  </span>
                  <span className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
                {s.notes && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{s.notes}</p>}
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

function PlaygroundInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Script | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Script | null>(null);
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  // Mobile step flow: 0 = library, 1 = practice, 2 = review
  const [mobileStep, setMobileStep] = useState(0);

  const { data, isLoading } = useQuery<{ items: Script[]; categories: string[] }>({
    queryKey: ["/api/scripts", search, category],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (category) qs.set("category", category);
      const res = await fetch(`/api/scripts?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const scripts = useMemo(() => data?.items || [], [data]);
  const categories = useMemo(() => data?.categories || [], [data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
    if (selected) queryClient.invalidateQueries({ queryKey: ["/api/scripts", selected.id, "practice"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: formName.trim(),
        content: formContent,
        description: formDescription.trim() || undefined,
        category: formCategory.trim() || undefined,
      };
      if (editing) {
        return apiRequest("PATCH", `/api/scripts/${editing.id}`, body);
      }
      return apiRequest("POST", "/api/scripts", body);
    },
    onSuccess: async (res: any) => {
      if (res.status >= 400) {
        const d = await res.json().catch(() => null);
        toast({ title: "Could not save script", description: d?.message || "Request failed", variant: "destructive" });
        return;
      }
      toast({ title: editing ? "Script updated" : "Script created" });
      setEditorOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Could not save script", description: e?.message, variant: "destructive" }),
  });

  const defaultMutation = useMutation({
    mutationFn: async (s: Script) => apiRequest("PATCH", `/api/scripts/${s.id}`, { isDefault: true }),
    onSuccess: () => {
      toast({ title: "Default script set", description: "The dialer will use this script." });
      invalidate();
    },
  });

  const practiceMutation = useMutation({
    mutationFn: async ({ durationSeconds, notes }: { durationSeconds: number; notes: string }) => {
      if (!selected) throw new Error("No script selected");
      return apiRequest("POST", `/api/scripts/${selected.id}/practice`, { durationSeconds, notes });
    },
    onSuccess: () => {
      toast({ title: "Practice logged", description: "Nice work — session saved." });
      invalidate();
      setMobileStep(2);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormContent("");
    setFormDescription("");
    setFormCategory("");
    setEditorOpen(true);
  };

  const openEdit = (s: Script) => {
    setEditing(s);
    setFormName(s.name);
    setFormContent(s.content);
    setFormDescription(s.description || "");
    setFormCategory(s.category || "");
    setEditorOpen(true);
  };

  const handleSelect = (s: Script) => {
    setSelected(s);
    setMobileStep(1);
  };

  const library = (
    <ScriptLibrary
      scripts={scripts}
      categories={categories}
      selectedId={selected?.id ?? null}
      onSelect={handleSelect}
      onCreate={openCreate}
      onEdit={openEdit}
      onSetDefault={(s) => defaultMutation.mutate(s)}
      search={search}
      setSearch={setSearch}
      category={category}
      setCategory={setCategory}
      isLoading={isLoading}
    />
  );

  const practice = (
    <PracticePanel
      script={selected}
      onEndPractice={(durationSeconds, notes) => practiceMutation.mutate({ durationSeconds, notes })}
    />
  );

  const details = <DetailsPanel script={selected} />;

  const steps = ["Choose script", "Practice", "Review"];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Playground</h1>
        <p className="text-sm text-muted-foreground">Practice your scripts out loud, log sessions, and set your default dialer script.</p>
      </div>

      {/* Mobile step indicator */}
      <div className="flex items-center gap-1 lg:hidden" role="list" aria-label="Practice steps">
        {steps.map((label, i) => (
          <div key={label} role="listitem" className="flex flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileStep(i)}
              disabled={i === 1 && !selected}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-center transition-colors",
                mobileStep === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                i === 1 && !selected && "opacity-50"
              )}
              aria-current={mobileStep === i ? "step" : undefined}
            >
              {i + 1}. {label}
            </button>
          </div>
        ))}
      </div>

      {/* Desktop: 3 columns. Mobile: step-based single column. */}
      <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)_280px] lg:gap-4 lg:h-[calc(100dvh-220px)] lg:min-h-[480px]">
        <Card className="p-4 lg:h-full lg:overflow-hidden hidden lg:block">
          {library}
        </Card>
        <Card className="p-4 lg:h-full lg:overflow-hidden hidden lg:block">
          {practice}
        </Card>
        <Card className="p-4 lg:h-full lg:overflow-hidden hidden lg:block">
          {details}
        </Card>

        {/* Mobile / tablet single-pane */}
        <div className="lg:hidden">
          {mobileStep > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMobileStep(mobileStep - 1)} className="mb-2">
              <ChevronLeft className="h-4 w-4 mr-1" aria-hidden /> Back
            </Button>
          )}
          <Card className="p-4 min-h-[60dvh]">
            {mobileStep === 0 && library}
            {mobileStep === 1 && practice}
            {mobileStep === 2 && details}
          </Card>
        </div>
      </div>

      {/* Script editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit script" : "New script"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label htmlFor="script-name" className="text-sm font-medium">Name</label>
              <Input
                id="script-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Cold call opener — Detroit"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="script-category" className="text-sm font-medium">Category</label>
                <Input
                  id="script-category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g. Cold call"
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="script-description" className="text-sm font-medium">Description</label>
                <Input
                  id="script-description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="When to use this script"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label htmlFor="script-content" className="text-sm font-medium">
                Script content <span className="text-muted-foreground font-normal">— blank lines separate sections</span>
              </label>
              <Textarea
                id="script-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder={"Opener:\nHi, this is ___ with Ocean Luxe…\n\nDiscovery:\nWhat would you do if…"}
                rows={10}
                className="mt-1 font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!formName.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Create script"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Playground() {
  return (
    <Layout>
      <PlaygroundInner />
    </Layout>
  );
}
