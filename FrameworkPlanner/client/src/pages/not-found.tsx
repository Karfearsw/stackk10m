import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home, LayoutDashboard, Users, Phone, BookOpen } from "lucide-react";
import { Link } from "wouter";

const SUGGESTIONS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/dialer-workspace", label: "Dialer", icon: Phone },
  { href: "/docs", label: "Documentation", icon: BookOpen },
];

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            The page you're looking for doesn't exist or may have moved. Check the
            address, or jump to one of these:
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {SUGGESTIONS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </Link>
            ))}
          </div>

          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Home className="h-4 w-4" />
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
