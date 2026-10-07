import type { ComponentType } from "react";
import { QueueWidget } from "./QueueWidget";
import { PhoneWidget } from "./PhoneWidget";
import { LeadWidget } from "./LeadWidget";
import { ScriptWidget } from "./ScriptWidget";
import { DispositionWidget } from "./DispositionWidget";
import { ActivityWidget } from "./ActivityWidget";

export interface DialerWidgetDef {
  id: string;
  title: string;
  component: ComponentType;
  defaultLayout: { x: number; y: number; w: number; h: number };
  minW: number;
  minH: number;
}

/**
 * Every panel of the power-dialer workspace as an independent widget.
 * Disposition defaults to a wide 2-column span (it was the "long skinny"
 * section at the bottom of the old fixed grid).
 */
export const DIALER_WIDGETS: DialerWidgetDef[] = [
  { id: "queue", title: "Queue", component: QueueWidget, defaultLayout: { x: 0, y: 0, w: 3, h: 8 }, minW: 2, minH: 4 },
  { id: "phone", title: "Phone", component: PhoneWidget, defaultLayout: { x: 3, y: 0, w: 5, h: 8 }, minW: 3, minH: 6 },
  { id: "lead", title: "Lead", component: LeadWidget, defaultLayout: { x: 8, y: 0, w: 4, h: 8 }, minW: 3, minH: 4 },
  { id: "disposition", title: "Disposition", component: DispositionWidget, defaultLayout: { x: 0, y: 8, w: 8, h: 6 }, minW: 3, minH: 4 },
  { id: "script", title: "Script", component: ScriptWidget, defaultLayout: { x: 8, y: 8, w: 4, h: 6 }, minW: 3, minH: 4 },
  { id: "activity", title: "Activity", component: ActivityWidget, defaultLayout: { x: 0, y: 14, w: 12, h: 5 }, minW: 3, minH: 3 },
];

export const DIALER_WIDGET_IDS = new Set(DIALER_WIDGETS.map((w) => w.id));

export interface WidgetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function defaultDialerLayout(): WidgetLayoutItem[] {
  return DIALER_WIDGETS.map((w) => ({ i: w.id, ...w.defaultLayout }));
}

/** Clamp a stored layout to known widgets + sane numbers; drop unknowns. */
export function sanitizeLayout(raw: unknown, cols = 12): WidgetLayoutItem[] {
  if (!Array.isArray(raw)) return defaultDialerLayout();
  const defs = new Map(DIALER_WIDGETS.map((w) => [w.id, w]));
  const out: WidgetLayoutItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as any).i || "");
    const def = defs.get(id);
    if (!def) continue;
    const num = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Number(v) : fb);
    const w = Math.max(def.minW, Math.min(cols, Math.round(num((item as any).w, def.defaultLayout.w))));
    const h = Math.max(def.minH, Math.round(num((item as any).h, def.defaultLayout.h)));
    const x = Math.max(0, Math.min(cols - w, Math.round(num((item as any).x, def.defaultLayout.x))));
    const y = Math.max(0, Math.round(num((item as any).y, def.defaultLayout.y)));
    out.push({ i: id, x, y, w, h });
  }
  // Any widget missing from the stored layout gets its default position.
  for (const def of DIALER_WIDGETS) {
    if (!out.some((o) => o.i === def.id)) out.push({ i: def.id, ...def.defaultLayout });
  }
  return out;
}
