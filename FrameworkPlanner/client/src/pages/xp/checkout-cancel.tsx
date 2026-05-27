import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

export default function XpCheckoutCancelPage() {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-12">
      <div className="mx-auto w-full max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Checkout cancelled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">No payment was completed.</div>
            <Link href="/xp">
              <Button>Back to experiences</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

