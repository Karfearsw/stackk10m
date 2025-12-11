import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type SidebarState = "expanded" | "icon" | "hidden";

interface SidebarContextType {
  state: SidebarState;
  setState: (state: SidebarState) => void;
  cycleState: () => void;
  isExpanded: boolean;
  isIconOnly: boolean;
  isHidden: boolean;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

function migrateOldState(): SidebarState {
  const oldState = localStorage.getItem("sidebar-collapsed");
  if (oldState !== null) {
    localStorage.removeItem("sidebar-collapsed");
    return oldState === "true" ? "icon" : "expanded";
  }
  
  const savedState = localStorage.getItem("sidebar-state");
  if (savedState && ["expanded", "icon", "hidden"].includes(savedState)) {
    return savedState as SidebarState;
  }
  
  return "expanded";
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [state, setStateInternal] = useState<SidebarState>(migrateOldState);

  useEffect(() => {
    localStorage.setItem("sidebar-state", state);
  }, [state]);

  const setState = (newState: SidebarState) => setStateInternal(newState);
  
  const cycleState = () => {
    setStateInternal((prev) => {
      if (prev === "expanded") return "icon";
      if (prev === "icon") return "hidden";
      return "expanded";
    });
  };

  const isExpanded = state === "expanded";
  const isIconOnly = state === "icon";
  const isHidden = state === "hidden";

  return (
    <SidebarContext.Provider value={{ state, setState, cycleState, isExpanded, isIconOnly, isHidden }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
