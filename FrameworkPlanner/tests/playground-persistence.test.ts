import { describe, expect, it } from "vitest";
import { createMemoryStorage, getDefaultBrowserUrlForContext, loadPlaygroundState, makeAddressSearchUrl, makeDefaultStateV1, savePlaygroundState } from "../client/src/utils/playgroundPersistence";

describe("playground persistence", () => {
  it("saves and restores state across sessions", () => {
    const storage = createMemoryStorage();
    const key = "fp.playground.v1:test";
    const base = makeDefaultStateV1({ browser: { lastUrl: "https://example.com" } });
    const updated = {
      ...base,
      browser: { lastUrl: "https://www.zillow.com/" },
      underwriting: {
        ...base.underwriting,
        values: { ...base.underwriting.values, deal_summary: "Hello", risks: "Risk notes" },
      },
      bookmarks: [
        {
          id: "b1",
          label: "Risks",
          sectionId: "risks",
          createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        },
      ],
    };

    const saved = savePlaygroundState(storage, key, updated);
    expect(saved.ok).toBe(true);

    const loaded = loadPlaygroundState(storage, key);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe("stored");
    expect(loaded.state.browser.lastUrl).toBe("https://www.zillow.com/");
    expect(loaded.state.underwriting.values.deal_summary).toBe("Hello");
    expect(loaded.state.underwriting.values.risks).toBe("Risk notes");
    expect(loaded.state.bookmarks).toHaveLength(1);
    expect(loaded.state.bookmarks[0].sectionId).toBe("risks");
  });

  it("falls back and clears corrupted storage", () => {
    const storage = createMemoryStorage();
    const key = "fp.playground.v1:corrupt";
    storage.setItem(key, "{not-json");

    const res = loadPlaygroundState(storage, key);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("corrupt");
    expect(storage.getItem(key)).toBe(null);
  });

  it("falls back and clears incompatible data", () => {
    const storage = createMemoryStorage();
    const key = "fp.playground.v1:unsupported";
    storage.setItem(key, JSON.stringify({ version: 999, browser: { lastUrl: "x" } }));

    const res = loadPlaygroundState(storage, key);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("unsupported");
    expect(storage.getItem(key)).toBe(null);
  });

  it("returns an error when storage write fails", () => {
    const key = "fp.playground.v1:fail";
    const state = makeDefaultStateV1();
    const storage = {
      getItem: (_k: string) => null,
      removeItem: (_k: string) => {},
      setItem: (_k: string, _v: string) => {
        throw new Error("Quota exceeded");
      },
    };

    const res = savePlaygroundState(storage, key, state);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Quota");
  });

  it("builds a safe address search URL", () => {
    const url = makeAddressSearchUrl("123 Main St #5, Austin TX");
    expect(url.startsWith("https://duckduckgo.com/")).toBe(true);
    expect(url).toContain("q=");
    expect(url).toContain("%23");
  });

  it("selects a context-aware default browser URL", () => {
    const withAddress = getDefaultBrowserUrlForContext({ address: "10 Market St" });
    expect(withAddress).toContain("duckduckgo.com");
    expect(withAddress).toContain("q=");

    const withoutAddress = getDefaultBrowserUrlForContext();
    expect(withoutAddress).toBe("https://duckduckgo.com/");
  });
});
