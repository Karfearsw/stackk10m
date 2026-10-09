import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LuxeMobileCardProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

/** Mobile card: the card alternative to LuxeDataTable rows below md. */
export function LuxeMobileCard({ children, onClick, className }: LuxeMobileCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn("border-border/60", onClick && "cursor-pointer active:scale-[0.99] transition-transform", className)}
    >
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

export function LuxeMobileCardRow({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}
