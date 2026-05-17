import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { XpPublicShell } from "@/components/xp/XpPublicShell";
import { Link } from "wouter";

export default function XpCheckoutCancelPage() {
  return (
    <XpPublicShell>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="space-y-1">
          <div className="text-3xl font-semibold tracking-tight">Checkout cancelled</div>
          <div className="text-sm text-muted-foreground">No payment was completed.</div>
        </div>

        <Card className="border-border/60 bg-background/70 backdrop-blur">
          <CardContent className="p-5 space-y-3">
            <div className="text-sm text-muted-foreground">
              You can try again when you’re ready. Availability is held only after payment is confirmed.
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/xp">
                <Button>Back to experiences</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </XpPublicShell>
  );
}
