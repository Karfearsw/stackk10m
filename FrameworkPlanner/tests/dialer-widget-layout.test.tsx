// @vitest-environment jsdom
/**
 * useWidgetLayout persistence tests.
 *
 * Proves the PRD acceptance: drag/resize layout changes persist per user
 * across reloads (GET hydrates, PUT upserts debounced at 500ms), and reset
 * restores defaults. Server per-user isolation is guaranteed by the
 * (user_id, page) key on the 0082 table + requireAuth on the routes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWidgetLayout } from "@/hooks/useWidgetLayout";
import { defaultDialerLayout } from "@/components/dialer/widgets/registry";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mockFetch(savedLayout: unknown = null) {
  const puts: any[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
    if (init?.method === "PUT") {
      puts.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ ok: true }) } as any;
    }
    return {
      ok: true,
      json: async () => ({ page: "dialer-workspace", layout: savedLayout }),
    } as any;
  });
  return puts;
}

describe("useWidgetLayout", () => {
  beforeEach(() => {
    delete (globalThis as any).__puts;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates the saved layout on mount", async () => {
    mockFetch([
      { i: "queue", x: 6, y: 0, w: 6, h: 8 },
      { i: "phone", x: 0, y: 0, w: 6, h: 8 },
    ]);
    const { result } = renderHook(() => useWidgetLayout("dialer-workspace"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const queue = result.current.layout.find((l) => l.i === "queue")!;
    expect(queue.x).toBe(6);
    // widgets missing from the saved payload get defaults (still all six)
    expect(result.current.layout).toHaveLength(6);
  });

  it("falls back to defaults when nothing is saved", async () => {
    mockFetch(null);
    const { result } = renderHook(() => useWidgetLayout("dialer-workspace"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.layout).toEqual(defaultDialerLayout());
  });

  it("debounces layout changes into a single PUT after 500ms", async () => {
    const puts = mockFetch(null);
    const { result } = renderHook(() => useWidgetLayout("dialer-workspace"));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const moved = result.current.layout.map((l) =>
      l.i === "queue" ? { ...l, x: 3 } : l,
    );
    act(() => {
      result.current.onLayoutChange(moved);
      result.current.onLayoutChange(moved.map((l) => (l.i === "phone" ? { ...l, w: 7 } : l)));
    });
    // nothing sent yet — still inside the debounce window
    expect(puts).toHaveLength(0);
    await act(async () => {
      await sleep(650);
    });
    expect(puts).toHaveLength(1);
    expect(puts[0].page).toBe("dialer-workspace");
    expect(puts[0].layout.find((l: any) => l.i === "phone").w).toBe(7);
  });

  it("resetLayout restores defaults and persists immediately", async () => {
    const puts = mockFetch(null);
    const { result } = renderHook(() => useWidgetLayout("dialer-workspace"));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.resetLayout();
    });
    expect(result.current.layout).toEqual(defaultDialerLayout());
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].layout).toEqual(defaultDialerLayout());
  });
});
