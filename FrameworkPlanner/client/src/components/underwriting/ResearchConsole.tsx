import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, ExternalLink, Loader2, RefreshCw, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type BrowserStatus = "idle" | "loading" | "loaded" | "maybe_blocked";

function tryNormalizeHttpUrl(input: string) {
  const raw = input.trim();
  if (!raw) return { ok: false as const, error: "Enter a URL" };
  const withProto = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false as const, error: "Use http(s)" };
    return { ok: true as const, url: u.toString() };
  } catch {
    return { ok: false as const, error: "Enter a valid URL" };
  }
}

function makeSourceUrl(source: string, address: string) {
  const addr = String(address || "").trim();
  if (!addr) {
    if (source === "maps") return "https://www.google.com/maps";
    if (source === "other") return "";
    return "https://duckduckgo.com/";
  }
  if (source === "zillow") return `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} site:zillow.com`)}`;
  if (source === "redfin") return `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} site:redfin.com`)}`;
  if (source === "realtor") return `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} site:realtor.com`)}`;
  if (source === "maps") return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  if (source === "county") return `https://duckduckgo.com/?q=${encodeURIComponent(`${addr} county property appraiser`)}`;
  return "";
}

function parseLikelyNumber(input: string): number | null {
  const cleaned = input.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractCompFromClipboardText(text: string): { soldPrice?: number | null; beds?: number | null; baths?: number | null; sqft?: number | null } {
  const t = String(text || "");
  const priceMatch = t.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  const bedsMatch = t.match(/\b(\d+(?:\.\d+)?)\s*bd\b/i);
  const bathsMatch = t.match(/\b(\d+(?:\.\d+)?)\s*ba\b/i);
  const sqftMatch = t.match(/\b([\d,]+)\s*(?:sq\s*ft|sqft)\b/i);
  return {
    soldPrice: priceMatch ? parseLikelyNumber(priceMatch[1]) : null,
    beds: bedsMatch ? parseLikelyNumber(bedsMatch[1]) : null,
    baths: bathsMatch ? parseLikelyNumber(bathsMatch[1]) : null,
    sqft: sqftMatch ? parseLikelyNumber(sqftMatch[1]) : null,
  };
}

export function ResearchConsole(props: {
  address: string;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  onSaveComp: (comp: { address?: string; url?: string; soldPrice?: number | null; beds?: number | null; baths?: number | null; sqft?: number | null }) => void;
}) {
  const { toast } = useToast();
  const [source, setSource] = useState<string>("zillow");
  const [urlInput, setUrlInput] = useState(props.currentUrl);
  const [srcUrl, setSrcUrl] = useState(props.currentUrl);
  const [status, setStatus] = useState<BrowserStatus>(() => (props.currentUrl.trim() ? "loading" : "idle"));
  const [validationError, setValidationError] = useState<string>("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [history, setHistory] = useState<string[]>([props.currentUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const longLoadTimerRef = useRef<number | null>(null);
  const iframeKey = `${srcUrl}::${reloadNonce}`;

  const sources = useMemo(
    () => [
      { id: "zillow", label: "Zillow" },
      { id: "redfin", label: "Redfin" },
      { id: "realtor", label: "Realtor" },
      { id: "maps", label: "Maps" },
      { id: "county", label: "County" },
      { id: "other", label: "Other" },
    ],
    [],
  );

  useEffect(() => {
    setUrlInput(props.currentUrl);
    setSrcUrl(props.currentUrl);
    setHistory([props.currentUrl]);
    setHistoryIndex(0);
    setStatus(props.currentUrl.trim() ? "loading" : "idle");
  }, [props.currentUrl]);

  useEffect(() => {
    if (!srcUrl.trim()) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
  }, [srcUrl, reloadNonce]);

  const navigate = (raw: string) => {
    const result = tryNormalizeHttpUrl(raw);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setValidationError("");
    setStatus("loading");
    setSrcUrl(result.url);
    setUrlInput(result.url);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, result.url];
    });
    setHistoryIndex((idx) => idx + 1);
    props.onUrlChange(result.url);
  };

  const canBack = historyIndex > 0;
  const canForward = historyIndex < history.length - 1;

  const goBack = () => {
    if (!canBack) return;
    const nextIndex = historyIndex - 1;
    const nextUrl = history[nextIndex];
    setHistoryIndex(nextIndex);
    setStatus("loading");
    setSrcUrl(nextUrl);
    setUrlInput(nextUrl);
    props.onUrlChange(nextUrl);
  };

  const goForward = () => {
    if (!canForward) return;
    const nextIndex = historyIndex + 1;
    const nextUrl = history[nextIndex];
    setHistoryIndex(nextIndex);
    setStatus("loading");
    setSrcUrl(nextUrl);
    setUrlInput(nextUrl);
    props.onUrlChange(nextUrl);
  };

  const reload = () => {
    setStatus("loading");
    setReloadNonce((x) => x + 1);
  };

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

  const applySource = (nextSource: string) => {
    setSource(nextSource);
    const nextUrl = makeSourceUrl(nextSource, props.address);
    if (nextUrl) navigate(nextUrl);
    else {
      setUrlInput("");
      setSrcUrl("");
      setStatus("idle");
      props.onUrlChange("");
    }
  };

  const saveComp = async () => {
    let clip = "";
    try {
      clip = await navigator.clipboard.readText();
    } catch {}
    const extracted = clip ? extractCompFromClipboardText(clip) : {};
    props.onSaveComp({ address: props.address, url: srcUrl, ...extracted });
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Research</CardTitle>
          <Badge variant={status === "maybe_blocked" ? "destructive" : status === "loaded" ? "default" : "secondary"}>
            {status === "idle" ? "Ready" : status === "loading" ? "Loading" : status === "loaded" ? "Loaded" : "Blocked?"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0 h-[calc(100%-4.25rem)]">
        <div className="h-full grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-2">
            <Tabs value={source} onValueChange={applySource}>
              <TabsList className="w-full h-auto flex-col items-stretch justify-start gap-1 bg-muted/40">
                {sources.map((s) => (
                  <TabsTrigger key={s.id} value={s.id} className="w-full justify-start">
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="md:col-span-8 flex flex-col gap-2 min-h-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[220px]">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(urlInput);
                  }}
                  placeholder="https://…"
                  aria-invalid={Boolean(validationError)}
                />
                {validationError ? <div className="text-xs text-destructive mt-1">{validationError}</div> : null}
              </div>
              <Button onClick={() => navigate(urlInput)} disabled={!urlInput.trim()}>
                {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
              </Button>
              <Button variant="outline" size="icon" onClick={goBack} disabled={!canBack} aria-label="Back">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goForward} disabled={!canForward} aria-label="Forward">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={reload} aria-label="Reload">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={copyUrl} aria-label="Copy URL">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={openExternal} aria-label="Open in new tab">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative flex-1 min-h-0 w-full overflow-hidden rounded-md border bg-background">
              {!srcUrl.trim() ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-sm text-muted-foreground">Pick a source to start.</div>
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
                  title="Research browser"
                  src={srcUrl}
                  className="h-full w-full"
                  referrerPolicy="no-referrer"
                  onLoad={() => setStatus("loaded")}
                />
              ) : null}
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="h-full rounded-md border p-3 flex flex-col gap-3">
              <div className="text-sm font-medium">Scratchpad</div>
              <Button onClick={saveComp} className="w-full justify-start">
                <Plus className="h-4 w-4 mr-2" />
                Save as comp (C)
              </Button>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Tip: copy a listing snippet first. When you save a comp, price/beds/baths/sqft auto-fill from clipboard when possible.
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
