/**
 * 0082 — per-user dialer widget layout validation.
 *
 * Pure, dependency-free helpers so the rules are unit-testable and shared by
 * the API route and any future layout consumers. Layouts are arrays of
 * react-grid-layout items; only known widget ids for known pages are stored,
 * with coordinates clamped to sane ranges.
 */

export interface WidgetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Widget ids the dialer-workspace page knows how to render. */
export const KNOWN_DIALER_WIDGETS = new Set([
  "queue",
  "phone",
  "lead",
  "disposition",
  "script",
  "activity",
]);

/** Pages that currently accept persisted widget layouts. */
export const WIDGET_LAYOUT_PAGES = new Set(["dialer-workspace"]);

const MAX_LAYOUT_ITEMS = 24;
const MAX_GRID_COLS = 12;
const MAX_ROWS = 60;

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function sanitizeWidgetLayoutItem(
  raw: unknown,
  knownWidgets: Set<string> = KNOWN_DIALER_WIDGETS,
): WidgetLayoutItem | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String((raw as any).i || "").trim();
  if (!knownWidgets.has(id)) return null;
  const w = Math.max(1, Math.min(MAX_GRID_COLS, Math.round(num((raw as any).w, 4))));
  const h = Math.max(1, Math.min(MAX_ROWS, Math.round(num((raw as any).h, 4))));
  const x = Math.max(0, Math.min(MAX_GRID_COLS - w, Math.round(num((raw as any).x, 0))));
  const y = Math.max(0, Math.min(MAX_ROWS - h, Math.round(num((raw as any).y, 0))));
  return { i: id, x, y, w, h };
}

export function validateWidgetLayout(
  page: unknown,
  layout: unknown,
): { ok: true; page: string; items: WidgetLayoutItem[] } | { ok: false; error: string } {
  const p = String(page || "").trim().slice(0, 64);
  if (!p || !WIDGET_LAYOUT_PAGES.has(p)) {
    return { ok: false, error: `page must be one of: ${[...WIDGET_LAYOUT_PAGES].join(", ")}` };
  }
  if (!Array.isArray(layout)) return { ok: false, error: "layout must be an array of grid items" };
  if (layout.length > MAX_LAYOUT_ITEMS) {
    return { ok: false, error: `layout must have at most ${MAX_LAYOUT_ITEMS} items` };
  }
  const items: WidgetLayoutItem[] = [];
  const seen = new Set<string>();
  for (const raw of layout) {
    const item = sanitizeWidgetLayoutItem(raw);
    if (!item) return { ok: false, error: "layout contains an unknown widget id or malformed item" };
    if (seen.has(item.i)) return { ok: false, error: `duplicate widget id in layout: ${item.i}` };
    seen.add(item.i);
    items.push(item);
  }
  return { ok: true, page: p, items };
}
