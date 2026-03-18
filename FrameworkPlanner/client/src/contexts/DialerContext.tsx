import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { DialerListId, DialerQueueItem } from "@/lib/dialerTypes";

interface DialerState {
  listId: DialerListId;
  queue: DialerQueueItem[];
  activeIndex: number;
}

type DialerAction =
  | { type: "set_list"; listId: DialerListId }
  | { type: "set_queue"; queue: DialerQueueItem[] }
  | { type: "set_active_index"; activeIndex: number }
  | { type: "next" };

function reducer(state: DialerState, action: DialerAction): DialerState {
  if (action.type === "set_list") {
    return { ...state, listId: action.listId, activeIndex: 0 };
  }
  if (action.type === "set_queue") {
    return { ...state, queue: action.queue, activeIndex: 0 };
  }
  if (action.type === "set_active_index") {
    return { ...state, activeIndex: action.activeIndex };
  }
  if (action.type === "next") {
    const nextIndex = Math.min(state.activeIndex + 1, Math.max(0, state.queue.length - 1));
    return { ...state, activeIndex: nextIndex };
  }
  return state;
}

interface DialerContextValue {
  state: DialerState;
  setListId: (listId: DialerListId) => void;
  setQueue: (queue: DialerQueueItem[]) => void;
  setActiveIndex: (index: number) => void;
  next: () => void;
  activeItem: DialerQueueItem | null;
}

const DialerContext = createContext<DialerContextValue | undefined>(undefined);

export function DialerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { listId: "new", queue: [], activeIndex: 0 });

  const value = useMemo<DialerContextValue>(() => {
    const activeItem = state.queue[state.activeIndex] ?? null;
    return {
      state,
      activeItem,
      setListId: (listId) => dispatch({ type: "set_list", listId }),
      setQueue: (queue) => dispatch({ type: "set_queue", queue }),
      setActiveIndex: (activeIndex) => dispatch({ type: "set_active_index", activeIndex }),
      next: () => dispatch({ type: "next" }),
    };
  }, [state]);

  return <DialerContext.Provider value={value}>{children}</DialerContext.Provider>;
}

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer must be used within a DialerProvider");
  return ctx;
}

