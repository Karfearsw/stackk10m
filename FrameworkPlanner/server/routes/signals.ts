/**
 * Municipal distress-signal ingestion API (Phase 1 of free-tool build plan).
 *
 * Stacks code violations, tax delinquency, vacancy, court filings, permits,
 * water shutoffs, fire damage, evictions on a parcel key for timeline view.
 *
 * Mounted from server/app.ts via registerSignalRoutes().
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  distressSignals,
  parcelWatchlist,
  parcelKeyFor,
  SIGNAL_TYPES,
  SIGNAL_SEVERITIES,
} from "../shared-schema.js";
import { onSignalCreated } from "./automation.js";

async function requireAuth(req: Request, res: Response) {
  const userId = (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const user = await storage.getUserByIdWithoutProfilePicture(userId);
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return user;
}

const VALID_TYPES = new Set<string>(SIGNAL_TYPES as unknown as string[]);
const VALID_SEVERITIES = new Set<string>(SIGNAL_SEVERITIES as unknown as string[]);

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function registerSignalRoutes(app: Express) {
  // ── List signals with filters ──────────────────────────────────────────
  app.get("/api/distress-signals", async (req: Request, res: Response) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const { type, severity, parcelKey, search, limit = "100", offset = "0" } = req.query as Record<string, string>;
      const conds: any[] = [];
      if (type && VALID_TYPES.has(type)) conds.push(eq(distressSignals.signalType, type));
      if (severity && VALID_SEVERITIES.has(severity)) conds.push(eq(distressSignals.severity, severity));
      if (parcelKey) conds.push(eq(distressSignals.parcelKey, parcelKey));
      if (search) {
        const s = `%${search}%`;
        conds.push(or(ilike(distressSignals.title, s), ilike(distressSignals.description, s), ilike(distressSignals.parcelKey, s)));
      }
      const rows = await db
        .select()
        .from(distressSignals)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(distressSignals.occurredAt), desc(distressSignals.createdAt))
        .limit(Math.min(Number(limit) || 100, 500))
        .offset(Number(offset) || 0);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(distressSignals)
        .where(conds.length ? and(...conds) : undefined);
      res.json({ signals: rows, total: count });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to list signals" });
    }
  });

  // ── Create a single signal ─────────────────────────────────────────────
  app.post("/api/distress-signals", async (req: Request, res: Response) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const b = req.body || {};
      if (!VALID_TYPES.has(b.signalType)) return res.status(400).json({ message: "Invalid signalType" });
      const severity = VALID_SEVERITIES.has(b.severity) ? b.severity : "info";
      if (!b.title || !b.source) return res.status(400).json({ message: "title and source are required" });

      // Resolve parcel key from explicit key or address parts
      let parcelKey: string = (b.parcelKey || "").trim();
      let watchlistId: number | null = toInt(b.watchlistId);
      if (!parcelKey && b.address && b.city && b.state && b.zipCode) {
        parcelKey = parcelKeyFor(b.address, b.city, b.state, b.zipCode);
      }
      if (!parcelKey) return res.status(400).json({ message: "parcelKey or address/city/state/zipCode required" });

      // Auto-create / reuse watchlist entry
      if (!watchlistId && b.address) {
        const [existing] = await db.select().from(parcelWatchlist).where(eq(parcelWatchlist.parcelKey, parcelKey)).limit(1);
        if (existing) {
          watchlistId = existing.id;
        } else if (b.address && b.city && b.state && b.zipCode) {
          const [created] = await db.insert(parcelWatchlist).values({
            parcelKey,
            address: b.address,
            city: b.city,
            state: b.state,
            zipCode: b.zipCode,
            apn: b.apn || null,
            ownerName: b.ownerName || null,
            createdBy: user.id,
          }).returning();
          watchlistId = created.id;
        }
      }

      const [row] = await db.insert(distressSignals).values({
        parcelKey,
        watchlistId,
        leadId: toInt(b.leadId),
        signalType: b.signalType,
        severity,
        title: String(b.title).slice(0, 255),
        description: b.description || null,
        source: String(b.source).slice(0, 100),
        sourceUrl: b.sourceUrl || null,
        occurredAt: b.occurredAt || null,
        rawData: b.rawData || null,
        createdBy: user.id,
      }).returning();
      onSignalCreated(row).catch(() => {});
      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to create signal" });
    }
  });

  // ── Bulk CSV import ────────────────────────────────────────────────────
  // Expects JSON body: { rows: [{signalType, severity?, title, description?, source, sourceUrl?, occurredAt?, address, city, state, zipCode, apn?, ownerName?}] }
  app.post("/api/distress-signals/import", async (req: Request, res: Response) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!rows.length) return res.status(400).json({ message: "No rows provided" });
      if (rows.length > 2000) return res.status(400).json({ message: "Max 2000 rows per import" });

      let created = 0, skipped = 0;
      const errors: { row: number; error: string }[] = [];
      // Cache watchlist ids per parcel key within this import
      const wlCache = new Map<string, number>();

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        try {
          if (!VALID_TYPES.has(r.signalType)) throw new Error(`invalid signalType '${r.signalType}'`);
          if (!r.title || !r.source) throw new Error("title and source required");
          if (!r.address || !r.city || !r.state || !r.zipCode) throw new Error("address/city/state/zipCode required");
          const parcelKey = parcelKeyFor(r.address, r.city, r.state, r.zipCode);

          let watchlistId = wlCache.get(parcelKey) ?? null;
          if (!watchlistId) {
            const [existing] = await db.select().from(parcelWatchlist).where(eq(parcelWatchlist.parcelKey, parcelKey)).limit(1);
            if (existing) watchlistId = existing.id;
            else {
              const [createdWl] = await db.insert(parcelWatchlist).values({
                parcelKey,
                address: r.address, city: r.city, state: r.state, zipCode: r.zipCode,
                apn: r.apn || null, ownerName: r.ownerName || null, createdBy: user.id,
              }).returning();
              watchlistId = createdWl.id;
            }
            wlCache.set(parcelKey, watchlistId);
          }

          await db.insert(distressSignals).values({
            parcelKey,
            watchlistId,
            signalType: r.signalType,
            severity: VALID_SEVERITIES.has(r.severity) ? r.severity : "info",
            title: String(r.title).slice(0, 255),
            description: r.description || null,
            source: String(r.source).slice(0, 100),
            sourceUrl: r.sourceUrl || null,
            occurredAt: r.occurredAt || null,
            rawData: r.rawData || null,
            createdBy: user.id,
          });
          created++;
        } catch (e: any) {
          skipped++;
          errors.push({ row: i + 1, error: e.message || "unknown" });
        }
      }
      res.json({ created, skipped, total: rows.length, errors: errors.slice(0, 50) });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Import failed" });
    }
  });

  // ── Parcel timeline: all signals for one parcel, newest first ──────────
  app.get("/api/parcels/timeline", async (req: Request, res: Response) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const { parcelKey, address, city, state, zipCode } = req.query as Record<string, string>;
      let key = (parcelKey || "").trim();
      if (!key && address && city && state && zipCode) key = parcelKeyFor(address, city, state, zipCode);
      if (!key) return res.status(400).json({ message: "parcelKey or address/city/state/zipCode required" });

      const [parcel] = await db.select().from(parcelWatchlist).where(eq(parcelWatchlist.parcelKey, key)).limit(1);
      const signals = await db.select().from(distressSignals)
        .where(eq(distressSignals.parcelKey, key))
        .orderBy(desc(distressSignals.occurredAt), desc(distressSignals.createdAt));
      // Distress score: weighted count — critical 4, alert 3, watch 2, info 1
      const weights: Record<string, number> = { critical: 4, alert: 3, watch: 2, info: 1 };
      const score = signals.reduce((s, sig: any) => s + (weights[sig.severity] || 1), 0);
      const byType: Record<string, number> = {};
      for (const sig of signals as any[]) byType[sig.signalType] = (byType[sig.signalType] || 0) + 1;
      res.json({ parcel, signals, score, signalCount: signals.length, byType });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to load timeline" });
    }
  });

  // ── Watchlist CRUD ─────────────────────────────────────────────────────
  app.get("/api/parcel-watchlist", async (req: Request, res: Response) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const { search, limit = "100", offset = "0" } = req.query as Record<string, string>;
      const conds: any[] = [];
      if (search) {
        const s = `%${search}%`;
        conds.push(or(ilike(parcelWatchlist.address, s), ilike(parcelWatchlist.city, s), ilike(parcelWatchlist.ownerName, s)));
      }
      const rows = await db.select().from(parcelWatchlist)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(parcelWatchlist.updatedAt))
        .limit(Math.min(Number(limit) || 100, 500))
        .offset(Number(offset) || 0);
      // Attach signal counts
      const withCounts = await Promise.all(rows.map(async (p: any) => {
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
          .from(distressSignals).where(eq(distressSignals.parcelKey, p.parcelKey));
        return { ...p, signalCount: count };
      }));
      res.json({ parcels: withCounts });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to list watchlist" });
    }
  });

  app.post("/api/parcel-watchlist", async (req: Request, res: Response) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const b = req.body || {};
      if (!b.address || !b.city || !b.state || !b.zipCode)
        return res.status(400).json({ message: "address/city/state/zipCode required" });
      const key = parcelKeyFor(b.address, b.city, b.state, b.zipCode);
      const [existing] = await db.select().from(parcelWatchlist).where(eq(parcelWatchlist.parcelKey, key)).limit(1);
      if (existing) return res.json(existing);
      const [row] = await db.insert(parcelWatchlist).values({
        parcelKey: key,
        address: b.address, city: b.city, state: b.state, zipCode: b.zipCode,
        apn: b.apn || null, ownerName: b.ownerName || null, notes: b.notes || null,
        createdBy: user.id,
      }).returning();
      res.status(201).json(row);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to add parcel" });
    }
  });

  app.delete("/api/distress-signals/:id", async (req: Request, res: Response) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid id" });
      await db.delete(distressSignals).where(eq(distressSignals.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to delete signal" });
    }
  });
}
