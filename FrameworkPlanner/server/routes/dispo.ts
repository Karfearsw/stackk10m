/**
 * Disposition workspace API (Phase 1).
 *
 * Mounted from server/app.ts (serve path) and server/index-vercel.ts
 * (serverless path) via registerDispositionRoutes() — NOT from
 * server/routes.ts, to avoid conflicts with the unmerged
 * freebuff/batch0-p0 branch (PR #25). After PR #25 merges, this router
 * should move inside registerRoutes() in server/routes.ts.
 *
 * All routes are agent-authenticated. Compliance gates for broadcasts
 * (consent, DNC, quiet hours) are enforced here server-side — see
 * ../disposition/compliance.ts. Every blast attempt is logged.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import {
  properties,
  dealBuyerMatches,
  lois,
  smsMessages,
  buyerCommunications,
  dealAssignments,
} from "../shared-schema.js";
import {
  DISPO_STAGES,
  DISPO_ACTIVE_STAGES,
  isDispoStage,
  isOfferStatus,
  canTransitionOfferStatus,
  canTransitionOpportunityStage,
  isValidStage,
  type DispoStage,
  type OpportunityStage,
} from "../../shared/dispo-stages.js";
import {
  buyerChannelEligibility,
  isWithinQuietHours,
  personalizeBlastMessage,
  planBlastRecipients,
  timeZoneForState,
  type BlastBuyer,
  type BlastChannel,
} from "../disposition/compliance.js";
import { telnyx } from "../services/telecom/telnyx-client.js";
import { sendEmail, EmailRouterError } from "../services/messaging/email-router.js";

/** Local auth mirror of routes.ts requireAuth (routes.ts is not editable). */
async function requireDispoAuth(req: Request, res: Response) {
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

const DISPO_STAGE_LIST = [...DISPO_STAGES] as string[];

function daysBetween(from: Date | string | null | undefined, to: Date): number {
  if (!from) return 0;
  const ms = to.getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(n: number | null): string {
  if (n === null) return "";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Shape a property row into a kanban card payload. */
function toDealCard(p: any, matchCount: number) {
  const asking =
    toNumberOrNull(p.targetDispositionPrice) ??
    toNumberOrNull(p.askingPrice) ??
    toNumberOrNull(p.price);
  const contractPrice = toNumberOrNull(p.price);
  const assignmentFee =
    asking !== null && contractPrice !== null && asking > contractPrice
      ? asking - contractPrice
      : null;
  const anchor =
    p.stageChangedAt ?? p.updatedAt ?? p.createdAt ?? new Date();
  return {
    id: p.id,
    address: p.address,
    city: p.city,
    state: p.state,
    zipCode: p.zipCode,
    beds: p.beds ?? null,
    baths: p.baths ?? null,
    sqft: p.sqft ?? null,
    propertyType: p.propertyType ?? null,
    image: Array.isArray(p.images) && p.images.length ? p.images[0] : null,
    stage: p.stage,
    stageChangedAt: p.stageChangedAt ?? null,
    daysInStage: daysBetween(anchor, new Date()),
    askingPrice: asking,
    assignmentFee,
    matchCount,
  };
}

export function registerDispositionRoutes(app: Express) {
  // ------------------------------------------------------------------
  // GET /api/disposition/deals — kanban board data
  // ------------------------------------------------------------------
  app.get("/api/disposition/deals", async (req: Request, res: Response) => {
    try {
      const user = await requireDispoAuth(req, res);
      if (!user) return;

      const rows = await db
        .select()
        .from(properties)
        .where(inArray(properties.stage, DISPO_STAGE_LIST))
        .orderBy(desc(properties.stageChangedAt));

      const ids = rows.map((r: any) => r.id);
      const counts = new Map<number, number>();
      if (ids.length > 0) {
        const countRows = await db
          .select({
            propertyId: dealBuyerMatches.propertyId,
            count: sql<number>`count(*)`,
          })
          .from(dealBuyerMatches)
          .where(inArray(dealBuyerMatches.propertyId, ids))
          .groupBy(dealBuyerMatches.propertyId);
        for (const cr of countRows) {
          counts.set(Number(cr.propertyId), Number(cr.count));
        }
      }

      res.json({
        deals: rows.map((r: any) => toDealCard(r, counts.get(r.id) ?? 0)),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ------------------------------------------------------------------
  // PATCH /api/disposition/deals/:id/stage — kanban drag-and-drop persist
  // ------------------------------------------------------------------
  app.patch(
    "/api/disposition/deals/:id/stage",
    async (req: Request, res: Response) => {
      try {
        const user = await requireDispoAuth(req, res);
        if (!user) return;
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id)) {
          return res.status(400).json({ message: "Invalid deal id" });
        }
        const stage = (req.body as any)?.stage;
        if (!isDispoStage(stage)) {
          return res.status(400).json({
            message: `Invalid disposition stage. Must be one of: ${DISPO_STAGES.join(", ")}`,
          });
        }
        const before = await storage.getPropertyById(id);
        if (!before) {
          return res.status(404).json({ message: "Deal not found" });
        }
        // Canonical transition rules (shared/pipeline-stages.ts): dead/voided
        // are terminal — a dead deal leaves the board only via a new record.
        const oldStage = String((before as any).stage || "lead");
        if (
          isValidStage(oldStage) &&
          !canTransitionOpportunityStage(
            oldStage as OpportunityStage,
            stage as DispoStage,
          )
        ) {
          return res.status(400).json({
            message: `Cannot transition from '${oldStage}' to '${stage}'`,
          });
        }
        // Mirrors the main opportunity stage endpoint: killing a deal needs a reason.
        if (stage === "dead" && !String((req.body as any)?.notes ?? "").trim()) {
          return res.status(400).json({
            message:
              "A reason is required to move to 'dead'. Add notes describing why the deal died.",
          });
        }
        const updated = await storage.updateProperty(id, {
          stage: stage as DispoStage,
          stageChangedAt: new Date(),
          lastActivityAt: new Date(),
        } as any);
        res.json({ ok: true, deal: toDealCard(updated, 0) });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    },
  );

  // ------------------------------------------------------------------
  // GET /api/disposition/deals/:id — single deal
  // ------------------------------------------------------------------
  app.get("/api/disposition/deals/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireDispoAuth(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      const property = await storage.getPropertyById(id);
      if (!property) {
        return res.status(404).json({ message: "Deal not found" });
      }
      const matchRows = await storage.getDealBuyerMatches(id, 1);
      res.json({
        deal: {
          ...toDealCard(property, 0),
          askingPriceRaw: (property as any).askingPrice ?? null,
          targetDispositionPrice:
            (property as any).targetDispositionPrice ?? null,
          arv: (property as any).arv ?? null,
          repairCost: (property as any).repairCost ?? null,
          images: (property as any).images ?? [],
          notes: (property as any).notes ?? null,
        },
        hasMatches: matchRows.length > 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/disposition/deals/:id/matches — top matched buyers + reasons
  // ------------------------------------------------------------------
  app.get(
    "/api/disposition/deals/:id/matches",
    async (req: Request, res: Response) => {
      try {
        const user = await requireDispoAuth(req, res);
        if (!user) return;
        const id = parseInt(req.params.id, 10);
        const property = await storage.getPropertyById(id);
        if (!property) {
          return res.status(404).json({ message: "Deal not found" });
        }
        const limit = Math.min(
          50,
          Math.max(1, parseInt(String((req.query as any)?.limit ?? "10"), 10) || 10),
        );
        const matches = await storage.getDealBuyerMatches(id, limit);
        const out: any[] = [];
        for (const m of matches) {
          const buyer = await storage.getBuyerById((m as any).buyerId);
          if (!buyer) continue;
          const rawScore = Number((m as any).score) || 0;
          out.push({
            buyerId: buyer.id,
            name: buyer.name,
            company: buyer.company ?? null,
            phone: buyer.phone ?? null,
            email: buyer.email ?? null,
            // Stored ×1000 by the recompute route; normalize to 0–100.
            score: Math.max(0, Math.min(100, Math.round(rawScore / 10))),
            reasons: Array.isArray((m as any).reasons)
              ? (m as any).reasons
              : [],
            computedAt: (m as any).computedAt ?? null,
            smsConsent: buyer.smsConsent ?? null,
            emailConsent: buyer.emailConsent ?? null,
            doNotCall: buyer.doNotCall ?? false,
          });
        }
        res.json({ dealId: id, matches: out });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    },
  );

  // ------------------------------------------------------------------
  // Offers tracker (backed by the lois table)
  // ------------------------------------------------------------------
  app.get(
    "/api/disposition/deals/:id/offers",
    async (req: Request, res: Response) => {
      try {
        const user = await requireDispoAuth(req, res);
        if (!user) return;
        const id = parseInt(req.params.id, 10);
        const property = await storage.getPropertyById(id);
        if (!property) {
          return res.status(404).json({ message: "Deal not found" });
        }
        const rows = await db
          .select()
          .from(lois)
          .where(eq(lois.propertyId, id))
          .orderBy(desc(lois.createdAt));
        res.json({ dealId: id, offers: rows });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/disposition/deals/:id/offers",
    async (req: Request, res: Response) => {
      try {
        const user = await requireDispoAuth(req, res);
        if (!user) return;
        const id = parseInt(req.params.id, 10);
        const property = await storage.getPropertyById(id);
        if (!property) {
          return res.status(404).json({ message: "Deal not found" });
        }
        const body = (req.body ?? {}) as any;
        let buyerName = String(body.buyerName ?? "").trim();
        let buyerId: number | null = null;
        if (body.buyerId !== undefined && body.buyerId !== null) {
          buyerId = Number(body.buyerId);
          const buyer = await storage.getBuyerById(buyerId);
          if (!buyer) {
            return res.status(404).json({ message: "Buyer not found" });
          }
          buyerName = buyer.name;
        }
        if (!buyerName) {
          return res
            .status(400)
            .json({ message: "buyerName or buyerId is required" });
        }
        const amount = toNumberOrNull(body.amount);
        if (amount === null || amount <= 0) {
          return res
            .status(400)
            .json({ message: "A positive offer amount is required" });
        }
        const status = body.status ?? "verbal";
        if (!isOfferStatus(status)) {
          return res.status(400).json({
            message:
              "Invalid offer status. Must be one of: verbal, loi_sent, accepted, dead",
          });
        }
        const earnest = toNumberOrNull(body.earnestMoney);
        const loi = await storage.createLoi({
          propertyId: id,
          buyerName,
          sellerName: String(body.sellerName ?? "Ocean Luxe").trim() || "Ocean Luxe",
          offerAmount: String(amount),
          earnestMoney: earnest !== null ? String(earnest) : null,
          closingDate: body.closingDate ? new Date(body.closingDate) : null,
          contingencies: Array.isArray(body.contingencies)
            ? body.contingencies.map(String)
            : [],
          specialTerms: body.specialTerms ? String(body.specialTerms) : null,
          status,
          sentDate: status === "loi_sent" ? new Date() : null,
          content: buyerId ? `buyerId:${buyerId}` : null,
        } as any);
        res.status(201).json({ ok: true, offer: loi });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    },
  );

  app.patch(
    "/api/disposition/offers/:offerId",
    async (req: Request, res: Response) => {
      try {
        const user = await requireDispoAuth(req, res);
        if (!user) return;
        const offerId = parseInt(req.params.offerId, 10);
        if (!Number.isFinite(offerId)) {
          return res.status(400).json({ message: "Invalid offer id" });
        }
        const rows = await db
          .select()
          .from(lois)
          .where(eq(lois.id, offerId))
          .limit(1);
        const existing = rows[0] as any;
        if (!existing) {
          return res.status(404).json({ message: "Offer not found" });
        }
        const next = (req.body as any)?.status;
        if (!isOfferStatus(next)) {
          return res.status(400).json({
            message:
              "Invalid offer status. Must be one of: verbal, loi_sent, accepted, dead",
          });
        }
        if (!canTransitionOfferStatus(existing.status, next)) {
          return res.status(400).json({
            message: `Invalid offer transition: ${existing.status ?? "unknown"} → ${next}`,
          });
        }
        const patch: any = { status: next };
        if (next === "loi_sent" && !existing.sentDate) {
          patch.sentDate = new Date();
        }
        if ((next === "accepted" || next === "dead") && !existing.responseDate) {
          patch.responseDate = new Date();
        }
        const updated = await storage.updateLoi(offerId, patch);
        res.json({ ok: true, offer: updated });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    },
  );

  // ------------------------------------------------------------------
  // POST /api/disposition/deals/:id/blast — compliant broadcast
  //
  // Compliance gates are enforced server-side for every recipient:
  //   1. doNotCall → hard suppress (all channels)
  //   2. smsConsent / emailConsent per channel
  //   3. phone / email present
  //   4. quiet hours 8am–9pm in the deal's property timezone
  // Every attempt (sent / failed / suppressed) is logged.
  // ------------------------------------------------------------------
  app.post(
    "/api/disposition/deals/:id/blast",
    async (req: Request, res: Response) => {
      try {
        const user = await requireDispoAuth(req, res);
        if (!user) return;
        const id = parseInt(req.params.id, 10);
        const property: any = await storage.getPropertyById(id);
        if (!property) {
          return res.status(404).json({ message: "Deal not found" });
        }

        const body = (req.body ?? {}) as any;
        const channel = body.channel as BlastChannel;
        if (channel !== "sms" && channel !== "email") {
          return res
            .status(400)
            .json({ message: 'channel must be "sms" or "email"' });
        }
        const message = String(body.message ?? "").trim();
        if (!message) {
          return res.status(400).json({ message: "message is required" });
        }
        const subject = String(body.subject ?? "").trim();
        if (channel === "email" && !subject) {
          return res
            .status(400)
            .json({ message: "subject is required for email blasts" });
        }
        const minScoreRaw = Number(body.minScore ?? 0);
        const minScore = Number.isFinite(minScoreRaw)
          ? Math.max(0, Math.min(100, minScoreRaw))
          : 0;

        // Build the candidate pool: explicit buyerIds, or matched buyers
        // above the score threshold.
        const scoreByBuyer = new Map<number, number>();
        let pool: BlastBuyer[] = [];
        if (Array.isArray(body.buyerIds) && body.buyerIds.length > 0) {
          const uniqueIds = [
            ...new Set((body.buyerIds as unknown[]).map((v) => Number(v))),
          ].filter((n): n is number => Number.isFinite(n));
          for (const buyerId of uniqueIds.slice(0, 200)) {
            const buyer: any = await storage.getBuyerById(buyerId);
            if (buyer) {
              pool.push(buyer);
              scoreByBuyer.set(buyer.id, 100);
            }
          }
        } else {
          const matches = await storage.getDealBuyerMatches(id, 100);
          for (const m of matches as any[]) {
            const score = Math.max(
              0,
              Math.min(100, Math.round((Number(m.score) || 0) / 10)),
            );
            if (score < minScore) continue;
            const buyer: any = await storage.getBuyerById(m.buyerId);
            if (!buyer) continue;
            pool.push(buyer);
            scoreByBuyer.set(buyer.id, score);
          }
        }

        const now = new Date();
        const timeZone = timeZoneForState(property.state);
        const plan = planBlastRecipients(
          pool.map((buyer) => ({
            buyer,
            score: scoreByBuyer.get(buyer.id) ?? 0,
          })),
          { channel, minScore, now, timeZone, maxRecipients: 100 },
        );

        const asking =
          toNumberOrNull(property.targetDispositionPrice) ??
          toNumberOrNull(property.askingPrice) ??
          toNumberOrNull(property.price);

        const sent: { buyerId: number; name: string }[] = [];
        const failed: { buyerId: number; name: string; error: string }[] = [];

        for (const { buyer } of plan.eligible) {
          const firstName = String(buyer.name ?? "").trim().split(/\s+/)[0] || "";
          const personalized = personalizeBlastMessage(message, {
            name: buyer.name ?? "",
            firstName,
            address: property.address ?? "",
            city: property.city ?? "",
            state: property.state ?? "",
            zip: property.zipCode ?? "",
            price: formatMoney(asking),
            beds: property.beds ?? "",
            baths: property.baths ?? "",
            sqft: property.sqft ?? "",
            company: (buyer as any).company ?? "Ocean Luxe",
          });

          if (channel === "sms") {
            const to = String(buyer.phone ?? "").trim();
            try {
              const { messageId } = await telnyx.sendSms({
                to,
                body: personalized,
              });
              await storage.createSmsMessage({
                userId: user.id,
                buyerId: buyer.id,
                direction: "outbound",
                toNumber: to,
                body: personalized,
                status: "sent",
                providerMessageId: messageId,
                metadata: JSON.stringify({
                  blast: true,
                  dealId: id,
                  channel: "sms",
                  compliance: "passed",
                }),
              });
              sent.push({ buyerId: buyer.id, name: buyer.name ?? "" });
            } catch (err: any) {
              const errMsg = String(err?.message ?? err ?? "send failed");
              try {
                await storage.createSmsMessage({
                  userId: user.id,
                  buyerId: buyer.id,
                  direction: "outbound",
                  toNumber: to,
                  body: personalized,
                  status: "failed",
                  metadata: JSON.stringify({
                    blast: true,
                    dealId: id,
                    channel: "sms",
                    compliance: "passed",
                    error: errMsg,
                  }),
                });
              } catch {}
              failed.push({
                buyerId: buyer.id,
                name: buyer.name ?? "",
                error: errMsg,
              });
            }
          } else {
            const to = String(buyer.email ?? "").trim();
            try {
              const result = await sendEmail({
                to,
                subject,
                text: personalized,
              });
              await storage.createBuyerCommunication({
                buyerId: buyer.id,
                userId: user.id,
                type: "email",
                subject,
                content:
                  `[dispo blast · sent · ${now.toISOString()} · provider=${result.provider}]\n\n` +
                  personalized,
                direction: "outbound",
              });
              sent.push({ buyerId: buyer.id, name: buyer.name ?? "" });
            } catch (err: any) {
              const errMsg =
                err instanceof EmailRouterError
                  ? `${err.blocker.code}: ${err.blocker.message}`
                  : String(err?.message ?? err ?? "send failed");
              try {
                await storage.createBuyerCommunication({
                  buyerId: buyer.id,
                  userId: user.id,
                  type: "email",
                  subject,
                  content:
                    `[dispo blast · FAILED · ${now.toISOString()} · error=${errMsg}]\n\n` +
                    personalized,
                  direction: "outbound",
                });
              } catch {}
              failed.push({
                buyerId: buyer.id,
                name: buyer.name ?? "",
                error: errMsg,
              });
            }
          }
        }

        // Log suppressed recipients too — compliance decisions are auditable.
        for (const s of plan.suppressed) {
          const reasonStr = s.reasons.join(",");
          try {
            if (channel === "sms") {
              await storage.createSmsMessage({
                userId: user.id,
                buyerId: s.buyer.id,
                direction: "outbound",
                toNumber: String(s.buyer.phone ?? ""),
                body: message,
                status: "suppressed",
                metadata: JSON.stringify({
                  blast: true,
                  dealId: id,
                  channel: "sms",
                  compliance: "suppressed",
                  reasons: s.reasons,
                }),
              });
            } else {
              await storage.createBuyerCommunication({
                buyerId: s.buyer.id,
                userId: user.id,
                type: "email",
                subject,
                content:
                  `[dispo blast · SUPPRESSED · ${now.toISOString()} · reasons=${reasonStr}]\n\n` +
                  message,
                direction: "outbound",
              });
            }
          } catch {}
        }

        res.json({
          ok: true,
          dealId: id,
          channel,
          sentCount: sent.length,
          sent,
          failed,
          suppressed: plan.suppressed.map((s) => ({
            buyerId: s.buyer.id,
            name: s.buyer.name ?? "",
            score: s.score,
            reasons: s.reasons,
          })),
          quietHours: {
            timeZone: plan.timeZone,
            withinWindow: plan.withinQuietHours,
          },
        });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    },
  );

  // ------------------------------------------------------------------
  // GET /api/disposition/metrics — metrics strip
  // ------------------------------------------------------------------
  app.get("/api/disposition/metrics", async (req: Request, res: Response) => {
    try {
      const user = await requireDispoAuth(req, res);
      if (!user) return;
      const now = new Date();

      // Active deals + avg days in dispo stages.
      const activeRows = (await db
        .select({
          stageChangedAt: properties.stageChangedAt,
          createdAt: properties.createdAt,
          updatedAt: properties.updatedAt,
        })
        .from(properties)
        .where(
          inArray(properties.stage, [...DISPO_ACTIVE_STAGES] as string[]),
        )) as any[];
      const activeDeals = activeRows.length;
      const dayCounts = activeRows.map((r) =>
        daysBetween(r.stageChangedAt ?? r.updatedAt ?? r.createdAt, now),
      );
      const avgDaysToAssign =
        dayCounts.length > 0
          ? Math.round(
              (dayCounts.reduce((a, b) => a + b, 0) / dayCounts.length) * 10,
            ) / 10
          : 0;

      // Assignment revenue MTD (payouts actually received).
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const payoutRows = (await db
        .select({ payoutAmount: dealAssignments.payoutAmount })
        .from(dealAssignments)
        .where(
          and(
            eq(dealAssignments.payoutReceived, true),
            gte(dealAssignments.createdAt, monthStart),
          ),
        )) as any[];
      const assignmentRevenueMTD = payoutRows.reduce(
        (sum, r) => sum + (toNumberOrNull(r.payoutAmount) ?? 0),
        0,
      );

      // Blast response rate, trailing 30 days: inbound SMS from buyers who
      // received a blast SMS, divided by blast SMS sent.
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
      const blastSentRows = (await db
        .select({
          id: smsMessages.id,
          buyerId: smsMessages.buyerId,
        })
        .from(smsMessages)
        .where(
          and(
            eq(smsMessages.direction, "outbound"),
            eq(smsMessages.status, "sent"),
            gte(smsMessages.createdAt, thirtyDaysAgo),
            sql`${smsMessages.metadata} LIKE '%"blast":true%'`,
          ),
        )) as any[];
      const blastBuyerIds = [
        ...new Set(
          blastSentRows
            .map((r) => Number(r.buyerId))
            .filter((n) => Number.isFinite(n)),
        ),
      ];
      let blastResponseRate: number | null = null;
      if (blastSentRows.length > 0 && blastBuyerIds.length > 0) {
        const replyRows = (await db
          .select({ id: smsMessages.id })
          .from(smsMessages)
          .where(
            and(
              eq(smsMessages.direction, "inbound"),
              gte(smsMessages.createdAt, thirtyDaysAgo),
              inArray(smsMessages.buyerId, blastBuyerIds),
            ),
          )) as any[];
        blastResponseRate =
          Math.round((replyRows.length / blastSentRows.length) * 1000) / 10;
      }

      res.json({
        activeDeals,
        avgDaysToAssign,
        assignmentRevenueMTD,
        blastResponseRate,
        blastsSent30d: blastSentRows.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/disposition/templates — assignment agreement templates
  // ------------------------------------------------------------------
  app.get("/api/disposition/templates", async (req: Request, res: Response) => {
    try {
      const user = await requireDispoAuth(req, res);
      if (!user) return;
      const templates = await storage.getContractTemplates({ limit: 50 });
      res.json({
        templates: (templates || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          category: t.category ?? null,
          status: t.status ?? null,
          version: t.version ?? null,
          mergeFields: t.mergeFields ?? [],
        })),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ------------------------------------------------------------------
  // GET /api/disposition/deals/:id/envelope — e-sign status (placeholder)
  //
  // The self-built e-sign module is being built in parallel. This endpoint
  // intentionally returns a not_started placeholder so the Docs panel has a
  // stable contract to render against; envelope creation/lifecycle will be
  // wired here when the e-sign module lands.
  // ------------------------------------------------------------------
  app.get(
    "/api/disposition/deals/:id/envelope",
    async (req: Request, res: Response) => {
      try {
        const user = await requireDispoAuth(req, res);
        if (!user) return;
        const id = parseInt(req.params.id, 10);
        const property = await storage.getPropertyById(id);
        if (!property) {
          return res.status(404).json({ message: "Deal not found" });
        }
        res.json({
          dealId: id,
          envelope: null,
          envelopeStatus: "not_started",
          message:
            "E-sign module is being built in parallel — envelope creation and status will be wired here when it lands.",
        });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    },
  );
}
