import { useState } from "react";
import { useLocation } from "wouter";
import { Phone, X, Delete, UserPlus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

/**
 * GlobalDialerWidget — persistent floating dialer available on every page.
 * Provides quick-dial access; tapping Call navigates to /phone with the number prefilled.
 * Can also create a lead from the number or jump to SMS.
 */
export function GlobalDialerWidget() {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [, navigate] = useLocation();

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  const handleCall = () => {
    if (!number.trim()) return;
    navigate(`/phone?number=${encodeURIComponent(number.trim())}`);
    setOpen(false);
  };

  const handleAddLead = async () => {
    if (!number.trim()) return;
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: number.trim(), source: "dialer-widget" }),
      });
      if (!res.ok) throw new Error("Failed to create lead");
      const lead = await res.json();
      toast.success("Lead created");
      navigate(`/leads?highlight=${lead.id}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Could not create lead");
    }
  };

  const handleSms = () => {
    if (!number.trim()) return;
    navigate(`/messages?to=${encodeURIComponent(number.trim())}`);
    setOpen(false);
  };

  const handleFullDialer = () => {
    navigate("/dialer-workspace");
    setOpen(false);
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 lg:bottom-6 lg:right-6">
      {open && (
        <Card className="mb-3 w-64 p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Quick Dial</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mb-3 rounded-md bg-muted px-3 py-2 text-center text-lg font-mono tracking-wider">
            {number || <span className="text-muted-foreground">Enter number</span>}
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {keys.map((k) => (
              <Button
                key={k}
                variant="outline"
                className="h-11 text-lg font-semibold"
                onClick={() => setNumber((prev) => prev + k)}
              >
                {k}
              </Button>
            ))}
            <Button
              variant="outline"
              className="col-span-3 h-10"
              onClick={() => setNumber((prev) => prev.slice(0, -1))}
            >
              <Delete className="h-4 w-4 mr-2" /> Backspace
            </Button>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleCall} disabled={!number.trim()}>
              <Phone className="h-4 w-4 mr-2" /> Call
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleFullDialer}>
              Full Dialer
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={handleAddLead}
              disabled={!number.trim()}
            >
              <UserPlus className="h-4 w-4 mr-2" /> Save as Lead
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={handleSms}
              disabled={!number.trim()}
            >
              <MessageSquare className="h-4 w-4 mr-2" /> Text
            </Button>
          </div>
        </Card>
      )}
      <Button
        size="icon"
        className="h-14 w-14 rounded-full shadow-xl"
        onClick={() => setOpen(!open)}
        aria-label="Open dialer"
      >
        {open ? <X className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
      </Button>
    </div>
  );
}
