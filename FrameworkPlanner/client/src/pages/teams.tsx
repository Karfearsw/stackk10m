import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function TeamsPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/settings?tab=team");
  }, [setLocation]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-border" />
    </div>
  );
}

