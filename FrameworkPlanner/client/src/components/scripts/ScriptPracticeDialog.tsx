import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, RotateCcw, Save, ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

interface ScriptPracticeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: {
    id: number;
    name: string;
    content: string;
    category?: string;
    avgPracticeSeconds?: number;
    totalPracticeCount?: number;
  };
  leadId?: number | null;
  leadName?: string;
  onPracticeLogged?: () => void;
}

export function ScriptPracticeDialog({
  open,
  onOpenChange,
  script,
  leadId,
  leadName,
  onPracticeLogged,
}: ScriptPracticeDialogProps) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [fontSize, setFontSize] = useState(24);
  const [scrollPos, setScrollPos] = useState(0);
  const timerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setRunning(false);
      setElapsed(0);
      setNotes("");
      setSaved(false);
      setScrollPos(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (running) {
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, []);

  const handleStart = useCallback(() => {
    setElapsed(0);
    setRunning(true);
    setSaved(false);
    setNotes("");
  }, []);

  const handlePause = useCallback(() => {
    setRunning((prev) => !prev);
  }, []);

  const handleStop = useCallback(() => {
    setRunning(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (elapsed <= 0) return;
    try {
      await apiRequest("POST", `/api/scripts/${script.id}/practice`, {
        durationSeconds: elapsed,
        notes,
        leadId: leadId || null,
      });
      setSaved(true);
      setRunning(false);
      toast.success(`Practice logged: ${formatTime(elapsed)}`);
      onPracticeLogged?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to log practice");
    }
  }, [elapsed, notes, script.id, leadId, formatTime, onPracticeLogged]);

  const handleFontUp = useCallback(() => {
    setFontSize((prev) => Math.min(48, prev + 4));
  }, []);

  const handleFontDown = useCallback(() => {
    setFontSize((prev) => Math.max(14, prev - 4));
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        if (!running && elapsed === 0) handleStart();
        else if (running) handlePause();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, running, elapsed, handleStart, handlePause]);

  const avgSeconds = script.avgPracticeSeconds || 0;
  const totalPractices = script.totalPracticeCount || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Practice: {script.name}
          </DialogTitle>
          <DialogDescription>
            {leadName ? `Practicing for ${leadName}` : "Read through your script to build confidence"}
          </DialogDescription>
        </DialogHeader>

        {/* Timer and controls */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-mono font-bold tabular-nums">
              {formatTime(elapsed)}
            </div>
            {avgSeconds > 0 && (
              <div className="text-xs text-muted-foreground">
                Avg: {formatTime(avgSeconds)} · {totalPractices} sessions
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleFontDown} title="Smaller text">
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleFontUp} title="Larger text">
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Badge variant={running ? "default" : elapsed > 0 ? "secondary" : "outline"}>
              {running ? "Recording" : elapsed > 0 ? "Paused" : "Ready"}
            </Badge>
          </div>
        </div>

        {/* Script display - teleprompter */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto border rounded-lg bg-muted/30 p-6 min-h-[200px] max-h-[40vh]"
          style={{ scrollBehavior: "smooth" }}
        >
          <div
            className="whitespace-pre-wrap leading-relaxed"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
          >
            {script.content || "No script content"}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes after practice (optional)..."
            className="min-h-[60px] text-sm"
            disabled={saved}
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          {elapsed === 0 && !saved ? (
            <Button onClick={handleStart} className="flex-1 sm:flex-none">
              <Play className="h-4 w-4 mr-2" /> Start Practice
            </Button>
          ) : (
            <>
              <Button
                onClick={handlePause}
                variant={running ? "outline" : "default"}
                className="flex-1 sm:flex-none"
              >
                {running ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                {running ? "Pause" : "Resume"}
              </Button>
              <Button onClick={handleStop} variant="destructive" className="flex-1 sm:flex-none">
                <Square className="h-4 w-4 mr-2" /> Stop
              </Button>
            </>
          )}
          {elapsed > 0 && !saved ? (
            <Button onClick={handleSave} variant="default" className="flex-1 sm:flex-none">
              <Save className="h-4 w-4 mr-2" /> Log Practice ({formatTime(elapsed)})
            </Button>
          ) : null}
          {saved ? (
            <Badge variant="default" className="h-9 px-4">✓ Saved</Badge>
          ) : null}
          <Button
            onClick={() => {
              setElapsed(0);
              setRunning(false);
              setSaved(false);
            }}
            variant="ghost"
            size="icon"
            disabled={elapsed === 0}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
