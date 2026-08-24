import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { QueryError } from "@/components/ui/query-state";
import { useMemo, useState } from "react";

interface Message {
  id: number;
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

  const { data: conversations = [], isLoading: convLoading, isError: convError, refetch: refetchConvs } = useQuery<Conversation[]>({
    queryKey: ["/api/messages/conversations"],
    enabled: !!user?.id,
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
  });

  const sendMutation = useMutation({
    mutationFn: async (recipientUserId: number) => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientUserId, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send message");
      return data;
    },
    onSuccess: () => {
      setBody("");
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

  const userName = (id: number) => {
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
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{userName(withUserId)}</h2>
                  <Badge variant="outline">Internal</Badge>
                </div>
                <div className="space-y-2 max-h-[55vh] overflow-y-auto rounded-md border p-3 bg-muted/30">
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
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                            <p>{m.body}</p>
                            <p className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {new Date(m.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
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
    </Layout>
  );
}
