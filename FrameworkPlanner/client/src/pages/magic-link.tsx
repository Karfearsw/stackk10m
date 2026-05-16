import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function MagicLink() {
  const { consumeMagicLink } = useAuth();
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("token") || "").trim();
  }, []);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing sign-in token");
      return;
    }
    consumeMagicLink(token).catch((e: any) => {
      const msg = String(e?.message || "Sign-in failed");
      setError(msg);
      toast.error(msg);
    });
  }, [consumeMagicLink, token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img src="/luxe-logo.png" alt="Luxe RM Logo" className="h-24 w-auto object-contain" />
          </div>
          <CardTitle className="text-3xl font-bold">Signing you in</CardTitle>
          <CardDescription>{error ? "We couldn't sign you in" : "Please wait a moment"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {!error && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
          {error && (
            <Link href="/login" className="text-primary hover:underline font-medium">
              Back to sign in
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

