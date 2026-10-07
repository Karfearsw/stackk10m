import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { investorApi, InvestorApiError } from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";

interface Thread {
  dealId: number | null;
  address: string | null;
  messages: { id: number; direction: string | null; content: string; createdAt: string | null; mine: boolean }[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new InvestorApiError(res.status, body?.code || "request_failed", body?.message || "Request failed");
  return body as T;
}

export function MessagesPage() {
  return (
    <RequireInvestor>
      <MessagesBody />
    </RequireInvestor>
  );
}

function MessagesBody() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const dealParam = (() => {
    const m = /[?&]deal=(\d+)/.exec(location);
    return m ? Number(m[1]) : null;
  })();

  const load = async () => {
    try {
      const r = await req<{ threads: Thread[] }>("/api/investor/messages");
      setThreads(r.threads);
      if (dealParam && !active) {
        const idx = r.threads.findIndex((t) => t.dealId === dealParam);
        if (idx >= 0) setActive(idx);
      }
      if (r.threads.length && active === null && !dealParam) setActive(0);
    } catch (e) {
      toast({ title: "Couldn't load messages", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    const thread = active !== null ? threads[active] : null;
    if (!thread?.dealId || !draft.trim()) return;
    setSending(true);
    try {
      await req(`/api/investor/deals/${thread.dealId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      setDraft("");
      await load();
    } catch (e) {
      toast({ title: "Message failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const thread = active !== null ? threads[active] : null;

  return (
    <InvestorPage title="Messages" subtitle="Threads with the dispo team, per deal.">
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" /></div>
      ) : threads.length === 0 ? (
        <Card className="border-white/10 bg-[#121212]">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MessageCircle className="h-10 w-10 text-neutral-700" />
            <p className="text-neutral-400">No conversations yet. Save a deal or make an offer and a thread opens here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-2">
            {threads.map((t, i) => (
              <button
                key={`${t.dealId}-${i}`}
                onClick={() => setActive(i)}
                className={cn("rounded-lg border px-4 py-3 text-left text-sm",
                  i === active ? "border-[#D4AF37] bg-[#D4AF37]/10 text-white" : "border-white/10 text-neutral-400 hover:border-white/30")}
              >
                <div className="font-medium">{t.address ?? "General"}</div>
                <div className="mt-0.5 truncate text-xs text-neutral-500">
                  {t.messages[t.messages.length - 1]?.content.slice(0, 60) ?? "No messages"}
                </div>
              </button>
            ))}
          </div>
          <Card className="border-white/10 bg-[#121212]">
            <CardContent className="flex h-[480px] flex-col p-4">
              <div className="border-b border-white/10 pb-3">
                <div className="font-medium text-white">{thread?.address ?? "Select a thread"}</div>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-4">
                {thread?.messages.map((m) => (
                  <div key={m.id} className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    m.mine ? "self-end bg-[#D4AF37] text-black" : "self-start bg-white/10 text-white")}>
                    {m.content}
                    {m.createdAt && <div className={cn("mt-1 text-[10px]", m.mine ? "text-black/60" : "text-neutral-500")}>{new Date(m.createdAt).toLocaleString()}</div>}
                  </div>
                ))}
              </div>
              {thread?.dealId && (
                <div className="flex gap-2 border-t border-white/10 pt-3">
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write to the dispo team…" className="border-white/10 bg-black text-white" rows={2} />
                  <Button onClick={send} disabled={sending || !draft.trim()} className="bg-[#D4AF37] text-black hover:bg-[#c19b2e]">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </InvestorPage>
  );
}
