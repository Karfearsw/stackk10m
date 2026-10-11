import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Loader2, Users, Paperclip, X, Video, ExternalLink, Download, Clapperboard } from "lucide-react";
import { MediaUploader } from "@/components/media/MediaUploader";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatBytes, isVideoAsset, isImageAsset, mediaPreviewUrl, type MediaAsset } from "@/lib/media";
import { JitsiMeetingDialog } from "@/components/video/JitsiMeetingDialog";
import { newTeamMeetingRoom } from "@/lib/jitsi";
import { VideoMessageRecorder } from "@/components/video/VideoMessageRecorder";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { QueryError } from "@/components/ui/query-state";
import { useMemo, useState } from "react";

interface Message {
  id: number;
  mediaIds?: number[];
  media?: MediaAsset[];
  senderUserId: number;
  recipientUserId: number;
  body: string;
  relatedType: string | null;
  relatedId: number | null;
  readAt: string | null;
  createdAt: string;
}

interface Conversation {
  counterpart_id: number;
  last_message: string;
  last_at: string;
  unread_count: number;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [withUserId, setWithUserId] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<MediaAsset[]>([]);
  const [lightboxAsset, setLightboxAsset] = useState<MediaAsset | null>(null);
  // Unified video: free Jitsi meeting + in-chat video messages, launched from here.
  const [jitsiOpen, setJitsiOpen] = useState(false);
  const [jitsiRoomName, setJitsiRoomName] = useState("");
  const [jitsiTitle, setJitsiTitle] = useState("");
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);

  const { data: conversations = [], isLoading: convLoading, isError: convError, refetch: refetchConvs } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!user?.id,
  });

  const { data: messages = [], isLoading: msgLoading, isError: msgError, refetch: refetchMsgs } = useQuery<Message[]>({
    queryKey: ["/api/messages", withUserId],
    queryFn: async () => {
      const res = await fetch(`/api/messages?withUserId=${withUserId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!user?.id && withUserId != null,
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: async (recipientUserId: number) => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientUserId, body, mediaIds: pendingMedia.map((a) => a.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send message");
      return data;
    },
    onSuccess: () => {
      setBody("");
      setPendingMedia([]);
      queryClient.invalidateQueries({ queryKey: ["/api/messages", withUserId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to send message"),
  });

  const readMutation = useMutation({
    mutationFn: async (recipientUserId: number) => {
      const res = await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ withUserId: recipientUserId }),
      });
      if (!res.ok) throw new Error("Failed to mark as read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
  });

  const openThread = (recipientUserId: number) => {
    setWithUserId(recipientUserId);
    readMutation.mutate(recipientUserId);
  };

  const userName = (id: number | undefined) => {
    const u = users.find((x: any) => Number(x.id) === Number(id));
    if (!u) return `User #${id}`;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
    return name || u.email || `User #${id}`;
  };

  const sortedMessages = useMemo(() => [...messages].sort((a, b) => a.id - b.id), [messages]);
  const otherUsers = useMemo(
    () => users.filter((u: any) => Number(u.id) !== Number(user?.id)),
    [users, user?.id],
  );

  // Start a free team video meeting (Jitsi — no account, no paid provider).
  // The join link is also posted into the thread so the teammate can join
  // from the chat history on any device.
  const startVideoMeeting = async () => {
    if (withUserId == null || meetingBusy) return;
    setMeetingBusy(true);
    try {
      const { roomName, joinUrl } = newTeamMeetingRoom();
      const title = `Video meeting: ${userName(user?.id)} & ${userName(withUserId)}`;
      // Post the invite into the thread first, so it lands even if the
      // meeting dialog is closed right away.
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recipientUserId: withUserId,
          body: `🎥 Started a video meeting — join here: ${joinUrl}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Could not post the meeting invite");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/messages", withUserId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      setJitsiRoomName(roomName);
      setJitsiTitle(title);
      setJitsiOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to start video meeting");
    } finally {
      setMeetingBusy(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">Internal Messages</h1>
        <p className="text-muted-foreground">Team messages — these stay inside the CRM and are separate from SMS.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <MessageSquare className="h-4 w-4" /> Conversations
            </div>
            {convLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : convError ? (
              <div className="py-2">
                <QueryError message="Couldn't load conversations." onRetry={() => refetchConvs()} />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No conversations yet. Pick a team member to start.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.counterpart_id}
                  onClick={() => openThread(c.counterpart_id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    withUserId === c.counterpart_id ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{userName(c.counterpart_id)}</span>
                    {Number(c.unread_count) > 0 && <Badge variant="default">{c.unread_count}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">{c.last_message}</p>
                </button>
              ))
            )}
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Users className="h-3 w-3" /> New conversation</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {otherUsers.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => openThread(u.id)}
                    className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted"
                  >
                    {userName(u.id)}
                  </button>
                ))}
                {otherUsers.length === 0 && <p className="text-xs text-muted-foreground">No other team members found.</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="p-4 space-y-4">
            {withUserId == null ? (
              <div className="text-center py-16 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Select a conversation to view messages.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold truncate">{userName(withUserId)}</h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">Internal</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startVideoMeeting}
                      disabled={meetingBusy}
                      title={`Start video meeting with ${userName(withUserId)} (free)`}
                    >
                      {meetingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                      <span className="hidden sm:inline ml-1">Video meeting</span>
                    </Button>
                  </div>
                </div>
                <div data-chat-thread className="space-y-2 max-h-[55vh] overflow-y-auto overflow-x-hidden rounded-md border p-3 bg-muted/30">
                  {msgLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : msgError ? (
                    <div className="py-2">
                      <QueryError message="Couldn't load this thread." onRetry={() => refetchMsgs()} />
                    </div>
                  ) : sortedMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello!</p>
                  ) : (
                    sortedMessages.map((m) => {
                      const mine = Number(m.senderUserId) === Number(user?.id);
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} min-w-0`}>
                          <div data-chat-bubble className={`min-w-0 max-w-[85%] sm:max-w-[75%] rounded-lg px-3 py-2 text-sm break-words [overflow-wrap:anywhere] ${mine ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                            {Array.isArray(m.media) && m.media.length > 0 && (
                              <div className="mb-1.5 flex flex-col gap-2 min-w-0">
                                {m.media.map((asset) => (
                                  isVideoAsset(asset) ? (
                                    <div key={asset.id} className="w-full max-w-[280px] min-w-0">
                                      <video
                                        controls
                                        preload="metadata"
                                        src={mediaPreviewUrl(asset.id)}
                                        className="w-full rounded-md border bg-black max-h-48"
                                      />
                                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground min-w-0">
                                        <span className="truncate" title={asset.originalFilename}>{asset.originalFilename}</span>
                                        {asset.durationSeconds != null && (
                                          <span className="shrink-0">{Math.round(asset.durationSeconds)}s</span>
                                        )}
                                      </div>
                                      <a href={`/api/media/${asset.id}/download`} download className="text-[10px] underline inline-flex items-center gap-0.5">
                                        <Download className="h-3 w-3" /> Download ({formatBytes(asset.fileSizeBytes)})
                                      </a>
                                    </div>
                                  ) : isImageAsset(asset) ? (
                                    <div key={asset.id} className="min-w-0">
                                      <button
                                        type="button"
                                        onClick={() => setLightboxAsset(asset)}
                                        className="block max-w-[280px] w-full overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-90"
                                        title={`${asset.originalFilename} — click to view full size`}
                                        aria-label={`Open image ${asset.originalFilename}`}
                                      >
                                        <img
                                          src={mediaPreviewUrl(asset.id)}
                                          alt={asset.originalFilename}
                                          className="w-full h-auto max-h-56 object-contain"
                                          loading="lazy"
                                        />
                                      </button>
                                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground min-w-0">
                                        <span className="truncate" title={asset.originalFilename}>{asset.originalFilename}</span>
                                        <span className="shrink-0">({formatBytes(asset.fileSizeBytes)})</span>
                                        <button
                                          type="button"
                                          onClick={() => setLightboxAsset(asset)}
                                          className="shrink-0 underline inline-flex items-center gap-0.5 hover:opacity-80"
                                        >
                                          <ExternalLink className="h-3 w-3" /> View full size
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div key={asset.id} className="min-w-0">
                                      <a
                                        href={`/api/media/${asset.id}/download`}
                                        download
                                        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs hover:bg-muted max-w-full"
                                        title={asset.originalFilename}
                                      >
                                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{asset.originalFilename}</span>
                                        <span className="shrink-0 text-muted-foreground">({formatBytes(asset.fileSizeBytes)})</span>
                                      </a>
                                    </div>
                                  )
                                ))}
                              </div>
                            )}
                            {m.body ? <p className="break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{m.body}</p> : null}
                            <p className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {new Date(m.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {pendingMedia.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pendingMedia.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs" title={a.originalFilename}>
                        <span className="max-w-[140px] truncate">{a.originalFilename}</span>
                        <span className="text-muted-foreground">{formatBytes(a.fileSizeBytes)}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${a.originalFilename}`}
                          onClick={() => setPendingMedia((prev) => prev.filter((x) => x.id !== a.id))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <MediaUploader
                      entityType="internal_message"
                      deferAttach
                      compact
                      multiple
                      maxFiles={5}
                      label="Attach images or video"
                      onUploaded={(asset) => setPendingMedia((prev) => [...prev, asset])}
                      onError={(m) => toast.error(m)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRecorderOpen(true)}
                    title="Record a video message with your camera"
                    className="shrink-0"
                  >
                    <Clapperboard className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">Record video</span>
                  </Button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (body.trim() && withUserId != null) sendMutation.mutate(withUserId);
                  }}
                  className="flex gap-2"
                >
                  <Input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Type a message…"
                    data-testid="message-input"
                  />
                  <Button type="submit" disabled={!body.trim() || sendMutation.isPending} data-testid="send-message">
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={lightboxAsset != null} onOpenChange={(open) => { if (!open) setLightboxAsset(null); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          {lightboxAsset && (
            <>
              <img
                src={mediaPreviewUrl(lightboxAsset.id)}
                alt={lightboxAsset.originalFilename}
                className="max-h-[75vh] w-full rounded-md object-contain bg-black"
              />
              <div className="flex items-center justify-between px-1 pt-1 text-xs text-muted-foreground">
                <span className="truncate" title={lightboxAsset.originalFilename}>{lightboxAsset.originalFilename}</span>
                <a
                  href={`/api/media/${lightboxAsset.id}/download`}
                  download
                  className="shrink-0 underline inline-flex items-center gap-1 ml-2"
                >
                  <Download className="h-3 w-3" /> Download ({formatBytes(lightboxAsset.fileSizeBytes)})
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Unified team video meeting (free Jitsi) + in-chat video messages. */}
      <JitsiMeetingDialog
        open={jitsiOpen}
        onOpenChange={setJitsiOpen}
        roomName={jitsiRoomName}
        meetingTitle={jitsiTitle}
        displayName={user ? userName(user.id) : undefined}
      />
      <VideoMessageRecorder
        open={recorderOpen}
        onOpenChange={setRecorderOpen}
        onRecorded={(asset) => {
          setPendingMedia((prev) => [...prev, asset]);
          toast.success("Video message ready — press send to deliver it.");
        }}
        onError={(m) => toast.error(m)}
      />
    </Layout>
  );
}
