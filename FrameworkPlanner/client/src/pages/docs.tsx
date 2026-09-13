import { useMemo, useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MarkdownView } from "@/components/docs/MarkdownView";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BookOpen, ChevronRight, FileText, Pencil, Plus, Search, Trash2, X, FolderOpen, Eye } from "lucide-react";
import { toast } from "sonner";

type DocsCategory = { id: number; name: string; slug: string; description: string | null; sortOrder: number | null };
type DocsPageMeta = { id: number; categoryId: number | null; title: string; slug: string; summary: string | null; tags: string[] | null; isPublished: boolean | null };
type DocsPageFull = DocsPageMeta & { body: string };

const emptyDraft = { id: null as number | null, title: "", slug: "", summary: "", categoryId: "" as string, tags: "", body: "" };

export default function DocsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "owner" || user?.isSuperAdmin || false;
  const queryClient = useQueryClient();
  const [location] = useLocation();

  // Deep link: /docs?category=<slug>&page=<slug>&q=<term>
  const search = typeof window !== "undefined" ? window.location.search : "";
  const initialParams = useMemo(() => new URLSearchParams(search || ""), [search]);
  const [selectedCat, setSelectedCat] = useState<string | null>(initialParams.get("category"));
  const [selectedPageSlug, setSelectedPageSlug] = useState<string | null>(initialParams.get("page"));
  const [searchInput, setSearchInput] = useState(initialParams.get("q") || "");
  const [searchTerm, setSearchTerm] = useState(initialParams.get("q") || "");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: categories = [], isLoading: catsLoading } = useQuery<DocsCategory[]>({
    queryKey: ["/api/docs/categories"],
    queryFn: async () => (await apiRequest("GET", "/api/docs/categories")).json(),
  });

  const { data: pages = [], isLoading: pagesLoading } = useQuery<DocsPageMeta[]>({
    queryKey: ["/api/docs/pages", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set("q", searchTerm);
      const res = await apiRequest("GET", `/api/docs/pages${params.toString() ? `?${params}` : ""}`);
      return res.json();
    },
  });

  const pagesByCategory = useMemo(() => {
    const map = new Map<string, DocsPageMeta[]>();
    const uncategorized: DocsPageMeta[] = [];
    for (const p of pages) {
      const cat = categories.find((c) => c.id === p.categoryId);
      if (!cat) {
        uncategorized.push(p);
        continue;
      }
      if (!map.has(cat.slug)) map.set(cat.slug, []);
      map.get(cat.slug)!.push(p);
    }
    return { map, uncategorized };
  }, [pages, categories]);

  const { data: page, isLoading: pageLoading } = useQuery<DocsPageFull>({
    queryKey: ["/api/docs/pages", selectedPageSlug],
    enabled: !!selectedPageSlug,
    queryFn: async () => (await apiRequest("GET", `/api/docs/pages/${selectedPageSlug}`)).json(),
  });

  const selectedCategory = categories.find((c) => c.slug === selectedCat) || null;

  // Editor state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "page"; id: number; title: string } | null>(null);

  useEffect(() => {
    if (page && editing === false) return;
    if (page) setDraft({ id: page.id, title: page.title, slug: page.slug, summary: page.summary || "", categoryId: page.categoryId ? String(page.categoryId) : "", tags: (page.tags || []).join(", "), body: page.body });
  }, [page, editing]);

  const openNewPage = () => {
    setDraft({ ...emptyDraft, categoryId: selectedCategory ? String(selectedCategory.id) : "" });
    setEditing(true);
  };
  const openEditPage = (p: DocsPageFull) => {
    setDraft({ id: p.id, title: p.title, slug: p.slug, summary: p.summary || "", categoryId: p.categoryId ? String(p.categoryId) : "", tags: (p.tags || []).join(", "), body: p.body });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: draft.title.trim(),
        slug: draft.slug || draft.title,
        summary: draft.summary || null,
        categoryId: draft.categoryId ? Number(draft.categoryId) : null,
        tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
        body: draft.body,
        isPublished: true,
      };
      if (draft.id) return (await apiRequest("PATCH", `/api/docs/pages/${draft.id}`, payload)).json();
      return (await apiRequest("POST", "/api/docs/pages", payload)).json();
    },
    onSuccess: (saved: any) => {
      toast.success(draft.id ? "Page updated" : "Page created");
      setEditing(false);
      setSelectedCat(categories.find((c) => c.id === saved?.categoryId)?.slug || selectedCat);
      setSelectedPageSlug(saved?.slug || null);
      queryClient.invalidateQueries({ queryKey: ["/api/docs/pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/docs/categories"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save page"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/docs/pages/${id}`)).json(),
    onSuccess: () => {
      toast.success("Page deleted");
      setDeleteTarget(null);
      setSelectedPageSlug(null);
      queryClient.invalidateQueries({ queryKey: ["/api/docs/pages"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to delete page"),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/docs/categories", { name: newCatName.trim() })).json(),
    onSuccess: () => {
      toast.success("Category created");
      setNewCatOpen(false);
      setNewCatName("");
      queryClient.invalidateQueries({ queryKey: ["/api/docs/categories"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to create category"),
  });

  // Keep the URL shareable without full navigation
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCat) params.set("category", selectedCat);
    if (selectedPageSlug) params.set("page", selectedPageSlug);
    if (searchTerm) params.set("q", searchTerm);
    const qs = params.toString();
    window.history.replaceState(null, "", `/docs${qs ? `?${qs}` : ""}`);
  }, [selectedCat, selectedPageSlug, searchTerm]);

  const SidebarNav = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search the playbook…" className="pl-8 h-9" data-testid="input-docs-search" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {catsLoading || pagesLoading ? (
          <div className="text-xs text-muted-foreground p-3">Loading…</div>
        ) : (
          <>
            {categories.map((c) => {
              const catPages = pagesByCategory.map.get(c.slug) || [];
              const expanded = !selectedCat || selectedCat === c.slug || !!searchTerm;
              const hasSelected = catPages.some((p) => p.slug === selectedPageSlug);
              return (
                <div key={c.id} className="mb-1">
                  <button
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium hover:bg-accent ${hasSelected ? "text-primary" : ""}`}
                    onClick={() => {
                      setSelectedCat(c.slug);
                      setSelectedPageSlug(null);
                      setMobileNavOpen(false);
                    }}
                  >
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{catPages.length}</span>
                  </button>
                  {expanded && (
                    <div className="ml-4 border-l border-border pl-1.5 mt-0.5">
                      {catPages.length === 0 && <div className="text-xs text-muted-foreground px-2 py-1">No pages</div>}
                      {catPages.map((p) => (
                        <button
                          key={p.id}
                          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] text-left hover:bg-accent ${selectedPageSlug === p.slug ? "bg-accent text-primary font-medium" : "text-foreground/80"}`}
                          onClick={() => {
                            setSelectedCat(c.slug);
                            setSelectedPageSlug(p.slug);
                            setMobileNavOpen(false);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{p.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {pagesByCategory.uncategorized.length > 0 && (
              <div className="mb-1">
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  Other pages
                </div>
                <div className="ml-4 border-l border-border pl-1.5 mt-0.5">
                  {pagesByCategory.uncategorized.map((p) => (
                    <button key={p.id} className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] text-left hover:bg-accent ${selectedPageSlug === p.slug ? "bg-accent text-primary font-medium" : "text-foreground/80"}`} onClick={() => { setSelectedPageSlug(p.slug); setMobileNavOpen(false); }}>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{p.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {categories.length === 0 && pagesByCategory.uncategorized.length === 0 && (
              <div className="text-xs text-muted-foreground p-3">No documentation yet.</div>
            )}
          </>
        )}
      </div>
      {isAdmin && (
        <div className="p-3 border-t border-border flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={openNewPage} data-testid="button-new-doc-page">
            <Plus className="h-4 w-4 mr-1" /> New page
          </Button>
          <Button size="sm" variant="outline" onClick={() => setNewCatOpen(true)} data-testid="button-new-doc-category">
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="flex h-[calc(100vh-4rem)] -m-6 overflow-hidden border-t border-border" data-testid="docs-page">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-border bg-muted/20">
          {SidebarNav}
        </aside>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
            <aside className="relative flex flex-col w-80 max-w-[85vw] bg-background border-r border-border">
              {SidebarNav}
            </aside>
          </div>
        )}

        {/* Reader / editor */}
        <main className="flex-1 overflow-y-auto">
          <div className="lg:hidden sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-background border-b border-border">
            <Button size="sm" variant="outline" onClick={() => setMobileNavOpen(true)}>
              <BookOpen className="h-4 w-4 mr-1" /> Browse
            </Button>
            {page && <span className="text-sm font-medium truncate">{page.title}</span>}
          </div>

          {editing ? (
            <div className="max-w-5xl mx-auto p-4 lg:p-8">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-lg font-semibold">{draft.id ? "Edit page" : "New page"}</h1>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
                  <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!draft.title.trim() || !draft.body.trim() || saveMutation.isPending} data-testid="button-save-doc-page">
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Page title" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={draft.categoryId || "none"} onValueChange={(v) => setDraft({ ...draft, categoryId: v === "none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Uncategorized</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tags (comma separated)</Label>
                      <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="scripts, dispo" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Summary</Label>
                    <Input value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} placeholder="One-line summary shown in lists" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Body (Markdown)</Label>
                    <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={22} className="font-mono text-[13px]" placeholder="# Heading&#10;Write the page in markdown…" data-testid="textarea-docs-body" />
                  </div>
                </div>
                <div className="border border-border rounded-lg p-4 bg-muted/10 overflow-y-auto max-h-[70vh]">
                  <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Live preview</div>
                  <MarkdownView source={draft.body} />
                </div>
              </div>
            </div>
          ) : pageLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Loading page…</div>
          ) : page ? (
            <div className="max-w-3xl mx-auto p-4 lg:p-8 pb-16">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  {selectedCategory && <div className="text-xs text-muted-foreground mb-1">{selectedCategory.name}</div>}
                  <h1 className="text-2xl font-bold" data-testid="docs-page-title">{page.title}</h1>
                  {page.summary && <p className="text-sm text-muted-foreground mt-1">{page.summary}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEditPage(page)} data-testid="button-edit-doc-page">
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDeleteTarget({ type: "page", id: page.id, title: page.title })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {page.tags && page.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {page.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>
                  ))}
                </div>
              )}
              <MarkdownView source={page.body} />
              <div className="mt-10 pt-4 border-t border-border text-xs text-muted-foreground">
                Team playbook · edit freely · changes are instant for the whole team
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-lg font-semibold mb-1">Team Playbook</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchTerm
                    ? `No pages match “${searchTerm}”.`
                    : "Pick a page from the sidebar, or search the playbook. Everything from cold-call scripts to the closing runbook lives here."}
                </p>
                {isAdmin && !searchTerm && (
                  <Button size="sm" onClick={openNewPage}><Plus className="h-4 w-4 mr-1" /> Write the first page</Button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>Group related pages together (e.g. "Scripts", "Compliance").</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCatOpen(false)}>Cancel</Button>
            <Button onClick={() => createCategoryMutation.mutate()} disabled={!newCatName.trim() || createCategoryMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete page?</DialogTitle>
            <DialogDescription>"{deleteTarget?.title}" will be removed for the whole team. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
