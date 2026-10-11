"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JITSI_DOMAIN, JITSI_SCRIPT_URL } from "@/lib/jitsi";

/**
 * Free team video meeting via Jitsi Meet (meet.jit.si).
 *
 * No account, no API key, no backend room provisioning — the room name itself
 * is the meeting. Anyone with the link joins from a browser. This is the
 * cost-free counterpart to the Telnyx Video flow (which needs a funded
 * Telnyx account) and keeps video meetings unified inside the team chat.
 */

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: Record<string, any>,
    ) => { dispose: () => void; executeCommand: (cmd: string, ...args: any[]) => void };
  }
}

function loadJitsiScript(): Promise<void> {
  if (typeof window !== "undefined" && window.JitsiMeetExternalAPI) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${JITSI_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Jitsi script failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = JITSI_SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Jitsi Meet. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

type JitsiMeetingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomName: string;
  meetingTitle: string;
  displayName?: string;
};

export function JitsiMeetingDialog({
  open,
  onOpenChange,
  roomName,
  meetingTitle,
  displayName,
}: JitsiMeetingDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ dispose: () => void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    setError(null);

    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        containerRef.current.innerHTML = "";
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: displayName || "Team member" },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          },
        });
        apiRef.current = api;
        setStatus("ready");
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.message || "Failed to start the meeting");
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      try { apiRef.current?.dispose(); } catch {}
      apiRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [open, roomName, displayName]);

  const joinUrl = `https://${JITSI_DOMAIN}/${roomName}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center justify-between gap-2 text-base">
            <span className="truncate">{meetingTitle}</span>
            <a
              href={joinUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground underline"
              title="Open this meeting in a new tab"
            >
              <ExternalLink className="h-3 w-3" /> Open in new tab
            </a>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 relative bg-black">
          <div ref={containerRef} className="absolute inset-0" />
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Starting your meeting…</p>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" asChild>
                <a href={joinUrl} target="_blank" rel="noreferrer">
                  Join in browser instead <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </div>
          )}
        </div>
        <p className="px-4 py-2 text-[11px] text-muted-foreground shrink-0 border-t">
          Free meeting via Jitsi Meet — share the link from the chat thread so teammates can join.
        </p>
      </DialogContent>
    </Dialog>
  );
}
