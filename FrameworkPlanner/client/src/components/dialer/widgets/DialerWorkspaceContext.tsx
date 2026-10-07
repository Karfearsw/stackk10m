import { createContext, useContext } from "react";
import type { useDialerWorkspaceState } from "./useDialerWorkspaceState";

export type DialerWorkspaceValue = ReturnType<typeof useDialerWorkspaceState>;

const DialerWorkspaceCtx = createContext<DialerWorkspaceValue | null>(null);

export function useDialerWorkspace(): DialerWorkspaceValue {
  const v = useContext(DialerWorkspaceCtx);
  if (!v) throw new Error("useDialerWorkspace must be used inside DialerWorkspaceProvider");
  return v;
}

export const DialerWorkspaceProvider = DialerWorkspaceCtx.Provider;
