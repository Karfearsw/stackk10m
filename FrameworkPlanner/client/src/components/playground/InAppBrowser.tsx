import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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

export function InAppBrowser(props: {
  initialUrl: string;
  onUrlChange: (url: string) => void;
}) {
  const [urlInput, setUrlInput] = useState(props.initialUrl);
  const [srcUrl, setSrcUrl] = useState(props.initialUrl);
  const [status, setStatus] = useState<BrowserStatus>(() => (props.initialUrl.trim() ? "loading" : "idle"));
  const [validationError, setValidationError] = useState<string>("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [history, setHistory] = useState<string[]>([props.initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const longLoadTimerRef = useRef<number | null>(null);
  const iframeKey = `${srcUrl}::${reloadNonce}`;

  const presets = useMemo(
    () => [
      { label: "Zillow", url: "https://www.zillow.com/" },
      { label: "Redfin", url: "https://www.redfin.com/" },
      { label: "Realtor.com", url: "https://www.realtor.com/" },
      { label: "Google", url: "https://www.google.com/" },
      { label: "Google Maps", url: "https://www.google.com/maps" },
    ],
    [],
  );

  useEffect(() => {
    setUrlInput(props.initialUrl);
    setSrcUrl(props.initialUrl);
    setHistory([props.initialUrl]);
    setHistoryIndex(0);
    setStatus(props.initialUrl.trim() ? "loading" : "idle");
  }, [props.initialUrl]);

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
      const next = [...sliced, result.url];
      return next;
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
    window.open(srcUrl, "_blank", "noopener,noreferrer");
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(srcUrl);
    } catch {}
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">In-App Browser</CardTitle>
            <Badge variant={status === "maybe_blocked" ? "destructive" : status === "loaded" ? "default" : "secondary"}>
              {status === "idle" ? "Ready" : status === "loading" ? "Loading" : status === "loaded" ? "Loaded" : "Blocked?"}
            </Badge>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                onValueChange={(v) => {
                  setUrlInput(v);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Quick links" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.url} value={p.url}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1 min-w-[240px]">
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
                {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Navigate"}
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
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 h-[calc(100%-5.5rem)]">
        <div className="relative h-full w-full overflow-hidden rounded-md border bg-background">
          {!srcUrl.trim() ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Choose a quick link or enter a URL to start.</div>
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
      </CardContent>
    </Card>
  );
}
