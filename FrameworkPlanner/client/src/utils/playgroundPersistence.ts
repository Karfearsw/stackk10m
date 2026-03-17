import { z } from "zod";

export type UnderwritingSection = { id: string; title: string };

export type UnderwritingBookmark = {
  id: string;
  label: string;
  sectionId: string;
  createdAt: string;
};

export type PlaygroundPersistedStateV1 = {
  version: 1;
  browser: { lastUrl: string };
  underwriting: {
    sections: UnderwritingSection[];
    values: Record<string, string>;
  };
  bookmarks: UnderwritingBookmark[];
  updatedAt: string;
};

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const underwritingSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

const bookmarkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sectionId: z.string().min(1),
  createdAt: z.string().min(1),
});

const persistedStateV1Schema = z.object({
  version: z.literal(1),
  browser: z.object({ lastUrl: z.string() }),
  underwriting: z.object({
    sections: z.array(underwritingSectionSchema),
    values: z.record(z.string()),
  }),
  bookmarks: z.array(bookmarkSchema),
  updatedAt: z.string().min(1),
});

export const defaultUnderwritingSections: UnderwritingSection[] = [
  { id: "deal_summary", title: "Deal Summary" },
  { id: "assumptions", title: "Assumptions" },
  { id: "risks", title: "Risks" },
  { id: "comps", title: "Comps" },
  { id: "exit", title: "Exit Strategy" },
  { id: "next_steps", title: "Next Steps" },
];

const defaultBrowserUrl = "https://duckduckgo.com/";

export function nowIso() {
  return new Date().toISOString();
}

export function makeAddressSearchUrl(address: string) {
  const q = String(address || "").trim();
  if (!q) return defaultBrowserUrl;
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

export function getDefaultBrowserUrlForContext(ctx?: { address?: string | null }) {
  const addr = String(ctx?.address || "").trim();
  return addr ? makeAddressSearchUrl(addr) : defaultBrowserUrl;
}

export function makeDefaultStateV1(
  seed?: Partial<Pick<PlaygroundPersistedStateV1, "browser">>,
  ctx?: { address?: string | null },
): PlaygroundPersistedStateV1 {
  const values: Record<string, string> = {};
  for (const s of defaultUnderwritingSections) values[s.id] = "";
  return {
    version: 1,
    browser: { lastUrl: seed?.browser?.lastUrl ?? getDefaultBrowserUrlForContext(ctx) },
    underwriting: { sections: defaultUnderwritingSections, values },
    bookmarks: [],
    updatedAt: nowIso(),
  };
}

export function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

export function getSafeLocalStorage(): { storage: StorageLike; persistent: boolean } {
  try {
    const ls = globalThis.localStorage;
    const k = "__fp_ls_test__";
    ls.setItem(k, "1");
    ls.removeItem(k);
    return { storage: ls, persistent: true };
  } catch {
    return { storage: createMemoryStorage(), persistent: false };
  }
}

export type LoadResult =
  | { ok: true; state: PlaygroundPersistedStateV1; source: "stored" | "default" }
  | { ok: false; state: PlaygroundPersistedStateV1; reason: "corrupt" | "unsupported" };

export function loadPlaygroundState(storage: StorageLike, key: string, seed?: Partial<Pick<PlaygroundPersistedStateV1, "browser">>): LoadResult {
  const fallback = makeDefaultStateV1(seed);
  const raw = storage.getItem(key);
  if (!raw) return { ok: true, state: fallback, source: "default" };
  try {
    const parsed = JSON.parse(raw);
    const v1 = persistedStateV1Schema.safeParse(parsed);
    if (v1.success) return { ok: true, state: v1.data, source: "stored" };
    storage.removeItem(key);
    return { ok: false, state: fallback, reason: "unsupported" };
  } catch {
    storage.removeItem(key);
    return { ok: false, state: fallback, reason: "corrupt" };
  }
}

export function savePlaygroundState(storage: StorageLike, key: string, state: PlaygroundPersistedStateV1): { ok: true } | { ok: false; error: string } {
  try {
    const payload: PlaygroundPersistedStateV1 = { ...state, updatedAt: nowIso() };
    storage.setItem(key, JSON.stringify(payload));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Failed to write to storage" };
  }
}

export function normalizeKeyPart(input: string) {
  const trimmed = String(input || "").trim().toLowerCase();
  const normalized = trimmed.replace(/\s+/g, "_").replace(/[^a-z0-9_\-]/g, "");
  return normalized.slice(0, 80) || "global";
}
