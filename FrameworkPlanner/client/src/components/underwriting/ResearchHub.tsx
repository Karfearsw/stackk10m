import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ExternalLink, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BrowserStatus = "idle" | "loading" | "loaded" | "maybe_blocked";

export type PlaygroundQuickLink = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

export type PlaygroundNoteType = "residential" | "land_vacant" | "commercial" | "multi_family";

export type PlaygroundResearchNote = {
  id: string;
  type: PlaygroundNoteType;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeQuery(q: string) {
  return String(q || "").trim().replace(/\s+/g, " ");
}

function makeSearchUrl(q: string) {
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

function tryNormalizeHttpUrl(input: string) {
  const raw = input.trim();
  if (!raw) return { ok: false as const, error: "Enter a URL or search" };
  if (raw.includes(" ") || (!raw.includes("://") && !raw.includes("."))) {
    const q = normalizeQuery(raw);
    return { ok: true as const, url: makeSearchUrl(q) };
  }
  const withProto = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false as const, error: "Use http(s)" };
    return { ok: true as const, url: u.toString() };
  } catch {
    return { ok: false as const, error: "Enter a valid URL or search" };
  }
}

function makeAddressSources(address: string) {
  const addr = String(address || "").trim();
  const zillow = addr ? `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} site:zillow.com`)}` : "https://www.zillow.com/";
  const redfin = addr ? `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} site:redfin.com`)}` : "https://www.redfin.com/";
  const realtor = addr ? `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} site:realtor.com`)}` : "https://www.realtor.com/";
  const tps = addr ? `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(addr)}` : "https://www.truepeoplesearch.com/";
  const maps = addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : "https://www.google.com/maps";
  const county = addr ? `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} county property appraiser`)}` : makeSearchUrl("county property appraiser");
  return { zillow, redfin, realtor, tps, maps, county };
}

type ResourceLink = { label: string; url: string; badge?: string };

function ResourceList(props: { title: string; subtitle?: string; items: ResourceLink[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{props.title}</CardTitle>
        {props.subtitle ? <div className="text-sm text-muted-foreground">{props.subtitle}</div> : null}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {props.items.map((i) => (
            <Button
              key={i.label}
              variant="outline"
              className="justify-between"
              onClick={() => window.open(i.url, "_blank", "noopener,noreferrer")}
            >
              <span className="truncate">{i.label}</span>
              <span className="flex items-center gap-2">
                {i.badge ? <Badge variant="secondary">{i.badge}</Badge> : null}
                <ExternalLink className="h-4 w-4" />
              </span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const noteTypeOptions: { key: PlaygroundNoteType; label: string }[] = [
  { key: "residential", label: "Residential" },
  { key: "land_vacant", label: "Land/Vacant" },
  { key: "commercial", label: "Commercial" },
  { key: "multi_family", label: "Multi-Family" },
];

export function ResearchHub(props: {
  address: string;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  quickLinks: PlaygroundQuickLink[];
  onQuickLinksChange: (next: PlaygroundQuickLink[] | ((prev: PlaygroundQuickLink[]) => PlaygroundQuickLink[])) => void;
  notes: PlaygroundResearchNote[];
  onNotesChange: (next: PlaygroundResearchNote[] | ((prev: PlaygroundResearchNote[]) => PlaygroundResearchNote[])) => void;
  onSaveComp?: (comp: { address?: string; url?: string; soldPrice?: number | null; beds?: number | null; baths?: number | null; sqft?: number | null }) => void;
}) {
  const { toast } = useToast();
  const address = String(props.address || "").trim();
  const sources = useMemo(() => makeAddressSources(address), [address]);

  const [tab, setTab] = useState<"browser" | "zoning" | "resources" | "suppliers" | "notes">("browser");

  const [urlInput, setUrlInput] = useState(props.currentUrl);
  const [srcUrl, setSrcUrl] = useState(props.currentUrl);
  const [status, setStatus] = useState<BrowserStatus>(() => (props.currentUrl.trim() ? "loading" : "idle"));
  const [validationError, setValidationError] = useState<string>("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const longLoadTimerRef = useRef<number | null>(null);
  const iframeKey = `${srcUrl}::${reloadNonce}`;

  useEffect(() => {
    setUrlInput(props.currentUrl);
    setSrcUrl(props.currentUrl);
    setStatus(props.currentUrl.trim() ? "loading" : "idle");
  }, [props.currentUrl]);

  useEffect(() => {
    if (!srcUrl.trim()) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
  }, [srcUrl, reloadNonce]);

  useEffect(() => {
    if (status !== "loading") return;
    if (longLoadTimerRef.current) window.clearTimeout(longLoadTimerRef.current);
    longLoadTimerRef.current = window.setTimeout(() => {
      setStatus((s) => (s === "loading" ? "maybe_blocked" : s));
    }, 4000);
    return () => {
      if (longLoadTimerRef.current) window.clearTimeout(longLoadTimerRef.current);
      longLoadTimerRef.current = null;
    };
  }, [status, srcUrl, reloadNonce]);

  const navigate = (raw: string) => {
    const result = tryNormalizeHttpUrl(raw);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setValidationError("");
    setStatus("loading");
    setSrcUrl(result.url);
    props.onUrlChange(result.url);
  };

  const reload = () => {
    setStatus("loading");
    setReloadNonce((x) => x + 1);
  };

  const openExternal = () => {
    if (!srcUrl.trim()) return;
    window.open(srcUrl, "_blank", "noopener,noreferrer");
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(srcUrl);
      toast({ title: "URL copied" });
    } catch {}
  };

  const addQuickLink = (name: string, url: string) => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) return;
    const normalized = tryNormalizeHttpUrl(trimmedUrl);
    if (!normalized.ok) {
      toast({ title: "Invalid URL", description: normalized.error, variant: "destructive" });
      return;
    }
    props.onQuickLinksChange((prev) => [{ id: makeId(), name: trimmedName, url: normalized.url, createdAt: nowIso() }, ...prev]);
    toast({ title: "Bookmark added" });
  };

  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const [noteFilter, setNoteFilter] = useState<"all" | PlaygroundNoteType>("all");
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");

  useEffect(() => {
    if (selectedNoteId) return;
    if (props.notes.length) setSelectedNoteId(props.notes[0].id);
  }, [props.notes, selectedNoteId]);

  const filteredNotes = useMemo(() => {
    if (noteFilter === "all") return props.notes;
    return props.notes.filter((n) => n.type === noteFilter);
  }, [noteFilter, props.notes]);

  const selectedNote = useMemo(() => props.notes.find((n) => n.id === selectedNoteId) || null, [props.notes, selectedNoteId]);

  const createNote = () => {
    const id = makeId();
    const now = nowIso();
    const note: PlaygroundResearchNote = {
      id,
      type: noteFilter === "all" ? "residential" : noteFilter,
      title: "New note",
      content: "",
      createdAt: now,
      updatedAt: now,
    };
    props.onNotesChange((prev) => [note, ...prev]);
    setSelectedNoteId(id);
  };

  const setSelectedNotePatch = (patch: Partial<Pick<PlaygroundResearchNote, "title" | "content" | "type">>) => {
    if (!selectedNoteId) return;
    props.onNotesChange((prev) =>
      prev.map((n) =>
        n.id === selectedNoteId
          ? {
              ...n,
              ...patch,
              updatedAt: nowIso(),
            }
          : n,
      ),
    );
  };

  const deleteSelectedNote = () => {
    if (!selectedNoteId) return;
    props.onNotesChange((prev) => prev.filter((n) => n.id !== selectedNoteId));
    setSelectedNoteId("");
  };

  const zoningLists = useMemo(() => {
    const florida: ResourceLink[] = [
      { label: "Florida Property Appraiser", url: "https://floridarevenue.com/property/" },
      { label: "Orange County FL Property", url: "https://ocpaweb.ocpafl.org/" },
      { label: "Miami-Dade Property Search", url: "https://www.miamidade.gov/pa/" },
      { label: "Hillsborough County GIS", url: "https://gis.hcpafl.org/" },
    ];
    const northeast: ResourceLink[] = [
      { label: "Massachusetts GIS", url: "https://www.mass.gov/orgs/massgis-bureau-of-geographic-information", badge: "MA" },
      { label: "Rhode Island GIS", url: "https://www.rigis.org/", badge: "RI" },
    ];
    const national: ResourceLink[] = [
      { label: "Zillow Zoning Info", url: sources.zillow },
      { label: "County GIS Lookup", url: sources.county },
    ];
    return { florida, northeast, national };
  }, [sources.county, sources.zillow]);

  const resourceLists = useMemo(() => {
    const items: ResourceLink[] = [
      { label: "Zillow", url: sources.zillow },
      { label: "Redfin", url: sources.redfin },
      { label: "Realtor.com", url: sources.realtor },
      { label: "TruePeopleSearch", url: sources.tps },
      { label: "Google Maps", url: sources.maps },
      { label: "County Property Appraiser", url: sources.county },
    ];
    return items;
  }, [sources.county, sources.maps, sources.redfin, sources.realtor, sources.tps, sources.zillow]);

  const suppliersLists = useMemo(() => {
    const national: ResourceLink[] = [
      { label: "Home Depot (Search)", url: makeSearchUrl(`${address} home depot`) },
      { label: "Lowe's (Search)", url: makeSearchUrl(`${address} lowe's`) },
      { label: "Dumpster Rental (Search)", url: makeSearchUrl(`${address} dumpster rental`) },
      { label: "Roofing Contractor (Search)", url: makeSearchUrl(`${address} roofing contractor`) },
    ];
    return { national };
  }, [address]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Property Playground</CardTitle>
            <div className="text-xs text-muted-foreground truncate">Research hub for zoning, suppliers, comps, and deal ideas</div>
          </div>
          <Badge variant={status === "maybe_blocked" ? "destructive" : status === "loaded" ? "default" : "secondary"}>
            {status === "idle" ? "Ready" : status === "loading" ? "Loading" : status === "loaded" ? "Loaded" : "Blocked?"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0 h-[calc(100%-4.25rem)]">
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-9 min-h-0 flex flex-col">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-col min-h-0">
              <TabsList className="justify-start">
                <TabsTrigger value="browser">Browser</TabsTrigger>
                <TabsTrigger value="zoning">Zoning</TabsTrigger>
                <TabsTrigger value="resources">Resources</TabsTrigger>
                <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="browser" className="mt-3 flex flex-col min-h-0 gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[240px] relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(urlInput);
                      }}
                      placeholder="Search anything…"
                      className="pl-9"
                      aria-invalid={Boolean(validationError)}
                    />
                    {validationError ? <div className="text-xs text-destructive mt-1">{validationError}</div> : null}
                  </div>
                  <Button onClick={() => navigate(urlInput)} disabled={!urlInput.trim()}>
                    Go
                  </Button>
                  <Button variant="destructive" onClick={openExternal} disabled={!srcUrl.trim()}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in New Tab
                  </Button>
                  <Button variant="outline" size="icon" onClick={reload} aria-label="Reload" disabled={!srcUrl.trim()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={copyUrl} aria-label="Copy URL" disabled={!srcUrl.trim()}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="rounded-md border bg-amber-50 text-amber-950 px-4 py-3 text-sm">
                  <div className="font-medium">Most sites block embedded viewing</div>
                  <div className="text-amber-900/80">
                    For security reasons, sites like Zillow, Redfin, and county GIS portals don’t allow embedding. Use the “Open in New Tab” button above
                    to view them directly.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Button variant="outline" className="justify-start" onClick={() => navigate(sources.zillow)}>
                    Zillow
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(sources.redfin)}>
                    Redfin
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(sources.realtor)}>
                    Realtor.com
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(sources.tps)}>
                    TruePeopleSearch
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => navigate(sources.maps)}>
                    Google Maps
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={() => (srcUrl.trim() ? navigate(srcUrl) : null)} disabled={!srcUrl.trim()}>
                    Current URL
                  </Button>
                </div>

                <div className="relative flex-1 min-h-0 w-full overflow-hidden rounded-md border bg-background">
                  {!srcUrl.trim() ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-sm text-muted-foreground">Enter a search or URL to start.</div>
                    </div>
                  ) : null}
                  {status === "loading" || status === "maybe_blocked" ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <div>{status === "maybe_blocked" ? "Still loading. This site may block embedding." : "Loading page…"}</div>
                        {status === "maybe_blocked" ? (
                          <Button variant="outline" size="sm" onClick={openExternal}>
                            Open in new tab
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {srcUrl.trim() ? (
                    <iframe
                      key={iframeKey}
                      title="Playground browser"
                      src={srcUrl}
                      className="h-full w-full"
                      referrerPolicy="no-referrer"
                      onLoad={() => setStatus("loaded")}
                    />
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="zoning" className="mt-3 space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <ResourceList title="Florida Resources" subtitle="Property appraiser and GIS lookup" items={zoningLists.florida} />
                  <ResourceList title="Northeast Resources" subtitle="Massachusetts & Rhode Island" items={zoningLists.northeast} />
                </div>
                <ResourceList title="National Resources" subtitle="Works for any state" items={zoningLists.national} />
              </TabsContent>

              <TabsContent value="resources" className="mt-3 space-y-3">
                <ResourceList title="Research Resources" subtitle="Quick destinations for comps, owners, and maps" items={resourceLists} />
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => navigate(makeSearchUrl(address || "real estate comps"))}>
                    Search address
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="suppliers" className="mt-3 space-y-3">
                <ResourceList title="Suppliers" subtitle="Starter list (config-driven)" items={suppliersLists.national} />
              </TabsContent>

              <TabsContent value="notes" className="mt-3 flex-1 min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full min-h-0">
                  <div className="lg:col-span-4 min-h-0">
                    <Card className="h-full">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">Research Notes</CardTitle>
                          <Button size="sm" onClick={createNote}>
                            + New
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 h-[calc(100%-4.25rem)] min-h-0">
                        <div className="flex flex-wrap gap-2 mb-3">
                          <Button
                            size="sm"
                            variant={noteFilter === "all" ? "default" : "outline"}
                            onClick={() => setNoteFilter("all")}
                          >
                            All Types
                          </Button>
                          {noteTypeOptions.map((t) => (
                            <Button
                              key={t.key}
                              size="sm"
                              variant={noteFilter === t.key ? "default" : "outline"}
                              onClick={() => setNoteFilter(t.key)}
                            >
                              {t.label}
                            </Button>
                          ))}
                        </div>

                        <ScrollArea className="h-[calc(100%-3.25rem)]">
                          <div className="space-y-2 pr-3">
                            {filteredNotes.length ? (
                              filteredNotes.map((n) => (
                                <button
                                  key={n.id}
                                  type="button"
                                  className={`w-full text-left rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors ${
                                    selectedNoteId === n.id ? "bg-muted/40" : "bg-background"
                                  }`}
                                  onClick={() => setSelectedNoteId(n.id)}
                                >
                                  <div className="text-sm font-medium truncate">{n.title || "Untitled"}</div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <Badge variant="secondary" className="h-5">
                                      {noteTypeOptions.find((x) => x.key === n.type)?.label || n.type}
                                    </Badge>
                                    <span className="truncate">{n.content ? n.content.replace(/\s+/g, " ").slice(0, 80) : "No content"}</span>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground py-10 text-center">No notes yet. Create one to start researching.</div>
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="lg:col-span-8 min-h-0">
                    <Card className="h-full">
                      <CardContent className="pt-6 h-full min-h-0">
                        {selectedNote ? (
                          <div className="h-full flex flex-col min-h-0 gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Input value={selectedNote.title} onChange={(e) => setSelectedNotePatch({ title: e.target.value })} />
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (!selectedNoteId) return;
                                    deleteSelectedNote();
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {noteTypeOptions.map((t) => (
                                <Button
                                  key={t.key}
                                  size="sm"
                                  variant={selectedNote.type === t.key ? "default" : "outline"}
                                  onClick={() => setSelectedNotePatch({ type: t.key })}
                                >
                                  {t.label}
                                </Button>
                              ))}
                            </div>
                            <Textarea
                              className="flex-1 min-h-0"
                              value={selectedNote.content}
                              onChange={(e) => setSelectedNotePatch({ content: e.target.value })}
                              placeholder="Write your research notes…"
                            />
                            <div className="text-xs text-muted-foreground">
                              Updated {selectedNote.updatedAt ? new Date(selectedNote.updatedAt).toLocaleString() : "—"}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                            Select or create a note
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="lg:col-span-3 min-h-0">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Links</CardTitle>
                <div className="text-sm text-muted-foreground">Your saved bookmarks</div>
              </CardHeader>
              <CardContent className="pt-0 h-[calc(100%-5.75rem)] min-h-0 flex flex-col gap-3">
                <div className="space-y-2">
                  <Input placeholder="Link name" value={newLinkName} onChange={(e) => setNewLinkName(e.target.value)} />
                  <Input placeholder="URL" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} />
                  <Button
                    className="w-full"
                    onClick={() => {
                      addQuickLink(newLinkName, newLinkUrl);
                      setNewLinkName("");
                      setNewLinkUrl("");
                    }}
                    disabled={!newLinkName.trim() || !newLinkUrl.trim()}
                  >
                    + Add Bookmark
                  </Button>
                </div>

                <ScrollArea className="flex-1 min-h-0">
                  <div className="space-y-2 pr-3">
                    {props.quickLinks.length ? (
                      props.quickLinks.map((b) => (
                        <div key={b.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              setTab("browser");
                              setUrlInput(b.url);
                              navigate(b.url);
                            }}
                          >
                            <div className="text-sm font-medium truncate">{b.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{b.url}</div>
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Open"
                            onClick={() => window.open(b.url, "_blank", "noopener,noreferrer")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete"
                            onClick={() => props.onQuickLinksChange((prev) => prev.filter((x) => x.id !== b.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground py-6 text-center">No bookmarks yet</div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

