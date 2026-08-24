import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, ExternalLink, Square, Loader2, Copy, Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { VideoCallDialog } from "./VideoCallDialog";

type MeetingCardProps = {
  room: {
    id?: number;
    room_id: string;
    name: string;
    status: string;
    created_at: string;
    max_participants?: number;
    created_by?: number;
  };
  currentUserId?: number;
  onEnd?: () => void;
};

export function MeetingCard({ room, currentUserId, onEnd }: MeetingCardProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [videoCallOpen, setVideoCallOpen] = useState(false);
  const isActive = room.status === "active";

  const joinMeeting = useMutation({
    mutationFn: async () => {
      // Open the video call dialog — it handles token fetching internally
      return { opened: true };
    },
    onSuccess: () => {
      setVideoCallOpen(true);
    },
  });

  const endMeeting = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/video/rooms/${room.room_id}/end`);
      return await res.json();
    },
    onSuccess: () => {
      toast.success("Meeting ended");
      queryClient.invalidateQueries({ queryKey: ["/api/video/rooms"] });
      onEnd?.();
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to end meeting");
    },
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const copyRoomId = async () => {
    await navigator.clipboard.writeText(room.room_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createdDate = new Date(room.created_at);
  const isCreator = currentUserId && room.created_by === currentUserId;

  const participantName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.email || `User ${currentUser.id}`
    : undefined;

  return (
    <>
    <div className={`rounded-md border p-3 ${isActive ? "border-green-200 bg-green-50/50" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium truncate">{room.name}</span>
            <Badge variant={isActive ? "default" : "secondary"} className="text-xs shrink-0">
              {room.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Created {createdDate.toLocaleDateString()} at {createdDate.toLocaleTimeString()}
            {room.max_participants ? ` · Up to ${room.max_participants} participants` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              onClick={() => joinMeeting.mutate()}
              disabled={joinMeeting.isPending}
              data-testid={`button-join-meeting-${room.room_id}`}
            >
              {joinMeeting.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ExternalLink className="h-3 w-3 mr-1" />
              )}
              Join
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={copyRoomId}
            title="Copy Room ID"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
          {isActive && isCreator && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => endMeeting.mutate()}
              disabled={endMeeting.isPending}
              data-testid={`button-end-meeting-${room.room_id}`}
            >
              <Square className="h-3 w-3 mr-1" />
              End
            </Button>
          )}
        </div>
      </div>
    </div>

    {/* Video Call Dialog */}
    <VideoCallDialog
      open={videoCallOpen}
      onOpenChange={setVideoCallOpen}
      roomId={room.room_id}
      roomName={room.name}
      participantName={participantName}
    />
    </>
  );
}
