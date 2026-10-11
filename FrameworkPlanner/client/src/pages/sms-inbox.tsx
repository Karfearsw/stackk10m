import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QueryError } from "@/components/ui/query-state";
import { useState, useRef, useEffect } from "react";

interface SmsConversation {
  phone: string;
  direction: string;
  last_body: string;
  last_at: string;
  lead_id: number | null;
  buyer_id: number | null;
  message_count: number;
  inbound_count: number;
  lead_name: string | null;
}

interface SmsMessage {
  id: number;
  direction: string;
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  created_at: string;
  lead_id: number | null;
  buyer_id: number | null;
}

function formatPhone(p: string): string {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

export default function SmsInboxPage() {
  const queryClient = useQueryClient();
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading, error } = useQuery<SmsConversation[]>({
    queryKey: ["/api/sms/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/sms/conversations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load SMS conversations");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: messages, isLoading: msgsLoading } = useQuery<SmsMessage[]>({
    queryKey: ["/api/sms/conversations", activePhone, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/sms/conversations/${encodeURIComponent(activePhone || "")}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!activePhone,
    refetchInterval: 8000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async ({ to, body }: { to: string; body: string }) => {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to, body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send SMS");
      }
      return res.json();
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/sms/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms/conversations", activePhone, "messages"] });
      toast.success("SMS sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSend = () => {
    const body = draft.trim();
    if (!body || !activePhone || sendMutation.isPending) return;
    sendMutation.mutate({ to: activePhone, body });
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">SMS Inbox</h1>
          <Badge variant="outline">Telnyx</Badge>
        </div>
        <p className="text-muted-foreground mb-4 text-sm">
          Inbound and outbound text messages on your Telnyx number. Replies arrive here automatically once the messaging webhook is configured.
        </p>

        {error && <QueryError message={(error as Error).message} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Conversation list */}
          <Card className="md:col-span-1">
            <CardContent className="p-2 max-h-[70vh] overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoading && (!conversations || conversations.length === 0) && (
                <div className="text-center p-8 text-muted-foreground text-sm">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No SMS conversations yet.<br />
                  Inbound messages will appear here once the Telnyx messaging webhook is configured.
                </div>
              )}
              {(conversations || []).map((c) => (
                <button
                  key={c.phone}
                  onClick={() => setActivePhone(c.phone)}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                    activePhone === c.phone ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {c.lead_name || formatPhone(c.phone)}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(c.last_at)}</span>
                  </div>
                  {!c.lead_name && <div className="text-xs text-muted-foreground">{formatPhone(c.phone)}</div>}
                  <div className="text-sm text-muted-foreground truncate mt-1">{c.last_body}</div>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="secondary" className="text-xs">{c.message_count} msgs</Badge>
                    {c.lead_id && <Badge variant="outline" className="text-xs">Lead #{c.lead_id}</Badge>}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Message thread */}
          <Card className="md:col-span-2">
            <CardContent className="p-4 flex flex-col h-[70vh]">
              {!activePhone ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Select a conversation to view messages.
                </div>
              ) : (
                <>
                  <div className="border-b pb-2 mb-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{formatPhone(activePhone)}</div>
                      <div className="text-xs text-muted-foreground">
                        {messages?.length || 0} messages
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                    {msgsLoading && (
                      <div className="flex justify-center p-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {(messages || []).map((m) => {
                      const statusColor =
                        m.status === "delivered" ? "text-green-500" :
                        m.status === "failed" ? "text-red-500" :
                        m.status === "sent" ? "text-blue-400" :
                        "text-muted-foreground";
                      const statusLabel =
                        m.status === "delivered" ? "✓✓ Delivered" :
                        m.status === "failed" ? "✗ Failed" :
                        m.status === "sent" ? "✓ Sent" :
                        m.status === "received" ? "Received" :
                        m.status;
                      return (
                      <div
                        key={m.id}
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          m.direction === "inbound"
                            ? "bg-muted mr-auto"
                            : "bg-primary text-primary-foreground ml-auto"
                        }`}
                      >
                        <div>{m.body}</div>
                        <div className={`text-xs mt-1 flex items-center gap-1 ${m.direction === "inbound" ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                          <span>{formatTime(m.created_at)}</span>
                          <span>·</span>
                          <span className={m.direction === "outbound" ? statusColor : ""}>{statusLabel}</span>
                        </div>
                      </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a message…"
                      className="flex-1 min-h-[44px] max-h-[120px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <Button onClick={handleSend} disabled={!draft.trim() || sendMutation.isPending}>
                      {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
