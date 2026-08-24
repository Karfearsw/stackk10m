"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Video, Loader2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { VideoCall } from "./VideoCall";
import { useQuery } from "@tanstack/react-query";

type VideoCallDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  participantName?: string;
};

type JoinState = "idle" | "fetching_token" | "ready" | "error";

export function VideoCallDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  participantName,
}: VideoCallDialogProps) {
  const [joinState, setJoinState] = useState<JoinState>("idle");
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if video feature is enabled
  const { data: videoHealth } = useQuery<any>({
    queryKey: ["/api/video/health"],
    staleTime: 60000,
  });
  const videoEnabled = videoHealth?.configured && videoHealth?.reachable;

  // Fetch join token and start the call
  const joinCall = useCallback(async () => {
    setJoinState("fetching_token");
    setError(null);
    try {
      const res = await apiRequest(
        "GET",
        `/api/video/rooms/${encodeURIComponent(roomId)}/join${participantName ? `?identity=${encodeURIComponent(participantName)}` : ""}`,
      );
      const data = await res.json();
      if (!data?.token) {
        throw new Error("No join token received");
      }
      setClientToken(data.token);
      setJoinState("ready");
    } catch (e: any) {
      setJoinState("error");
      setError(e?.message || "Failed to get join token");
    }
  }, [roomId, participantName]);

  // Handle leaving the call
  const handleLeave = useCallback(() => {
    setClientToken(null);
    setJoinState("idle");
    setError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  // Handle errors from VideoCall
  const handleError = useCallback((e: Error) => {
    setJoinState("error");
    setError(e.message);
  }, []);

  // Reset state when dialog closes
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setClientToken(null);
        setJoinState("idle");
        setError(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {roomName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 h-full min-h-0">
          {joinState === "idle" && !videoEnabled && (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <div className="text-center">
                <h3 className="font-medium text-lg">Video Meetings Not Enabled</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {videoHealth?.blocker || "Video meetings are not configured. Contact your administrator to enable this feature."}
                </p>
              </div>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          )}

          {joinState === "idle" && videoEnabled && (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Video className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-lg">Ready to join?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your camera and microphone will be activated when you join.
                </p>
              </div>
              <Button
                onClick={joinCall}
                className="bg-primary text-white hover:bg-primary/90"
                data-testid="button-join-video-call"
              >
                <Video className="h-4 w-4 mr-2" />
                Join Meeting
              </Button>
            </div>
          )}

          {joinState === "fetching_token" && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Preparing your video room…
              </p>
            </div>
          )}

          {joinState === "error" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div className="text-center">
                <h3 className="font-medium text-lg">Connection Error</h3>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button onClick={joinCall}>Retry</Button>
              </div>
            </div>
          )}

          {joinState === "ready" && clientToken && (
            <VideoCall
              roomId={roomId}
              clientToken={clientToken}
              participantName={participantName}
              onLeave={handleLeave}
              onError={handleError}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
