import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, RotateCcw } from "lucide-react";

type PomodoroMode = "focus" | "break";

type PomodoroState = {
  mode: PomodoroMode;
  focusSeconds: number;
  breakSeconds: number;
  secondsLeft: number;
  running: boolean;
  updatedAt: number;
};

const STORAGE_KEY = "pomodoroTimer:v1";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function defaultState(): PomodoroState {
  const focusSeconds = 25 * 60;
  const breakSeconds = 5 * 60;
  return {
    mode: "focus",
    focusSeconds,
    breakSeconds,
    secondsLeft: focusSeconds,
    running: false,
    updatedAt: Date.now(),
  };
}

function loadState(): PomodoroState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PomodoroState>;
    const base = defaultState();
    const state: PomodoroState = {
      ...base,
      ...parsed,
      mode: parsed.mode === "break" ? "break" : "focus",
      focusSeconds: typeof parsed.focusSeconds === "number" ? parsed.focusSeconds : base.focusSeconds,
      breakSeconds: typeof parsed.breakSeconds === "number" ? parsed.breakSeconds : base.breakSeconds,
      secondsLeft: typeof parsed.secondsLeft === "number" ? parsed.secondsLeft : base.secondsLeft,
      running: !!parsed.running,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
    return state;
  } catch {
    return defaultState();
  }
}

export function PomodoroTimer() {
  const [state, setState] = useState<PomodoroState>(() => loadState());

  const label = useMemo(() => (state.mode === "focus" ? "Focus" : "Break"), [state.mode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
    } catch {}
  }, [state]);

  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => {
      setState((prev) => {
        const nextLeft = Math.max(0, prev.secondsLeft - 1);
        if (nextLeft > 0) return { ...prev, secondsLeft: nextLeft, updatedAt: Date.now() };
        const nextMode: PomodoroMode = prev.mode === "focus" ? "break" : "focus";
        const nextSeconds = nextMode === "focus" ? prev.focusSeconds : prev.breakSeconds;
        return { ...prev, mode: nextMode, secondsLeft: nextSeconds, updatedAt: Date.now() };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.running]);

  const toggle = () => setState((s) => ({ ...s, running: !s.running, updatedAt: Date.now() }));

  const reset = () =>
    setState((s) => {
      const secondsLeft = s.mode === "focus" ? s.focusSeconds : s.breakSeconds;
      return { ...s, secondsLeft, running: false, updatedAt: Date.now() };
    });

  return (
    <Card data-testid="card-pomodoro">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">Pomodoro</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-2xl font-bold tabular-nums">{formatTime(state.secondsLeft)}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={toggle} data-testid="button-pomodoro-toggle">
            {state.running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {state.running ? "Pause" : "Start"}
          </Button>
          <Button size="sm" variant="outline" onClick={reset} data-testid="button-pomodoro-reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

