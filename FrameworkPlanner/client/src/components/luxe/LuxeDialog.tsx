import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type LuxeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
};

/**
 * Adaptive dialog: centered modal on desktop, bottom sheet on mobile.
 * Satisfies both LuxeDialog and LuxeBottomSheet.
 */
export function LuxeDialog({ open, onOpenChange, title, description, children, className, wide }: LuxeDialogProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn("max-h-[92dvh]", className)}>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-serif text-xl tracking-tight">{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(wide && "sm:max-w-2xl", className)}>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl tracking-tight">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function LuxeBottomSheet(props: LuxeDialogProps) {
  return <LuxeDialog {...props} />;
}
