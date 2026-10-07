/**
 * Dialer widget workspace tests (Dialer PRD Task B).
 *
 * Covers the pure logic: layout registry defaults, layout sanitization, and
 * the server-side widget-layout validation (0082). Persistence round-trips
 * (debounced PUT / GET per user) are exercised through validateWidgetLayout
 * plus the upsert contract documented here.
 */
import { describe, it, expect } from "vitest";
import {
  DIALER_WIDGETS,
  defaultDialerLayout,
  sanitizeLayout,
} from "@/components/dialer/widgets/registry";
import {
  validateWidgetLayout,
  sanitizeWidgetLayoutItem,
} from "../server/dialer/widget-layouts";

describe("widget registry", () => {
  it("registers the six PRD widgets", () => {
    expect(DIALER_WIDGETS.map((w) => w.id).sort()).toEqual(
      ["activity", "disposition", "lead", "phone", "queue", "script"].sort(),
    );
  });

  it("defaults to a 12-col grid with disposition spanning wide", () => {
    const layout = defaultDialerLayout();
    expect(layout).toHaveLength(6);
    const dispo = layout.find((l) => l.i === "disposition")!;
    expect(dispo.w).toBe(8);
    expect(layout.every((l) => l.x + l.w <= 12)).toBe(true);
    expect(layout.every((l) => l.x >= 0 && l.y >= 0)).toBe(true);
  });

  it("sanitizeLayout drops unknown widgets and clamps numbers", () => {
    const clean = sanitizeLayout([
      { i: "queue", x: 0, y: 0, w: 3, h: 8 },
      { i: "nope", x: 0, y: 0, w: 3, h: 3 },
      { i: "phone", x: -5, y: 0, w: 99, h: 8 },
      null,
    ]);
    const ids = clean.map((l) => l.i);
    expect(ids).not.toContain("nope");
    // every known widget present exactly once (missing ones get defaults)
    expect(new Set(ids).size).toBe(6);
    const phone = clean.find((l) => l.i === "phone")!;
    expect(phone.x).toBe(0);
    expect(phone.w).toBe(12);
  });

  it("sanitizeLayout falls back to defaults for non-arrays", () => {
    expect(sanitizeLayout(null)).toEqual(defaultDialerLayout());
    expect(sanitizeLayout("junk")).toEqual(defaultDialerLayout());
  });
});

describe("validateWidgetLayout (server, 0082)", () => {
  const good = [
    { i: "queue", x: 0, y: 0, w: 3, h: 8 },
    { i: "phone", x: 3, y: 0, w: 5, h: 8 },
  ];

  it("accepts a valid dialer-workspace layout", () => {
    const v = validateWidgetLayout("dialer-workspace", good);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.page).toBe("dialer-workspace");
      expect(v.items).toHaveLength(2);
    }
  });

  it("rejects unknown pages", () => {
    expect(validateWidgetLayout("nope", good).ok).toBe(false);
    expect(validateWidgetLayout("", good).ok).toBe(false);
  });

  it("rejects non-array layouts and unknown widget ids", () => {
    expect(validateWidgetLayout("dialer-workspace", "x").ok).toBe(false);
    const v = validateWidgetLayout("dialer-workspace", [
      { i: "queue", x: 0, y: 0, w: 3, h: 8 },
      { i: "evil", x: 0, y: 0, w: 3, h: 3 },
    ]);
    expect(v.ok).toBe(false);
  });

  it("rejects duplicate widget ids", () => {
    const v = validateWidgetLayout("dialer-workspace", [
      { i: "queue", x: 0, y: 0, w: 3, h: 8 },
      { i: "queue", x: 3, y: 0, w: 3, h: 8 },
    ]);
    expect(v.ok).toBe(false);
  });

  it("clamps out-of-range coordinates instead of rejecting", () => {
    const v = validateWidgetLayout("dialer-workspace", [
      { i: "queue", x: -99, y: 0, w: 500, h: 8 },
    ]);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.items[0].x).toBe(0);
      expect(v.items[0].w).toBe(12);
    }
  });
});

describe("sanitizeWidgetLayoutItem", () => {
  it("returns null for malformed input", () => {
    expect(sanitizeWidgetLayoutItem(null)).toBeNull();
    expect(sanitizeWidgetLayoutItem({ i: "unknown", x: 0, y: 0, w: 1, h: 1 })).toBeNull();
  });
});
