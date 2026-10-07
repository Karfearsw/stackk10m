import { DialerProvider } from "@/contexts/DialerContext";
import { DialerWorkspaceProvider } from "@/components/dialer/widgets/DialerWorkspaceContext";
import { useDialerWorkspaceState } from "@/components/dialer/widgets/useDialerWorkspaceState";
import { DialerWorkspaceGrid } from "@/components/dialer/widgets/DialerWorkspaceGrid";

/**
 * /dialer-workspace — power-dialer workspace.
 *
 * All call state + behavior lives in useDialerWorkspaceState (provided via
 * DialerWorkspaceContext); the visible page is a draggable/resizable widget
 * grid (DialerWorkspaceGrid) with per-user persisted layouts.
 */
function DialerWorkspaceInner() {
  const value = useDialerWorkspaceState();
  return (
    <DialerWorkspaceProvider value={value}>
      <DialerWorkspaceGrid />
    </DialerWorkspaceProvider>
  );
}

export default function DialerWorkspace() {
  return (
    <DialerProvider>
      <DialerWorkspaceInner />
    </DialerProvider>
  );
}
