import { describe, expect, it, vi } from "vitest";
import { userNotifications } from "../server/shared-schema";

type SqlLike = { queryChunks?: unknown[] };

function collectColumnNames(input: unknown, out: Set<string> = new Set()): Set<string> {
  if (!input || typeof input !== "object") return out;

  const anyInput = input as any;
  const chunks = anyInput.queryChunks;
  if (Array.isArray(chunks)) {
    for (const c of chunks) {
      if (c && typeof c === "object" && typeof (c as any).name === "string") out.add(String((c as any).name));
      collectColumnNames(c, out);
    }
  }

  return out;
}

function collectStringChunks(input: unknown, out: string[] = []): string[] {
  if (!input || typeof input !== "object") return out;

  const anyInput = input as any;
  const chunks = anyInput.queryChunks;
  if (Array.isArray(chunks)) {
    for (const c of chunks) {
      if (c && typeof c === "object" && Array.isArray((c as any).value)) {
        for (const v of (c as any).value) {
          if (typeof v === "string") out.push(v);
        }
      }
      collectStringChunks(c, out);
    }
  }

  return out;
}

let lastQuery: any | undefined;

class FakeQuery {
  fromTable: unknown | undefined;
  whereExpr: unknown | undefined;
  orderByArgs: unknown[] = [];
  limitVal: number | undefined;
  offsetVal: number | undefined;

  from(table: unknown) {
    this.fromTable = table;
    return this;
  }

  where(expr: unknown) {
    this.whereExpr = expr;
    return this;
  }

  orderBy(...args: unknown[]) {
    this.orderByArgs = args;
    return this;
  }

  limit(n: number) {
    this.limitVal = n;
    return this;
  }

  offset(n: number) {
    this.offsetVal = n;
    return this;
  }

  then(onFulfilled: any, onRejected: any) {
    return Promise.resolve([]).then(onFulfilled, onRejected);
  }
}

const fakeDb = {
  select() {
    lastQuery = new FakeQuery();
    return lastQuery;
  },
};

vi.mock("../server/db.js", () => ({ db: fakeDb }));

describe("Notifications feed ordering + filters", async () => {
  const { DatabaseStorage } = await import("../server/storage");

  it("orders newest-first with stable tie-breaker (createdAt desc, id desc)", async () => {
    const s = new DatabaseStorage();
    await s.getUserNotifications(123);

    expect(lastQuery?.fromTable).toBe(userNotifications);
    expect(lastQuery?.orderByArgs?.length).toBe(2);

    const [createdAtOrder, idOrder] = lastQuery.orderByArgs as SqlLike[];
    expect(Array.from(collectColumnNames(createdAtOrder))).toContain("created_at");
    expect(Array.from(collectColumnNames(idOrder))).toContain("id");

    expect(collectStringChunks(createdAtOrder).join("")).toContain(" desc");
    expect(collectStringChunks(idOrder).join("")).toContain(" desc");
  });

  it("applies read/type/severity filters and respects limit/offset", async () => {
    const s = new DatabaseStorage();
    await s.getUserNotifications(123, 25, 5, { read: false, type: "lead_assigned", severity: "urgent" });

    const cols = Array.from(collectColumnNames(lastQuery?.whereExpr));
    expect(cols).toEqual(expect.arrayContaining(["user_id", "read", "type", "severity"]));

    expect(lastQuery?.limitVal).toBe(25);
    expect(lastQuery?.offsetVal).toBe(5);
  });
});

