import * as Sentry from "@sentry/react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AppErrorBoundary(props: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="min-h-screen w-full flex items-center justify-center p-6">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground break-words">{String((error as any)?.message || "Unknown error")}</div>
              <div className="text-xs text-muted-foreground break-words">{typeof window !== "undefined" ? window.location.pathname : ""}</div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    resetError();
                    window.location.reload();
                  }}
                >
                  Reload
                </Button>
                <Button variant="outline" onClick={() => resetError()}>
                  Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    >
      {props.children}
    </Sentry.ErrorBoundary>
  );
}
