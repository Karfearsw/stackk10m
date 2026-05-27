import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function XpCheckoutSuccessPage() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = String(params.get("session_id") || "").trim();

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto w-full max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Booking confirmed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">Payment completed. You will receive confirmation shortly.</div>
            {sessionId ? <div className="text-xs text-muted-foreground">Session: {sessionId}</div> : null}
            <Link href="/xp">
              <Button>Back to experiences</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

