import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, PhoneOff, Hash, Asterisk, Plus, Search, Clock, Voicemail, Mic, MicOff, Pause, Play } from "lucide-react";
import { useSignalWire } from "@/hooks/useSignalWire";

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits; // default to US
  return digits;
}

const KEYS = ["1","2","3","4","5","6","7","8","9","*","0","#"];

export default function Dialer() {
  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<"idle"|"dialing"|"ringing"|"connected"|"ended"|"failed">("idle");
  const [callId, setCallId] = useState<number | null>(null);
  const [startTs, setStartTs] = useState<number | null>(null);
  const timerRef = useRef<number>(0);
  const queryClient = useQueryClient();
  const { ready: signalWireReady, call: activeCall, makeCall, endCall: endSignalWireCall, toggleMute, toggleHold } = useSignalWire();
  const [, navigate] = useLocation();
  const historyInterval = useMemo(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return false as any;
    if (status === "connected") return 300;
    if (status === "ringing" || status === "dialing") return 1500;
    if (status === "idle" || status === "ended" || status === "failed") return 25000;
    return 10000;
  }, [status]);

  const { data: contacts = [] } = useQuery({
    queryKey: ["/api/telephony/contacts", ""],
    queryFn: async () => {
      const res = await fetch(`/api/telephony/contacts?query=`);
      if (!res.ok) throw new Error("Failed to fetch contacts");
      const json = await res.json();
      return json.items || [];
    },
  });

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["/api/telephony/history"],
    queryFn: async () => {
      const res = await fetch(`/api/telephony/history?limit=50`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    refetchInterval: historyInterval as any,
  });

  const createCall = useMutation({
    mutationFn: async ({ direction, number }: { direction: "outbound"|"inbound"; number: string }) => {
      // First create the call log
      const res = await fetch(`/api/telephony/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, number: String(number), status: "dialing", startedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const log = await res.json();
      
      // Then make the actual SignalWire call (connects if not ready)
      if (direction === "outbound") {
        try {
          await makeCall(number);
        } catch (error) {
          console.error("SignalWire call failed:", error);
          // Update call log to failed status
          await fetch(`/api/telephony/calls/${log.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "failed" }),
          });
          throw error;
        }
      }
      
      return log;
    },
    onSuccess: (log) => {
      setCallId(log.id);
      setStatus("dialing");
      setStartTs(Date.now());
      queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
    },
  });

  const endCall = useMutation({
    mutationFn: async ({ id, succeeded }: { id: number; succeeded: boolean }) => {
      // First end the SignalWire call
      if (activeCall) {
        try {
          await endSignalWireCall();
        } catch (error) {
          console.error("Failed to end SignalWire call:", error);
        }
      }
      
      const durationMs = startTs ? Date.now() - startTs : 0;
      const res = await fetch(`/api/telephony/calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: succeeded ? "ended" : "failed", durationMs }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      setStatus("ended");
      setCallId(null);
      setStartTs(null);
      queryClient.invalidateQueries({ queryKey: ["/api/telephony/history"] });
    },
  });

  useEffect(() => {
    let handle: any;
    if (status === "connected" && startTs) {
      handle = setInterval(() => {
        timerRef.current = Date.now() - startTs;
      }, 200);
    }
    return () => handle && clearInterval(handle);
  }, [status, startTs]);

  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.state === "ringing") setStatus("ringing");
    if (activeCall.state === "active") setStatus("connected");
    if (activeCall.state === "finished") setStatus("ended");
  }, [activeCall?.state]);

  const formatted = useMemo(() => formatE164(number), [number]);

  return (
    <Layout>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dialer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label htmlFor="dialer-number">Phone Number</Label>
              <div className="flex gap-2 items-center">
                <Input id="dialer-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter number" aria-label="Dialer number input" />
                <Button variant="secondary" onClick={() => setNumber(prev => prev + "+")} aria-label="Add plus"> <Plus className="w-4 h-4" /> </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3" role="group" aria-label="Dialer keypad">
                {KEYS.map(k => (
                  <Button key={k} variant="outline" className="h-12 text-xl" onClick={() => setNumber(prev => prev + k)} aria-label={`Key ${k}`}>{k}</Button>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <Button onClick={() => createCall.mutate({ direction: "outbound", number: formatted })} disabled={!formatted || status === "dialing" || status === "connected"} aria-label="Call">
                  <Phone className="w-4 h-4 mr-2" /> Call
                </Button>
                <Button variant="destructive" onClick={() => callId && endCall.mutate({ id: callId, succeeded: true })} disabled={!callId} aria-label="End Call">
                  <PhoneOff className="w-4 h-4 mr-2" /> End
                </Button>
                {activeCall && (
                  <>
                    <Button variant="outline" onClick={toggleMute} aria-label="Mute">
                      {activeCall.muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                      {activeCall.muted ? "Unmute" : "Mute"}
                    </Button>
                    <Button variant="outline" onClick={toggleHold} aria-label="Hold">
                      {activeCall.state === "held" ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                      {activeCall.state === "held" ? "Resume" : "Hold"}
                    </Button>
                  </>
                )}
                <Button variant="outline" aria-label="Voicemail" onClick={() => navigate('/voicemail')}>
                  <Voicemail className="w-4 h-4 mr-2" /> Voicemail
                </Button>
              </div>

              <div className="text-sm text-muted-foreground mt-2" aria-live="polite">
                Status: {status} | SignalWire: {signalWireReady ? "Connected" : "Connecting…"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Search contacts</span>
            </div>
            <ScrollArea className="h-64 border rounded-md p-2">
              {contacts.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{c.name || "Unknown"}</div>
                    <div className="text-sm text-muted-foreground">{c.numbers?.[0] || "N/A"}</div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setNumber((c.numbers?.[0] || "").replace(/[^\d+]/g, ""))}>Dial</Button>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Call History</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48 border rounded-md p-2">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{h.number}</div>
                      <div className="text-xs text-muted-foreground">{h.direction} • {h.status} • {h.startedAt ? new Date(h.startedAt).toLocaleString() : ""}</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{h.durationMs ? Math.round(h.durationMs/1000) + 's' : ''}</div>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
