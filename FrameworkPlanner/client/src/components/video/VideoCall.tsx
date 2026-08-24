"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Loader2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type VideoCallProps = {
  roomId: string;
  clientToken: string;
  participantName?: string;
  onLeave?: () => void;
  onError?: (error: Error) => void;
};

type CallStatus =
  | "initializing"
  | "connecting"
  | "connected"
  | "publishing"
  | "active"
  | "disconnecting"
  | "disconnected"
  | "error";

type RemoteStream = {
  key: string;
  participantId: string;
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
};

// ── SDK loader ─────────────────────────────────────────────────────────────

async function loadTelnyxVideo() {
  const mod = await import("@telnyx/video");
  if (typeof mod.initialize !== "function") {
    throw new Error(
      "Telnyx Video SDK loaded but 'initialize' not found. Available: " +
      Object.keys(mod).join(", ")
    );
  }
  return { initialize: mod.initialize };
}

// ── Component ──────────────────────────────────────────────────────────────

export function VideoCall({
  roomId,
  clientToken,
  participantName,
  onLeave,
  onError,
}: VideoCallProps) {
  const roomRef = useRef<any>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const localContainerRef = useRef<HTMLDivElement>(null);
  const remoteContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const [status, setStatus] = useState<CallStatus>("initializing");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(1);

  // Stable refs for callbacks to avoid stale closures
  const audioEnabledRef = useRef(audioEnabled);
  const videoEnabledRef = useRef(videoEnabled);
  audioEnabledRef.current = audioEnabled;
  videoEnabledRef.current = videoEnabled;

  // ── Render helpers ─────────────────────────────────────────────────────

  const renderLocalVideo = useCallback(() => {
    if (!localContainerRef.current || !roomRef.current) return;
    const container = localContainerRef.current;
    const streams = roomRef.current.getLocalStreams();
    const selfStream = streams?.["self"];
    if (!selfStream) return;

    container.innerHTML = "";
    if (selfStream.videoTrack) {
      const video = document.createElement("video");
      video.srcObject = new MediaStream([selfStream.videoTrack]);
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true; // Local playback muted to prevent feedback
      video.className = "w-full h-full object-cover";
      video.style.transform = "scaleX(-1)";
      container.appendChild(video);
    }
  }, []);

  const renderRemoteVideo = useCallback(
    (participantId: string, stream: RemoteStream) => {
      const container = remoteContainersRef.current.get(
        `${participantId}-${stream.key}`
      );
      if (!container) return;

      container.innerHTML = "";
      if (stream.videoTrack) {
        const video = document.createElement("video");
        video.srcObject = new MediaStream([stream.videoTrack]);
        video.autoplay = true;
        video.playsInline = true;
        video.className = "w-full h-full object-cover";
        container.appendChild(video);
      }
      // Render audio for remote streams
      if (stream.audioTrack) {
        const audio = document.createElement("audio");
        audio.srcObject = new MediaStream([stream.audioTrack]);
        audio.autoplay = true;
        container.appendChild(audio);
      }
    },
    []
  );

  // ── Connect ────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    try {
      setStatus("connecting");
      setError(null);

      const { initialize } = await loadTelnyxVideo();

      const room = await initialize({
        roomId,
        clientToken,
        context: JSON.stringify({ name: participantName || "CRM User" }),
      });

      roomRef.current = room;

      // Track event unsubscribers for cleanup
      const unsubs: Array<() => void> = [];

      // State changed — derive status from immutable state
      unsubs.push(
        room.on("state_changed", (state: any) => {
          const s = state?.status;
          if (s === "connected") setStatus("connected");
          else if (s === "disconnected") setStatus("disconnected");
          else if (s === "connecting") setStatus("connecting");
          else if (s === "disconnecting") setStatus("disconnecting");
        })
      );

      // Connected — publish local stream
      unsubs.push(
        room.on("connected", async () => {
          setStatus("publishing");
          try {
            await room.addStream("self");
            setStatus("active");
            // Render local video after publish
            setTimeout(renderLocalVideo, 500);
          } catch (e: any) {
            console.error("Failed to publish local stream:", e);
            setStatus("active"); // Still connected, just no local media
          }
        })
      );

      // Participant joined
      unsubs.push(
        room.on("participant_joined", (_pid: string, state: any) => {
          const participants = state?.participants || {};
          setParticipantCount(Object.keys(participants).length);
        })
      );

      // Participant left
      unsubs.push(
        room.on("participant_left", (_pid: string, state: any) => {
          const participants = state?.participants || {};
          setParticipantCount(
            Math.max(1, Object.keys(participants).length)
          );
          // Clean up remote streams for this participant
          setRemoteStreams((prev) =>
            prev.filter((s) => s.participantId !== _pid)
          );
        })
      );

      // Remote stream published — subscribe to it
      unsubs.push(
        room.on(
          "stream_published",
          async (participantId: string, key: string, state: any) => {
            // Skip local streams
            const localId = room.getLocalParticipant?.()?.id;
            if (participantId === localId) {
              // Re-render local video
              renderLocalVideo();
              return;
            }

            try {
              await room.addSubscription(participantId, key, {
                audio: true,
                video: true,
              });

              // Get the subscribed stream from state
              const streams = state?.streams || {};
              const streamEntry = Object.values(streams).find(
                (s: any) =>
                  s.participantId === participantId && s.key === key
              ) as any;

              if (streamEntry) {
                const remoteStream: RemoteStream = {
                  key: `${participantId}-${key}`,
                  participantId,
                  audioTrack: streamEntry.audioTrack,
                  videoTrack: streamEntry.videoTrack,
                  isAudioEnabled: streamEntry.isAudioEnabled,
                  isVideoEnabled: streamEntry.isVideoEnabled,
                };
                setRemoteStreams((prev) => [
                  ...prev.filter((s) => s.key !== remoteStream.key),
                  remoteStream,
                ]);
              }
            } catch (e) {
              console.error("Failed to subscribe to remote stream:", e);
            }
          }
        )
      );

      // Remote stream unpublished
      unsubs.push(
        room.on(
          "stream_unpublished",
          (participantId: string, key: string) => {
            setRemoteStreams((prev) =>
              prev.filter((s) => s.key !== `${participantId}-${key}`)
            );
          }
        )
      );

      unsubscribersRef.current = unsubs;
      await room.connect();
    } catch (e: any) {
      console.error("Video call connection failed:", e);
      setStatus("error");
      setError(e?.message || "Failed to connect to video room");
      onError?.(e);
    }
  }, [roomId, clientToken, participantName, onError, renderLocalVideo]);

  const disconnect = useCallback(async () => {
    for (const unsub of unsubscribersRef.current) { try { unsub(); } catch {} }
    unsubscribersRef.current = [];
    try { await roomRef.current?.disconnect(); } catch {}
    roomRef.current = null;
    if (localContainerRef.current) localContainerRef.current.innerHTML = "";
    remoteContainersRef.current.forEach((el) => { if (el) el.innerHTML = ""; });
    remoteContainersRef.current.clear();
    setRemoteStreams([]);
    setParticipantCount(1);
    setStatus("disconnected");
  }, []);

  const toggleAudio = useCallback(async () => {
    if (!roomRef.current) return;
    try {
      const newEnabled = !audioEnabledRef.current;
      const streams = roomRef.current.getLocalStreams();
      const selfStream = streams?.["self"];
      if (selfStream) {
        await roomRef.current.updateStream("self", {
          audio: newEnabled ? selfStream.audioTrack : undefined,
        });
      }
      setAudioEnabled(newEnabled);
    } catch (e) { console.error("Failed to toggle audio:", e); }
  }, []);

  const toggleVideo = useCallback(async () => {
    if (!roomRef.current) return;
    try {
      const newEnabled = !videoEnabledRef.current;
      const streams = roomRef.current.getLocalStreams();
      const selfStream = streams?.["self"];
      if (selfStream) {
        await roomRef.current.updateStream("self", {
          video: newEnabled ? selfStream.videoTrack : undefined,
        });
      }
      setVideoEnabled(newEnabled);
    } catch (e) { console.error("Failed to toggle video:", e); }
  }, []);

  const leave = useCallback(async () => {
    setStatus("disconnecting");
    await disconnect();
    onLeave?.();
  }, [disconnect, onLeave]);

  useEffect(() => {
    return () => {
      for (const unsub of unsubscribersRef.current) { try { unsub(); } catch {} }
      unsubscribersRef.current = [];
      try { roomRef.current?.disconnect(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (roomId && clientToken && status === "initializing") connect();
  }, [roomId, clientToken, status, connect]);

  useEffect(() => {
    for (const stream of remoteStreams) renderRemoteVideo(stream.participantId, stream);
  }, [remoteStreams, renderRemoteVideo]);

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
        <div className="flex items-center gap-2 text-white text-sm">
          <Video className="h-4 w-4" />
          <span className="font-medium">Video Meeting</span>
          {participantCount > 1 && (
            <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              {participantCount} participants
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          {(status === "initializing" || status === "connecting") && <><Loader2 className="h-3 w-3 animate-spin" /> Connecting...</>}
          {status === "publishing" && <><Loader2 className="h-3 w-3 animate-spin" /> Publishing...</>}
          {status === "active" && <span className="text-green-400">● Live</span>}
          {status === "disconnecting" && <><Loader2 className="h-3 w-3 animate-spin" /> Leaving...</>}
          {status === "error" && <span className="text-red-400">Error</span>}
        </div>
      </div>
      <div className="flex-1 p-2 grid gap-2" style={{ gridTemplateColumns: remoteStreams.length === 0 ? "1fr" : remoteStreams.length <= 3 ? "1fr 1fr" : "1fr 1fr 1fr", gridTemplateRows: remoteStreams.length <= 1 ? "1fr" : "1fr 1fr" }}>
        {remoteStreams.map((stream) => (
          <div key={stream.key} ref={(el) => { if (el) { remoteContainersRef.current.set(stream.key, el); renderRemoteVideo(stream.participantId, stream); } }} className="relative bg-gray-800 rounded-md overflow-hidden">
            <div className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1.5 py-0.5 rounded">Participant</div>
            {!stream.isVideoEnabled && <div className="absolute inset-0 flex items-center justify-center bg-gray-700"><VideoOff className="h-8 w-8 text-gray-400" /></div>}
          </div>
        ))}
        <div className="relative bg-gray-800 rounded-md overflow-hidden">
          <div ref={localContainerRef} className="w-full h-full" />
          <div className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1.5 py-0.5 rounded">You</div>
          {!videoEnabled && <div className="absolute inset-0 flex items-center justify-center bg-gray-700"><VideoOff className="h-8 w-8 text-gray-400" /></div>}
        </div>
      </div>
      {error && <div className="px-4 py-2 bg-red-900/30 border-t border-red-800 text-red-300 text-sm">{error}</div>}
      <div className="flex items-center justify-center gap-3 px-4 py-3 bg-gray-800">
        <Button size="sm" variant={audioEnabled ? "secondary" : "destructive"} onClick={toggleAudio} disabled={status !== "active"} className="h-10 w-10 rounded-full p-0" title={audioEnabled ? "Mute" : "Unmute"}>
          {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant={videoEnabled ? "secondary" : "destructive"} onClick={toggleVideo} disabled={status !== "active"} className="h-10 w-10 rounded-full p-0" title={videoEnabled ? "Cam off" : "Cam on"}>
          {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="destructive" onClick={leave} disabled={status === "disconnecting" || status === "disconnected"} className="h-10 w-10 rounded-full p-0 bg-red-600 hover:bg-red-700" title="Leave call">
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
