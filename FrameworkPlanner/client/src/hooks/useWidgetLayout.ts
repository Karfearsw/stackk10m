import { useCallback, useEffect, useRef, useState } from "react";
import { defaultDialerLayout, sanitizeLayout, type WidgetLayoutItem } from "@/components/dialer/widgets/registry";

const SAVE_DEBOUNCE_MS = 500;

/**
 * Per-user persisted widget layout for a workspace page.
 *
 * Loads from GET /api/users/me/widget-layout?page=<page>, saves (debounced
 * 500ms) via PUT, and offers a reset-to-default. Layouts are keyed by user on
 * the server, so agent A's arrangement never affects agent B.
 */
export function useWidgetLayout(page: string) {
  const [layout, setLayout] = useState<WidgetLayoutItem[]>(() => defaultDialerLayout());
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users/me/widget-layout?page=${encodeURIComponent(page)}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.layout) setLayout(sanitizeLayout(data.layout));
        }
      } catch {
        /* fall back to defaults */
      } finally {
        if (!cancelled) {
          skipSave.current = true;
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const persist = useCallback(
    (next: WidgetLayoutItem[]) => {
      fetch("/api/users/me/widget-layout", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, layout: next }),
      }).catch(() => {});
    },
    [page],
  );

  const onLayoutChange = useCallback(
    (next: WidgetLayoutItem[]) => {
      const clean = sanitizeLayout(next);
      setLayout(clean);
      if (skipSave.current) {
        // First change after load is RGL normalizing — don't write it back.
        skipSave.current = false;
        return;
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(clean), SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const resetLayout = useCallback(() => {
    const defaults = defaultDialerLayout();
    skipSave.current = false;
    setLayout(defaults);
    persist(defaults);
  }, [persist]);

  return { layout, loaded, onLayoutChange, resetLayout };
}
