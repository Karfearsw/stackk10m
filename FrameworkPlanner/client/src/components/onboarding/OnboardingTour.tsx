import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface TourStep {
  title: string;
  description: string;
  target?: string; // CSS selector to highlight
  action?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Luxe RM! 👋",
    description:
      "This is your wholesaling command center. Let's take a 60-second tour so you know exactly where everything lives.",
  },
  {
    title: "Leads Pipeline",
    description:
      "Every deal starts here. Your seller leads live in the pipeline — click a lead to see details, call, text, or move it through stages.",
    action: "Find it in the sidebar under Dashboard",
  },
  {
    title: "The Phone",
    description:
      "Tap the floating phone button (bottom-right, on every page) to quick-dial anyone. Or open the full Dialer Workspace for power-calling sessions.",
    action: "Look for the gold phone button",
  },
  {
    title: "Disposition",
    description:
      "Once a property is under contract, it moves here. Match it to buyers, track offers, and blast it to your buyer list.",
    action: "Sidebar → Disposition",
  },
  {
    title: "Contracts & E-Sign",
    description:
      "Generate contracts, send them for e-signature, and track signing status — all without leaving the CRM.",
    action: "Sidebar → Contracts",
  },
  {
    title: "You're ready! 🚀",
    description:
      "That's the core loop: Leads → Call → Contract → Disposition → Payday. You can replay this tour anytime from Settings.",
  },
];

const STORAGE_KEY = "luxe-rm-tour-completed";

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) {
        // Small delay so the dashboard renders first
        const t = setTimeout(() => setOpen(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable — don't block
    }
  }, []);

  const complete = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const restart = () => {
    setStep(0);
    setOpen(true);
  };

  // Expose restart globally for Settings page
  useEffect(() => {
    (window as any).__restartTour = restart;
    return () => {
      delete (window as any).__restartTour;
    };
  }, []);

  if (!open) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md border-[#D4AF37]/30 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D4AF37]/15">
              <Sparkles className="h-4 w-4 text-[#D4AF37]" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Step {step + 1} of {TOUR_STEPS.length}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={complete}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <h2 className="mb-2 font-serif text-xl font-semibold">{current.title}</h2>
        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
          {current.description}
        </p>
        {current.action && (
          <p className="mb-4 rounded-md bg-[#D4AF37]/10 px-3 py-2 text-xs font-medium text-[#D4AF37]">
            👉 {current.action}
          </p>
        )}

        {/* Progress dots */}
        <div className="mb-4 flex gap-1.5">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-[#D4AF37]" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={complete}
            className="text-muted-foreground"
          >
            Skip tour
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                onClick={complete}
                className="bg-[#D4AF37] text-black hover:bg-[#D4AF37]/90 font-semibold"
              >
                Let's go! 🚀
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep(step + 1)}
                className="bg-[#D4AF37] text-black hover:bg-[#D4AF37]/90 font-semibold"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
