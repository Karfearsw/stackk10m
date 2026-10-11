"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Video, Square, RotateCcw, Send, AlertCircle } from "lucide-react";
import { uploadMediaFile } from "@/lib/media-upload";
import type { MediaAsset } from "@/lib/media";

/**
 * In-chat video message recorder.
 *
 * Records a short video message with the device camera (MediaRecorder API —
 * no libraries, no paid services), uploads it through the standard media
 * pipeline, and hands the asset back so the chat can attach + send it like
 * any other video. Rendered video messages play inline in the thread.
 */

const MAX_SECONDS = 120;

type Phase = "idle" | "preview" | "recording" | "recorded" | "uploading" | "error";

type VideoMessageRecorderProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (asset: MediaAsset) => void;
  onError?: (message: string) => void;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch {}
  }
  return "";
}

export function VideoMessageRecorder({ open, onOpenChange, onRecorded, onError }: VideoMessageRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startPreview = useCallback(async () => {
    setPhase("preview");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      const msg = e?.name === "NotAllowedError"
        ? "Camera/mic access was denied. Allow access in your browser and try again."
        : "Could not access the camera. Make sure no other app is using it.";
      setError(msg);
      setPhase("error");
      onError?.(msg);
    }
  }, [onError]);

  const reset = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    try { recorderRef.current?.state !== "inactive" && recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    chunksRef.current = [];
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setElapsed(0);
    setError(null);
  }, [recordedUrl]);

  // Open → start camera preview. Close → full cleanup.
  useEffect(() => {
    if (open) {
      reset();
      startPreview();
    } else {
      reset();
      stopStream();
      setPhase("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    reset();
    stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    if (!mimeType) {
      const msg = "Video recording isn't supported in this browser.";
      setError(msg); setPhase("error"); onError?.(msg);
      return;
    }
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setRecordedUrl(url);
      setPhase("recorded");
    };
    rec.start(250);
    recorderRef.current = rec;
    setElapsed(0);
    setPhase("recording");
    timerRef.current = window.setInterval(() => {
      setElapsed((s) => {
        if (s + 1 >= MAX_SECONDS) {
          try { rec.stop(); } catch {}
          if (timerRef.current) window.clearInterval(timerRef.current);
        }
        return s + 1;
      });
    }, 1000);
  }, [onError]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    try { recorderRef.current?.stop(); } catch {}
  }, []);

  const sendRecording = useCallback(async () => {
    if (!recordedBlob) return;
    setPhase("uploading");
    try {
      const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([recordedBlob], `video-message-${Date.now()}.${ext}`, { type: recordedBlob.type });
      const asset = await uploadMediaFile(file, {});
      onRecorded(asset);
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || "Upload failed";
      setError(msg);
      setPhase("error");
      onError?.(msg);
    }
  }, [recordedBlob, onRecorded, onOpenChange, onError]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Video className="h-4 w-4" /> Record video message
          </DialogTitle>
        </DialogHeader>

        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          {phase === "recorded" && recordedUrl ? (
            <video ref={playbackRef} src={recordedUrl} controls playsInline className="h-full w-full object-contain" />
          ) : (
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover -scale-x-100" />
          )}
          {phase === "recording" && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              REC {fmt(elapsed)} / {fmt(MAX_SECONDS)}
            </div>
          )}
          {(phase === "idle" || phase === "uploading") && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          )}
          {phase === "error" && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-white/80">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {phase === "recording" ? "Tap stop when you're done." : "Up to 2 minutes. It sends like any video attachment."}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {phase === "preview" && (
              <Button onClick={startRecording} size="sm">
                <Video className="h-4 w-4 mr-1" /> Record
              </Button>
            )}
            {phase === "recording" && (
              <Button onClick={stopRecording} size="sm" variant="destructive">
                <Square className="h-4 w-4 mr-1" /> Stop
              </Button>
            )}
            {phase === "recorded" && (
              <>
                <Button onClick={() => { reset(); startPreview(); }} size="sm" variant="outline">
                  <RotateCcw className="h-4 w-4 mr-1" /> Re-record
                </Button>
                <Button onClick={sendRecording} size="sm">
                  <Send className="h-4 w-4 mr-1" /> Send
                </Button>
              </>
            )}
            {phase === "uploading" && (
              <Button size="sm" disabled>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
