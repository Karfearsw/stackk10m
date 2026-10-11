import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, FileText, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { getProxiedUrl } from "@/lib/proxy-url";
import { extractCompFromClipboardText } from "@/components/underwriting/comp-text";
import { SaveCompDialog } from "@/components/underwriting/SaveCompDialog";
import { useToast } from "@/hooks/use-toast";

type TabStatus = "idle" | "loading" | "loaded" | "maybe_blocked";

type CompTab = {
  id: string;
  label: string;
  url: string;
  deepLink?: string;
  status: TabStatus;
  nonce: number;
};

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ddgSiteSearch(query: string) {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function makeCompSources(address: string): { label: string; url: string; deepLink?: string }[] {
  const addr = address.trim();
  if (!addr) return [];
  return [
    {
      label: "Zillow",
      url: ddgSiteSearch(`${addr} site:zillow.com`),
      deepLink: `https://www.zillow.com/homes/${encodeURIComponent(addr)}_rb/`,
    },
    {
      label: "Redfin",
      url: ddgSiteSearch(`${addr} site:redfin.com`),
      deepLink: "https://www.redfin.com/",
    },
    {
      label: "Realtor.com",
      url: ddgSiteSearch(`${addr} site:realtor.com`),
      deepLink: `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(addr)}`,
    },
    {
      label: "County",
      url: ddgSiteSearch(`${addr} county property appraiser`),
    },
  ];
}

function normalizeUrlInput(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withProto = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Comp lookup workflow: enter the subject address, open the key comp sources
 * as switchable in-app tabs (proxied iframes), and extract listing data.
 *
 * The "Extract" button pulls the active tab's page through reader mode
 * (/api/playground/extract → Jina Reader markdown) and auto-parses
 * price/beds/baths/sqft into the Save comp dialog — so comps get captured
 * even when a site blocks iframe rendering (Zillow/Redfin anti-bot).
 */
export function CompLookupTab(props: {
  address: string;
  onSaveComp: (comp: {
    address?: string;
    url?: string;
    soldPrice?: number | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
  }) => void;
}) {
  const { toast } = useToast();
  const [addressInput, setAddressInput] = useState(props.address || "");
  const [tabs, setTabs] = useState<CompTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [customUrl, setCustomUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [extracted, setExtracted] = useState<{ soldPrice?: string; beds?: string; baths?: string; sqft?: string }>({});
  const [extractedUrl, setExtractedUrl] = useState("");
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setAddressInput(props.address || "");
  }, [props.address]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const markBlockedAfterDelay = (id: string) => {
    const prev = timersRef.current.get(id);
    if (prev) window.clearTimeout(prev);
    const timer = window.setTimeout(() => {
      setTabs((ts) => ts.map((t) => (t.id === id && t.status === "loading" ? { ...t, status: "maybe_blocked" } : t)));
    }, 9000);
    timersRef.current.set(id, timer);
  };

  const setTabStatus = (id: string, status: TabStatus) => {
    if (status !== "loading") {
      const prev = timersRef.current.get(id);
      if (prev) {
        window.clearTimeout(prev);
        timersRef.current.delete(id);
      }
    }
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
  };

  const loadSources = () => {
    const addr = addressInput.trim();
    if (!addr) {
      toast({ title: "Enter an address", description: "Type the subject property address first.", variant: "destructive" });
      return;
    }
    const sources = makeCompSources(addr);
    const newTabs: CompTab[] = sources.map((s) => ({ ...s, id: makeId(), status: "loading" as TabStatus, nonce: 0 }));
    setTabs(newTabs);
    setActiveTabId(newTabs[0]?.id || "");
    newTabs.forEach((t) => markBlockedAfterDelay(t.id));
  };

  const addCustomTab = () => {
    const url = normalizeUrlInput(customUrl);
    if (!url) {
      toast({ title: "Invalid URL", description: "Enter a valid http(s) URL.", variant: "destructive" });
      return;
    }
    const tab: CompTab = { id: makeId(), label: "Page", url, status: "loading", nonce: 0 };
    setTabs((ts) => [...ts, tab]);
    setActiveTabId(tab.id);
    setCustomUrl("");
    markBlockedAfterDelay(tab.id);
  };

  const closeTab = (id: string) => {
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id);
      if (activeTabId === id) setActiveTabId(next[0]?.id || "");
      return next;
    });
  };

  const reloadTab = (id: string) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, status: "loading" as TabStatus, nonce: t.nonce + 1 } : t)));
    markBlockedAfterDelay(id);
  };

  const navigateTab = (id: string, raw: string) => {
    const url = normalizeUrlInput(raw);
    if (!url) {
      toast({ title: "Invalid URL", variant: "destructive" });
      return;
    }
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, url, status: "loading" as TabStatus } : t)));
    markBlockedAfterDelay(id);
  };

  const openExternal = (tab: CompTab) => {
    window.open(tab.deepLink || tab.url, "_blank", "noopener,noreferrer");
  };

  const extractTab = async (tab: CompTab) => {
    if (extracting) return;
    setExtracting(true);
    try {
      const res = await fetch(`/api/playground/extract?url=${encodeURIComponent(tab.url)}`, { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `Extract failed (${res.status})`);
      const markdown = String(json?.markdown || "");
      if (!markdown.trim()) throw new Error("No readable content extracted");
      const parsed = extractCompFromClipboardText(markdown);
      setExtracted({
        soldPrice: parsed.soldPrice != null ? String(parsed.soldPrice) : "",
        beds: parsed.beds != null ? String(parsed.beds) : "",
        baths: parsed.baths != null ? String(parsed.baths) : "",
        sqft: parsed.sqft != null ? String(parsed.sqft) : "",
      });
      setExtractedUrl(tab.url);
      setSaveOpen(true);
      const found = [parsed.soldPrice, parsed.beds, parsed.baths, parsed.sqft].filter((v) => v != null).length;
      toast({ title: found ? `Extracted ${found} field${found === 1 ? "" : "s"}` : "Nothing parsed", description: found ? "Review and save the comp." : "Fill in the fields manually." });
    } catch (e: any) {
      toast({ title: "Extract failed", description: e?.message || "Could not read this page.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-0 gap-3 h-full">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadSources();
            }}
            placeholder="Subject property address…"
            className="pl-9"
          />
        </div>
        <Button onClick={loadSources}>Open comp sources</Button>
        <div className="flex-1 min-w-[200px] relative">
          <Input
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCustomTab();
            }}
            placeholder="Or paste a listing URL…"
          />
        </div>
        <Button variant="outline" onClick={addCustomTab} disabled={!customUrl.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          Open
        </Button>
      </div>

      {tabs.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap border-b pb-2">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-1 rounded-t-md border border-b-0 px-3 py-1.5 text-sm cursor-pointer ${
                t.id === activeTabId ? "bg-background font-medium" : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTabId(t.id)}
            >
              <span className="max-w-[140px] truncate">{t.label}</span>
              {t.status === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
              <button
                className="ml-1 rounded p-0.5 hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                aria-label={`Close ${t.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!activeTab && (
        <div className="rounded-md border bg-muted/20 px-4 py-8 text-sm text-muted-foreground text-center">
          Enter the subject address and click <span className="font-medium text-foreground">Open comp sources</span> to
          research Zillow, Redfin, Realtor.com, and county records side by side — without leaving the CRM.
        </div>
      )}

      {activeTab && (
        <div className="flex flex-col min-h-0 flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              key={activeTab.id}
              defaultValue={activeTab.url}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigateTab(activeTab.id, (e.target as HTMLInputElement).value);
              }}
              className="flex-1 min-w-[200px] font-mono text-xs"
              aria-label="Tab URL"
            />
            <Button variant="outline" size="sm" onClick={() => reloadTab(activeTab.id)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload
            </Button>
            <Button variant="outline" size="sm" onClick={() => extractTab(activeTab)} disabled={extracting}>
              {extracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Extract
            </Button>
            <Button variant="outline" size="sm" onClick={() => openExternal(activeTab)}>
              <ExternalLink className="h-4 w-4 mr-2" />
              {activeTab.deepLink ? `Open ${activeTab.label}` : "New tab"}
            </Button>
            <Badge variant={activeTab.status === "maybe_blocked" ? "destructive" : activeTab.status === "loaded" ? "default" : "secondary"}>
              {activeTab.status === "loading" ? "Loading" : activeTab.status === "loaded" ? "Loaded" : activeTab.status === "maybe_blocked" ? "Blocked?" : "Ready"}
            </Badge>
          </div>

          {activeTab.status === "maybe_blocked" && (
            <div className="rounded-md border bg-amber-50 text-amber-950 px-4 py-3 text-sm">
              <div className="font-medium">This page may block embedding</div>
              <div className="text-amber-900/80">
                Anti-bot protection (common on Zillow/Redfin) can prevent in-app rendering. Use{" "}
                <span className="font-medium">Extract</span> to pull the listing data anyway, or open it in a new tab.
              </div>
            </div>
          )}

          <div className="relative flex-1 min-h-[420px] rounded-md border overflow-hidden bg-background">
            {activeTab.status === "loading" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Loading page…
                </div>
              </div>
            )}
            <iframe
              key={`${activeTab.id}::${activeTab.nonce}::${activeTab.url}`}
              title={`Comp browser: ${activeTab.label}`}
              src={getProxiedUrl(activeTab.url)}
              className="h-full w-full min-h-[420px]"
              referrerPolicy="no-referrer"
              onLoad={() => setTabStatus(activeTab.id, "loaded")}
              onError={() => setTabStatus(activeTab.id, "maybe_blocked")}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Tip: navigate any tab straight to a listing page, then <span className="font-medium">Extract</span> pulls
            price / beds / baths / sqft into the save-comp form.
          </div>
        </div>
      )}

      <SaveCompDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultAddress={addressInput.trim()}
        defaultUrl={extractedUrl}
        defaultFields={extracted}
        onSave={(comp) => props.onSaveComp(comp)}
      />
    </div>
  );
}
