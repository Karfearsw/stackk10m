import { useState } from "react";
import { useLocation } from "wouter";
import { Phone, X, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * GlobalDialerWidget — persistent floating dialer available on every page.
 * Provides quick-dial access; tapping Call navigates to /phone with the number prefilled.
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
