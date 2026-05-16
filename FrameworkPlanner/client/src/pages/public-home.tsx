import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function origin(host: string) {
  const h = String(host || "").trim();
  if (!h) return "";
  return `https://${h}`;
}

export default function PublicHomePage() {
  const deals = origin("deals.oceanluxe.org");
  const xp = origin("xp.oceanluxe.org");
  const career = origin("career.oceanluxe.org");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">OceanLuxe</h1>
          <p className="text-muted-foreground">Welcome to OceanLuxe. Choose where you want to go.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Deals</CardTitle>
              <CardDescription>CRM and operations.</CardDescription>
            </CardHeader>
            <CardContent>
              <a href={deals}>
                <Button className="w-full">Open Deals</Button>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Experiences</CardTitle>
              <CardDescription>Book travel and concierge experiences.</CardDescription>
            </CardHeader>
            <CardContent>
              <a href={xp}>
                <Button className="w-full">Book XP</Button>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Career</CardTitle>
              <CardDescription>Recruiting, onboarding, and team entry.</CardDescription>
            </CardHeader>
            <CardContent>
              <a href={career}>
                <Button className="w-full" variant="outline">
                  Open Career
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

