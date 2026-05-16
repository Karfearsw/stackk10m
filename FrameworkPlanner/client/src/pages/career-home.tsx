import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CareerHomePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">OceanLuxe Careers</h1>
          <p className="text-muted-foreground">Recruiting, onboarding, and team entry.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Team login</CardTitle>
            <CardDescription>Existing team members can sign in to access internal tools.</CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/login">
              <Button>Login</Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Apply</CardTitle>
            <CardDescription>This can be replaced with your application flow or ATS integration.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <a href="mailto:careers@oceanluxe.org">
              <Button variant="outline">Email careers</Button>
            </a>
            <a href="https://oceanluxe.org">
              <Button variant="ghost">Back to OceanLuxe</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

