/**
 * Deal Matchroom backend (Phase 13 mutual match + Deal Room, Phase 14
 * structured offers).
 *
 * Mount: the coordinator mounts this router the same way as the investor
 * portal router (AFTER registerRoutes, so /api session + JWT middleware
 * already applies). This module does NOT mount itself.
 *
 * Auth model: two separate guards.
 *  - requireInvestor: investor portal session (session.investorUserId),
 *    role=investor, investor_status=active, is_active true.
 *  - requireAdmin: agent CRM session (session.userId) with an admin-ish
 *    role (super admin / admin / owner / manager). Admin actions represent
 *    the OceanLuxe owner/team side: approving interests (owner approve),
 *    viewing offers, countering, accepting, rejecting.
 *
 * Rules enforced here:
 *  - Interest is a RECORD, never a contract. The lifecycle status is stored
 *    per (investor, property) in deal_interests.
 *  - Offers are NEVER auto-created from interest. A draft requires explicit
 *    investor action; submit requires an explicit confirmation flag and only
 *    from a mutual-match deal room.
 *  - offer_versions rows are immutable snapshots: a counteroffer creates a
 *    NEW offers row (parent_offer_id), never an overwrite.
 */
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { InvestorError } from "./service.js";

// --- lifecycle enums (mirror migrations/0099_dealrooms_offers.sql) ---

export const INTEREST_STATUSES = [
  "available", "viewed", "saved", "passed", "interested", "owner_review",
  "mutual_match", "due_diligence", "offer_submitted", "negotiating",
  "offer_accepted", "contract_sent", "fully_executed", "locked_up",
  "closing", "closed",
] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export const OFFER_STATUSES = [
  "draft", "submitted", "viewed", "countered", "accepted", "rejected",
  "withdrawn", "expired", "converted_to_contract",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

// Investor-side transitions (before the owner gets involved).
const INVESTOR_TRANSITIONS: Record<string, InterestStatus[]> = {
  available: ["viewed", "saved", "passed", "interested"],
  viewed: ["saved", "passed", "interested"],
  saved: ["viewed", "passed", "interested", "available"],
  passed: ["viewed", "saved", "interested"],
  interested: ["passed"],
  owner_review: ["passed"],
};

// Timestamp column per interest status.
const INTEREST_TS: Partial<Record<InterestStatus, string>> = {
  viewed: "viewed_at",
  saved: "saved_at",
  passed: "passed_at",
  interested: "interested_at",
  owner_review: "owner_review_at",
  mutual_match: "matched_at",
};

// Owner-side transitions for the interest record.
const OWNER_TRANSITIONS: Record<string, InterestStatus[]> = {
  owner_review: ["mutual_match", "passed"],
  mutual_match: ["due_diligence"],
  due_diligence: ["offer_submitted"],
  offer_submitted: ["negotiating"],
  negotiating: ["offer_accepted"],
  offer_accepted: ["contract_sent"],
  contract_sent: ["fully_executed"],
  fully_executed: ["locked_up"],
  locked_up: ["closing"],
  closing: ["closed"],
};

// Owner-side offer transitions.
const OFFER_OWNER_TRANSITIONS: Record<string, OfferStatus[]> = {
  submitted: ["viewed", "accepted", "rejected", "countered"],
  viewed: ["accepted", "rejected", "countered"],
  draft: ["accepted", "rejected"],
};
const ACTIVE_OFFER_STATUSES: OfferStatus[] = ["draft", "submitted", "viewed"];

const TERMINAL_OFFER_STATUSES: OfferStatus[] = ["accepted", "rejected", "withdrawn", "expired", "countered", "converted_to_contract"];

// --- minimal DB type (raw SQL, like the investor store) ---

type Row = Record<string, unknown>;

export type DealDb = {
  execute: (q: unknown) => Promise<unknown>;
};

export interface DealRoomsRouterDeps {
  db: DealDb;
}

interface SessionShape {
  investorUserId?: number;
  userId?: number;
}

function sessionOf(req: Request): SessionShape {
  return (req.session ?? {}) as SessionShape;
}

function sendError(res: Response, err: unknown): void {
  if (err instanceof InvestorError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  console.error("[dealrooms]", err);
  res.status(500).json({ code: "internal_error", message: "Something went wrong." });
}

async function run(db: DealDb, query: unknown): Promise<Row[]> {
  const out = (await db.execute(query)) as { rows?: Row[] } | undefined;
  return out?.rows ?? [];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fullName(r: Row): string {
  const first = str(r.first_name);
  const last = str(r.last_name);
  return [first, last].filter(Boolean).join(" ") || str(r.email) || `User #${num(r.id)}`;
}

/** Build a Postgres text[] literal, e.g. {"a","b"}. */
function pgTextArray(values: string[]): string {
  return "{" + values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",") + "}";
}

// --- guards ---

async function requireInvestor(db: DealDb, req: Request): Promise<Row> {
  const id = sessionOf(req).investorUserId;
  if (!id) throw new InvestorError(401, "unauthorized", "Investor login required.");
  const rows = await run(
    db,
    sql`SELECT id, email, first_name, last_name, role, is_active, investor_status
        FROM users WHERE id = ${id} LIMIT 1`,
  );
  const user = rows[0];
  if (!user || user.role !== "investor" || user.investor_status !== "active" || user.is_active === false) {
    throw new InvestorError(403, "investor_forbidden", "Investor access required.");
  }
  return user;
}

async function requireAdmin(db: DealDb, req: Request): Promise<Row> {
  const id = sessionOf(req).userId;
  if (!id) throw new InvestorError(401, "unauthorized", "Admin login required.");
  const rows = await run(
    db,
    sql`SELECT id, email, first_name, last_name, role, is_super_admin FROM users WHERE id = ${Number(id)} LIMIT 1`,
  );
  const user = rows[0];
  if (!user) throw new InvestorError(403, "forbidden", "Admin access required.");
  const role = String(user.role || "").toLowerCase();
  if (!(user.is_super_admin || role === "admin" || role === "owner" || role === "manager")) {
    throw new InvestorError(403, "forbidden", "Admin access required.");
  }
  return user;
}

// --- shared builders ---

function propertySummary(r: Row, forInvestor: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: num(r.id),
    address: str(r.address),
    city: str(r.city),
    state: str(r.state),
    zipCode: str(r.zip_code),
    price: num(r.price),
    beds: num(r.beds),
    baths: num(r.baths),
    sqft: num(r.sqft),
    propertyType: str(r.property_type),
    images: Array.isArray(r.images) ? (r.images as unknown[]).map(String) : [],
    arv: num(r.arv),
    repairCost: num(r.repair_cost),
    askingPrice: num(r.asking_price),
    targetDispositionPrice: num(r.target_disposition_price),
  };
  if (!forInvestor) {
    base.apn = str(r.apn);
    base.internalSummary = str(r.internal_summary);
    base.notes = str(r.notes);
    base.sourceLeadId = num(r.source_lead_id);
    base.stage = str(r.stage);
  }
  return base;
}

function offerToJson(r: Row): Record<string, unknown> {
  return {
    id: num(r.id),
    dealRoomId: num(r.deal_room_id),
    propertyId: num(r.property_id),
    investorUserId: num(r.investor_user_id),
    offerAmount: num(r.offer_amount),
    earnestMoney: num(r.earnest_money),
    financingType: str(r.financing_type),
    inspectionPeriodDays: num(r.inspection_period_days),
    closingDate: str(r.closing_date),
    dealStructure: str(r.deal_structure),
    contingencies: Array.isArray(r.contingencies) ? (r.contingencies as unknown[]).map(String) : [],
    additionalTerms: str(r.additional_terms),
    pofStorageKey: str(r.pof_storage_key),
    expirationAt: iso(r.expiration_at),
    buyerEntity: str(r.buyer_entity),
    authorizedSigner: str(r.authorized_signer),
    status: str(r.status),
    versionNumber: num(r.version_number),
    parentOfferId: num(r.parent_offer_id),
    submittedAt: iso(r.submitted_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    address: str(r.address),
    city: str(r.city),
    state: str(r.state),
  };
}

/** Append an immutable snapshot of the offer after every transition. */
async function snapshotOffer(db: DealDb, offerId: number, byUserId: number, note: string): Promise<void> {
  const rows = await run(db, sql`SELECT * FROM offers WHERE id = ${offerId} LIMIT 1`);
  const offer = rows[0];
  if (!offer) return;
  await run(
    db,
    sql`INSERT INTO offer_versions (offer_id, version_number, snapshot, created_by)
        VALUES (${offerId}, ${Number(offer.version_number)}, ${JSON.stringify({ ...offerToJson(offer), note })}::jsonb, ${byUserId})`,
  );
}

function setInterestStatus(db: DealDb, interestId: number, status: InterestStatus): Promise<Row[]> {
  const tsCol = INTEREST_TS[status];
  return run(
    db,
    sql`UPDATE deal_interests
        SET status = ${status},
            ${tsCol ? sql.raw(`${tsCol} = now(),`) : sql``}
            updated_at = now()
        WHERE id = ${interestId}
        RETURNING *`,
  );
}

async function getInterest(db: DealDb, interestId: number): Promise<Row | null> {
  const rows = await run(db, sql`SELECT * FROM deal_interests WHERE id = ${interestId} LIMIT 1`);
  return rows[0] ?? null;
}

async function isRoomParticipant(db: DealDb, roomId: number, userId: number): Promise<boolean> {
  const rows = await run(
    db,
    sql`SELECT 1 FROM deal_room_participants WHERE room_id = ${roomId} AND user_id = ${userId} LIMIT 1`,
  );
  return rows.length > 0;
}

function validateOfferBody(body: Record<string, unknown>): { ok: true } | { ok: false; message: string } {
  const amount = Number(body.offerAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "Offer amount must be greater than zero." };
  const closingDate = str(body.closingDate);
  if (!closingDate || Number.isNaN(new Date(closingDate).getTime())) {
    return { ok: false, message: "A closing date is required." };
  }
  if (!str(body.authorizedSigner)) return { ok: false, message: "An authorized signer is required." };
  const financing = str(body.financingType);
  if (financing && !["cash", "hard_money", "conventional", "other"].includes(financing)) {
    return { ok: false, message: "Invalid financing type." };
  }
  const structure = str(body.dealStructure);
  if (structure && !["assignment", "double_close"].includes(structure)) {
    return { ok: false, message: "Invalid deal structure." };
  }
  const expirationAt = str(body.expirationAt);
  if (expirationAt && Number.isNaN(new Date(expirationAt).getTime())) {
    return { ok: false, message: "Invalid expiration date." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------

export function createDealRoomsRouter(deps: DealRoomsRouterDeps): Router {
  const { db } = deps;
  const r = Router();

  const parseId = (raw: string): number => {
    const id = parseInt(raw, 10);
    if (!Number.isFinite(id)) throw new InvestorError(400, "bad_id", "Invalid id.");
    return id;
  };

  // ===================== INTERESTS (investor) =====================

  /**
   * POST /api/investor/deals/:id/interests — express interest in a deal.
   * Creates the INTEREST RECORD and moves it to owner_review (awaits the
   * owner/team decision). Idempotent: repeat calls do not duplicate.
   */
  r.post("/api/investor/deals/:id/interests", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const propertyId = parseId(req.params.id);
      const prop = await run(db, sql`SELECT id FROM properties WHERE id = ${propertyId} LIMIT 1`);
      if (!prop.length) throw new InvestorError(404, "not_found", "Deal not found.");

      const existing = await run(
        db,
        sql`SELECT * FROM deal_interests WHERE investor_user_id = ${user.id} AND property_id = ${propertyId} LIMIT 1`,
      );
      if (existing.length) {
        const cur = String(existing[0].status);
        if (["owner_review", "mutual_match", "due_diligence", "offer_submitted", "negotiating", "offer_accepted", "contract_sent", "fully_executed", "locked_up", "closing", "closed"].includes(cur)) {
          return res.json({ interest: existing[0], already: true });
        }
        const rows = await run(
          db,
          sql`UPDATE deal_interests
              SET status = 'owner_review', interested_at = COALESCE(interested_at, now()),
                  owner_review_at = now(), updated_at = now()
              WHERE id = ${existing[0].id} RETURNING *`,
        );
        return res.status(201).json({ interest: rows[0] });
      }
      const rows = await run(
        db,
        sql`INSERT INTO deal_interests (investor_user_id, property_id, status, interested_at, owner_review_at)
            VALUES (${user.id}, ${propertyId}, 'owner_review', now(), now())
            RETURNING *`,
      );
      res.status(201).json({ interest: rows[0] });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** GET /api/investor/interests — my interest records with property summary. */
  r.get("/api/investor/interests", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const rows = await run(
        db,
        sql`SELECT i.*, p.address, p.city, p.state, p.zip_code, p.price, p.beds, p.baths,
                    p.sqft, p.property_type, p.images, p.arv, p.repair_cost,
                    p.asking_price, p.target_disposition_price,
                    dr.id AS room_id
             FROM deal_interests i
             JOIN properties p ON p.id = i.property_id
             LEFT JOIN deal_rooms dr ON dr.property_id = i.property_id
             WHERE i.investor_user_id = ${user.id}
             ORDER BY i.updated_at DESC`,
      );
      res.json({
        interests: rows.map((x) => ({
          id: num(x.id),
          propertyId: num(x.property_id),
          status: str(x.status),
          createdAt: iso(x.created_at),
          updatedAt: iso(x.updated_at),
          roomId: num(x.room_id),
          property: propertySummary(x, true),
        })),
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /**
   * PATCH /api/investor/interests/:id — investor-side moves only
   * (viewed / saved / passed, or withdraw from review).
   */
  r.patch("/api/investor/interests/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const interest = await getInterest(db, parseId(req.params.id));
      if (!interest || Number(interest.investor_user_id) !== Number(user.id)) {
        throw new InvestorError(404, "not_found", "Interest not found.");
      }
      const target = String(req.body?.status ?? "") as InterestStatus;
      if (!INTEREST_STATUSES.includes(target)) {
        throw new InvestorError(400, "bad_status", "Unknown status.");
      }
      const allowed = INVESTOR_TRANSITIONS[String(interest.status)] ?? [];
      if (!allowed.includes(target)) {
        throw new InvestorError(409, "bad_transition", `Cannot move interest from ${interest.status} to ${target}.`);
      }
      const rows = await setInterestStatus(db, Number(interest.id), target);
      res.json({ interest: rows[0] });
    } catch (e) {
      sendError(res, e);
    }
  });

  // ===================== INTERESTS (owner/team admin) =====================

  /** GET /api/admin/investors/interests — owner review queue. */
  r.get("/api/admin/investors/interests", async (req: Request, res: Response) => {
    try {
      await requireAdmin(db, req);
      const status = String(req.query.status || "owner_review");
      if (!INTEREST_STATUSES.includes(status as InterestStatus)) {
        throw new InvestorError(400, "bad_status", "Unknown status.");
      }
      const rows = await run(
        db,
        sql`SELECT i.*, u.first_name, u.last_name, u.email,
                    p.address, p.city, p.state, p.zip_code, p.price
             FROM deal_interests i
             JOIN users u ON u.id = i.investor_user_id
             JOIN properties p ON p.id = i.property_id
             WHERE i.status = ${status}
             ORDER BY i.updated_at DESC`,
      );
      res.json({
        interests: rows.map((x) => ({
          id: num(x.id),
          status: str(x.status),
          investor: { id: num(x.investor_user_id), name: fullName(x), email: str(x.email) },
          propertyId: num(x.property_id),
          address: str(x.address),
          city: str(x.city),
          state: str(x.state),
          price: num(x.price),
          interestedAt: iso(x.interested_at),
        })),
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** POST /api/admin/investors/interests/:id/approve — owner approve: mutual match + unlock Deal Room. */
  r.post("/api/admin/investors/interests/:id/approve", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(db, req);
      const interest = await getInterest(db, parseId(req.params.id));
      if (!interest) throw new InvestorError(404, "not_found", "Interest not found.");
      if (String(interest.status) !== "owner_review") {
        throw new InvestorError(409, "bad_transition", `Only interests awaiting owner review can be approved (current: ${interest.status}).`);
      }
      const updated = await setInterestStatus(db, Number(interest.id), "mutual_match");
      // One room per property; created once, then reused.
      const roomRows = await run(
        db,
        sql`INSERT INTO deal_rooms (property_id, interest_id, status)
            VALUES (${interest.property_id}, ${interest.id}, 'open')
            ON CONFLICT (property_id) DO UPDATE SET updated_at = now()
            RETURNING *`,
      );
      const room = roomRows[0];
      await run(
        db,
        sql`INSERT INTO deal_room_participants (room_id, user_id, role)
            VALUES (${room.id}, ${interest.investor_user_id}, 'investor')
            ON CONFLICT (room_id, user_id) DO NOTHING`,
      );
      await run(
        db,
        sql`INSERT INTO deal_room_participants (room_id, user_id, role)
            VALUES (${room.id}, ${admin.id}, 'team_admin')
            ON CONFLICT (room_id, user_id) DO NOTHING`,
      );
      await run(
        db,
        sql`INSERT INTO deal_room_messages (room_id, author_user_id, kind, body)
            VALUES (${room.id}, ${admin.id}, 'announcement',
                    'Mutual match confirmed. The Deal Room is now open for this property.')`,
      );
      res.json({ interest: updated[0], roomId: num(room.id) });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** POST /api/admin/investors/interests/:id/decline — owner decline. */
  r.post("/api/admin/investors/interests/:id/decline", async (req: Request, res: Response) => {
    try {
      await requireAdmin(db, req);
      const interest = await getInterest(db, parseId(req.params.id));
      if (!interest) throw new InvestorError(404, "not_found", "Interest not found.");
      if (String(interest.status) !== "owner_review") {
        throw new InvestorError(409, "bad_transition", `Only interests awaiting owner review can be declined (current: ${interest.status}).`);
      }
      const rows = await run(
        db,
        sql`UPDATE deal_interests SET status = 'passed', declined_at = now(), updated_at = now()
            WHERE id = ${interest.id} RETURNING *`,
      );
      res.json({ interest: rows[0] });
    } catch (e) {
      sendError(res, e);
    }
  });

  // ===================== DEAL ROOMS =====================

  async function roomDetail(db: DealDb, roomId: number, forInvestor: boolean, viewerUserId: number) {
    const roomRows = await run(db, sql`SELECT * FROM deal_rooms WHERE id = ${roomId} LIMIT 1`);
    const room = roomRows[0];
    if (!room) throw new InvestorError(404, "not_found", "Deal room not found.");
    if (!forInvestor && !(await isRoomParticipant(db, roomId, viewerUserId))) {
      throw new InvestorError(403, "forbidden", "You are not a participant of this deal room.");
    }
    const propRows = await run(db, sql`SELECT * FROM properties WHERE id = ${room.property_id} LIMIT 1`);
    const participants = await run(
      db,
      sql`SELECT p.user_id, p.role, p.joined_at, u.first_name, u.last_name, u.email
           FROM deal_room_participants p JOIN users u ON u.id = p.user_id
           WHERE p.room_id = ${roomId} ORDER BY p.joined_at`,
    );
    const messages = await run(
      db,
      sql`SELECT m.*, u.first_name, u.last_name
           FROM deal_room_messages m JOIN users u ON u.id = m.author_user_id
           WHERE m.room_id = ${roomId} ORDER BY m.created_at`,
    );
    const tasks = await run(
      db,
      sql`SELECT t.* FROM deal_room_tasks t WHERE t.room_id = ${roomId}
           ORDER BY COALESCE(t.due_at, t.created_at)`,
    );
    const files = await run(
      db,
      sql`SELECT f.id, f.filename, f.mime_type, f.storage_key, f.category, f.created_at,
                  u.first_name, u.last_name
           FROM deal_room_files f JOIN users u ON u.id = f.uploaded_by
           WHERE f.room_id = ${roomId}
             AND (${forInvestor} = false OR f.visible_to_investor = true)
           ORDER BY f.created_at`,
    );
    const showings = await run(
      db,
      sql`SELECT * FROM deal_room_showings WHERE room_id = ${roomId} ORDER BY starts_at`,
    );
    const offers = await run(
      db,
      sql`SELECT o.*, p.address, p.city, p.state
           FROM offers o JOIN properties p ON p.id = o.property_id
           WHERE o.deal_room_id = ${roomId}
             AND (${forInvestor} = false OR o.investor_user_id = ${viewerUserId})
           ORDER BY o.created_at DESC`,
    );
    const interest = await run(
      db,
      sql`SELECT * FROM deal_interests WHERE property_id = ${room.property_id}
           AND (${forInvestor} = false OR investor_user_id = ${viewerUserId})
           ORDER BY updated_at DESC LIMIT 1`,
    );

    return {
      id: num(room.id),
      status: str(room.status),
      createdAt: iso(room.created_at),
      property: propRows[0] ? propertySummary(propRows[0], forInvestor) : null,
      interestStatus: interest[0] ? str(interest[0].status) : null,
      participants: participants.map((p) => ({
        userId: num(p.user_id),
        role: str(p.role),
        name: forInvestor && String(p.role) === "investor" ? "Buyer" : fullName(p),
        email: forInvestor ? null : str(p.email),
        joinedAt: iso(p.joined_at),
      })),
      messages: messages.map((m) => ({
        id: num(m.id),
        authorName: fullName(m),
        mine: Number(m.author_user_id) === viewerUserId,
        kind: str(m.kind),
        body: str(m.body),
        parentId: num(m.parent_id),
        createdAt: iso(m.created_at),
      })),
      tasks: tasks.map((t) => ({
        id: num(t.id),
        title: str(t.title),
        description: str(t.description),
        dueAt: iso(t.due_at),
        status: str(t.status),
        category: str(t.category),
        completedAt: iso(t.completed_at),
      })),
      files: files.map((f) => ({
        id: num(f.id),
        filename: str(f.filename),
        mimeType: str(f.mime_type),
        storageKey: str(f.storage_key),
        category: str(f.category),
        createdAt: iso(f.created_at),
      })),
      showings: showings.map((s) => ({
        id: num(s.id),
        startsAt: iso(s.starts_at),
        endsAt: iso(s.ends_at),
        status: str(s.status),
        notes: str(s.notes),
      })),
      offers: offers.map(offerToJson),
    };
  }

  /** GET /api/investor/deal-rooms — my deal rooms. */
  r.get("/api/investor/deal-rooms", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const rows = await run(
        db,
        sql`SELECT dr.*, p.address, p.city, p.state, p.price, p.images,
                    i.status AS interest_status
             FROM deal_room_participants dp
             JOIN deal_rooms dr ON dr.id = dp.room_id
             JOIN properties p ON p.id = dr.property_id
             LEFT JOIN deal_interests i ON i.property_id = dr.property_id AND i.investor_user_id = ${user.id}
             WHERE dp.user_id = ${user.id}
             ORDER BY dr.updated_at DESC`,
      );
      res.json({
        rooms: rows.map((x) => ({
          id: num(x.id),
          status: str(x.status),
          interestStatus: str(x.interest_status),
          updatedAt: iso(x.updated_at),
          property: {
            id: num(x.property_id),
            address: str(x.address),
            city: str(x.city),
            state: str(x.state),
            price: num(x.price),
            image: Array.isArray(x.images) ? (x.images as unknown[]).map(String)[0] ?? null : null,
          },
        })),
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** GET /api/investor/deal-rooms/:roomId — role-scoped room detail. */
  r.get("/api/investor/deal-rooms/:roomId", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const detail = await roomDetail(db, parseId(req.params.roomId), true, Number(user.id));
      res.json({ room: detail });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** GET /api/admin/investors/deal-rooms/:roomId — full detail for the owner/team. */
  r.get("/api/admin/investors/deal-rooms/:roomId", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(db, req);
      const detail = await roomDetail(db, parseId(req.params.roomId), false, Number(admin.id));
      res.json({ room: detail });
    } catch (e) {
      sendError(res, e);
    }
  });

  // ---- conversation / Q&A ----

  /** GET /api/investor/deal-rooms/:roomId/messages */
  r.get("/api/investor/deal-rooms/:roomId/messages", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const detail = await roomDetail(db, parseId(req.params.roomId), true, Number(user.id));
      res.json({ messages: detail.messages });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** POST /api/investor/deal-rooms/:roomId/messages — message or Q&A question/answer. */
  r.post("/api/investor/deal-rooms/:roomId/messages", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const roomId = parseId(req.params.roomId);
      if (!(await isRoomParticipant(db, roomId, Number(user.id)))) {
        throw new InvestorError(403, "forbidden", "You are not a participant of this deal room.");
      }
      const body = String(req.body?.body ?? "").trim();
      if (!body) throw new InvestorError(400, "body_required", "Message body is required.");
      const kind = String(req.body?.kind ?? "message");
      if (!["message", "question", "answer"].includes(kind)) {
        throw new InvestorError(400, "bad_kind", "kind must be message, question, or answer.");
      }
      const parentId = req.body?.parentId != null ? parseId(String(req.body.parentId)) : null;
      const rows = await run(
        db,
        sql`INSERT INTO deal_room_messages (room_id, author_user_id, kind, body, parent_id)
            VALUES (${roomId}, ${user.id}, ${kind}, ${body}, ${parentId})
            RETURNING id, room_id, author_user_id, kind, body, parent_id, created_at`,
      );
      const m = rows[0];
      res.status(201).json({
        message: {
          id: num(m.id),
          authorName: fullName(user),
          mine: true,
          kind: str(m.kind),
          body: str(m.body),
          parentId: num(m.parent_id),
          createdAt: iso(m.created_at),
        },
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** POST /api/admin/investors/deal-rooms/:roomId/messages — team can also post (announcements). */
  r.post("/api/admin/investors/deal-rooms/:roomId/messages", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(db, req);
      const roomId = parseId(req.params.roomId);
      const body = String(req.body?.body ?? "").trim();
      if (!body) throw new InvestorError(400, "body_required", "Message body is required.");
      const kind = String(req.body?.kind ?? "message");
      if (!["message", "question", "answer", "announcement"].includes(kind)) {
        throw new InvestorError(400, "bad_kind", "kind must be message, question, answer, or announcement.");
      }
      const rows = await run(
        db,
        sql`INSERT INTO deal_room_messages (room_id, author_user_id, kind, body)
            VALUES (${roomId}, ${admin.id}, ${kind}, ${body})
            RETURNING id, kind, body, created_at`,
      );
      res.status(201).json({ message: { id: num(rows[0].id), kind: str(rows[0].kind), body: str(rows[0].body), createdAt: iso(rows[0].created_at) } });
    } catch (e) {
      sendError(res, e);
    }
  });

  // ---- tasks (owner/team manage; investor reads in room detail) ----

  /** POST /api/admin/investors/deal-rooms/:roomId/tasks */
  r.post("/api/admin/investors/deal-rooms/:roomId/tasks", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(db, req);
      const roomId = parseId(req.params.roomId);
      const title = String(req.body?.title ?? "").trim();
      if (!title) throw new InvestorError(400, "title_required", "Task title is required.");
      const category = String(req.body?.category ?? "general");
      if (!["general", "due_diligence", "showing", "contract", "closing"].includes(category)) {
        throw new InvestorError(400, "bad_category", "Invalid task category.");
      }
      const dueAt = req.body?.dueAt ? new Date(String(req.body.dueAt)) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) throw new InvestorError(400, "bad_date", "Invalid due date.");
      const rows = await run(
        db,
        sql`INSERT INTO deal_room_tasks (room_id, title, description, due_at, category, created_by)
            VALUES (${roomId}, ${title}, ${str(req.body?.description) ?? null}, ${dueAt ? dueAt.toISOString() : null}, ${category}, ${admin.id})
            RETURNING id, title, description, due_at, status, category, completed_at`,
      );
      res.status(201).json({
        task: {
          id: num(rows[0].id),
          title: str(rows[0].title),
          description: str(rows[0].description),
          dueAt: iso(rows[0].due_at),
          status: str(rows[0].status),
          category: str(rows[0].category),
          completedAt: iso(rows[0].completed_at),
        },
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** PATCH /api/admin/investors/deal-rooms/:roomId/tasks/:taskId — mark done/open. */
  r.patch("/api/admin/investors/deal-rooms/:roomId/tasks/:taskId", async (req: Request, res: Response) => {
    try {
      await requireAdmin(db, req);
      const roomId = parseId(req.params.roomId);
      const taskId = parseId(req.params.taskId);
      const status = String(req.body?.status ?? "");
      if (!["open", "done"].includes(status)) {
        throw new InvestorError(400, "bad_status", "status must be open or done.");
      }
      const rows = await run(
        db,
        sql`UPDATE deal_room_tasks
            SET status = ${status}, completed_at = ${status === "done" ? sql`now()` : null}
            WHERE id = ${taskId} AND room_id = ${roomId}
            RETURNING id, status, completed_at`,
      );
      if (!rows.length) throw new InvestorError(404, "not_found", "Task not found.");
      res.json({ task: { id: num(rows[0].id), status: str(rows[0].status), completedAt: iso(rows[0].completed_at) } });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** POST /api/investor/deal-rooms/:roomId/showings — request a showing / access slot. */
  r.post("/api/investor/deal-rooms/:roomId/showings", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const roomId = parseId(req.params.roomId);
      if (!(await isRoomParticipant(db, roomId, Number(user.id)))) {
        throw new InvestorError(403, "forbidden", "You are not a participant of this deal room.");
      }
      const startsAt = new Date(String(req.body?.startsAt ?? ""));
      const endsAt = new Date(String(req.body?.endsAt ?? ""));
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        throw new InvestorError(400, "bad_window", "A valid showing window (startsAt < endsAt) is required.");
      }
      const rows = await run(
        db,
        sql`INSERT INTO deal_room_showings (room_id, starts_at, ends_at, notes, requested_by)
            VALUES (${roomId}, ${startsAt.toISOString()}, ${endsAt.toISOString()}, ${str(req.body?.notes) ?? null}, ${user.id})
            RETURNING id, starts_at, ends_at, status, notes`,
      );
      res.status(201).json({
        showing: {
          id: num(rows[0].id),
          startsAt: iso(rows[0].starts_at),
          endsAt: iso(rows[0].ends_at),
          status: str(rows[0].status),
          notes: str(rows[0].notes),
        },
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  // ===================== OFFERS (Phase 14) =====================

  /**
   * POST /api/investor/deal-rooms/:roomId/offers — create a DRAFT offer.
   * Only from a deal room with a live interest (mutual_match or later).
   * Explicit investor action only: never auto-created from interest.
   */
  r.post("/api/investor/deal-rooms/:roomId/offers", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const roomId = parseId(req.params.roomId);
      if (!(await isRoomParticipant(db, roomId, Number(user.id)))) {
        throw new InvestorError(403, "forbidden", "You are not a participant of this deal room.");
      }
      const roomRows = await run(db, sql`SELECT * FROM deal_rooms WHERE id = ${roomId} LIMIT 1`);
      const room = roomRows[0];
      if (!room) throw new InvestorError(404, "not_found", "Deal room not found.");
      const interest = await run(
        db,
        sql`SELECT * FROM deal_interests
            WHERE property_id = ${room.property_id} AND investor_user_id = ${user.id}
            ORDER BY updated_at DESC LIMIT 1`,
      );
      const interestStatus = interest[0] ? String(interest[0].status) : null;
      if (!["mutual_match", "due_diligence", "offer_submitted", "negotiating"].includes(interestStatus ?? "")) {
        throw new InvestorError(409, "no_match", "An offer requires a mutual match on this deal first.");
      }
      const active = await run(
        db,
        sql`SELECT id FROM offers
            WHERE deal_room_id = ${roomId} AND investor_user_id = ${user.id}
              AND status IN ('draft','submitted','viewed') LIMIT 1`,
      );
      if (active.length) {
        throw new InvestorError(409, "offer_active", "You already have an active offer on this deal. Withdraw or wait before creating a new one.");
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const validation = validateOfferBody(body);
      if (!validation.ok) throw new InvestorError(400, "bad_offer", validation.message);
      const contingencies = Array.isArray(body.contingencies) ? (body.contingencies as unknown[]).map(String) : [];
      const rows = await run(
        db,
        sql`INSERT INTO offers (
               deal_room_id, property_id, investor_user_id, offer_amount, earnest_money,
               financing_type, inspection_period_days, closing_date, deal_structure,
               contingencies, additional_terms, expiration_at, buyer_entity, authorized_signer,
               status, version_number
             ) VALUES (
               ${roomId}, ${room.property_id}, ${user.id},
               ${Number(body.offerAmount)}, ${body.earnestMoney != null ? Number(body.earnestMoney) : null},
               ${str(body.financingType)}, ${body.inspectionPeriodDays != null ? Number(body.inspectionPeriodDays) : null},
               ${str(body.closingDate)}, ${str(body.dealStructure)},
               ${pgTextArray(contingencies)}::text[], ${str(body.additionalTerms)},
               ${str(body.expirationAt) ? new Date(String(body.expirationAt)).toISOString() : null},
               ${str(body.buyerEntity)}, ${str(body.authorizedSigner)},
               'draft', 1
             ) RETURNING *`,
      );
      const offer = rows[0];
      await snapshotOffer(db, Number(offer.id), Number(user.id), "Draft created");
      res.status(201).json({ offer: offerToJson(offer) });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** GET /api/investor/offers/structured — my structured offers (latest first). */
  r.get("/api/investor/offers/structured", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const rows = await run(
        db,
        sql`SELECT o.*, p.address, p.city, p.state
             FROM offers o JOIN properties p ON p.id = o.property_id
             WHERE o.investor_user_id = ${user.id}
             ORDER BY o.updated_at DESC`,
      );
      res.json({ offers: rows.map(offerToJson) });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** GET /api/investor/offers/structured/:offerId — detail + immutable version history. */
  r.get("/api/investor/offers/structured/:offerId", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const offerId = parseId(req.params.offerId);
      const rows = await run(
        db,
        sql`SELECT o.*, p.address, p.city, p.state
             FROM offers o JOIN properties p ON p.id = o.property_id
             WHERE o.id = ${offerId} AND o.investor_user_id = ${user.id} LIMIT 1`,
      );
      if (!rows.length) throw new InvestorError(404, "not_found", "Offer not found.");
      const versions = await run(
        db,
        sql`SELECT version_number, snapshot, created_at FROM offer_versions
             WHERE offer_id = ${offerId} ORDER BY version_number`,
      );
      res.json({
        offer: offerToJson(rows[0]),
        versions: versions.map((v) => ({
          versionNumber: num(v.version_number),
          snapshot: v.snapshot,
          createdAt: iso(v.created_at),
        })),
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** PATCH /api/investor/offers/structured/:offerId — edit a DRAFT only. */
  r.patch("/api/investor/offers/structured/:offerId", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const offerId = parseId(req.params.offerId);
      const rows = await run(
        db,
        sql`SELECT * FROM offers WHERE id = ${offerId} AND investor_user_id = ${user.id} LIMIT 1`,
      );
      const offer = rows[0];
      if (!offer) throw new InvestorError(404, "not_found", "Offer not found.");
      if (String(offer.status) !== "draft") {
        throw new InvestorError(409, "locked", "Only draft offers can be edited. A submitted offer can be withdrawn.");
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const contingencies = Array.isArray(body.contingencies) ? (body.contingencies as unknown[]).map(String) : undefined;
      const updated = await run(
        db,
        sql`UPDATE offers SET
               offer_amount = COALESCE(${body.offerAmount != null ? Number(body.offerAmount) : null}, offer_amount),
               earnest_money = ${body.earnestMoney !== undefined ? (body.earnestMoney != null ? Number(body.earnestMoney) : null) : sql`earnest_money`},
               financing_type = COALESCE(${str(body.financingType)}, financing_type),
               inspection_period_days = ${body.inspectionPeriodDays !== undefined ? (body.inspectionPeriodDays != null ? Number(body.inspectionPeriodDays) : null) : sql`inspection_period_days`},
               closing_date = COALESCE(${str(body.closingDate)}, closing_date),
               deal_structure = COALESCE(${str(body.dealStructure)}, deal_structure),
               contingencies = COALESCE(${contingencies !== undefined ? pgTextArray(contingencies) : null}::text[], contingencies),
               additional_terms = ${body.additionalTerms !== undefined ? str(body.additionalTerms) : sql`additional_terms`},
               expiration_at = ${body.expirationAt !== undefined ? (str(body.expirationAt) ? new Date(String(body.expirationAt)).toISOString() : null) : sql`expiration_at`},
               buyer_entity = ${body.buyerEntity !== undefined ? str(body.buyerEntity) : sql`buyer_entity`},
               authorized_signer = COALESCE(${str(body.authorizedSigner)}, authorized_signer),
               updated_at = now()
             WHERE id = ${offerId} RETURNING *`,
      );
      await snapshotOffer(db, offerId, Number(user.id), "Draft edited");
      res.json({ offer: offerToJson(updated[0]) });
    } catch (e) {
      sendError(res, e);
    }
  });

  /**
   * POST /api/investor/offers/structured/:offerId/submit — submit a draft.
   * Requires explicit confirmation (body.confirmed === true). Two-step UI
   * calls this only after the review screen. Immutability: the submitted
   * state is snapshotted; later counters create new rows.
   */
  r.post("/api/investor/offers/structured/:offerId/submit", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const offerId = parseId(req.params.offerId);
      if (req.body?.confirmed !== true) {
        throw new InvestorError(400, "confirmation_required", "Submitting an offer requires explicit confirmation.");
      }
      const rows = await run(
        db,
        sql`SELECT * FROM offers WHERE id = ${offerId} AND investor_user_id = ${user.id} LIMIT 1`,
      );
      const offer = rows[0];
      if (!offer) throw new InvestorError(404, "not_found", "Offer not found.");
      if (String(offer.status) !== "draft") {
        throw new InvestorError(409, "bad_state", `Only draft offers can be submitted (current: ${offer.status}).`);
      }
      if (!num(offer.offer_amount) || num(offer.offer_amount)! <= 0) {
        throw new InvestorError(400, "incomplete", "Offer amount is required before submitting.");
      }
      if (!str(offer.authorized_signer)) {
        throw new InvestorError(400, "incomplete", "An authorized signer is required before submitting.");
      }
      const updated = await run(
        db,
        sql`UPDATE offers SET status = 'submitted', submitted_at = now(), updated_at = now()
            WHERE id = ${offerId} RETURNING *`,
      );
      await snapshotOffer(db, offerId, Number(user.id), "Offer submitted (investor confirmed)");
      // Move the interest lifecycle forward.
      const interest = await run(
        db,
        sql`SELECT id, status FROM deal_interests
            WHERE property_id = ${offer.property_id} AND investor_user_id = ${user.id}
            ORDER BY updated_at DESC LIMIT 1`,
      );
      if (interest[0] && ["mutual_match", "due_diligence", "negotiating"].includes(String(interest[0].status))) {
        await setInterestStatus(db, Number(interest[0].id), "offer_submitted");
      }
      res.json({ offer: offerToJson(updated[0]) });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** POST /api/investor/offers/structured/:offerId/withdraw — investor withdraws. */
  r.post("/api/investor/offers/structured/:offerId/withdraw", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(db, req);
      const offerId = parseId(req.params.offerId);
      const rows = await run(
        db,
        sql`SELECT * FROM offers WHERE id = ${offerId} AND investor_user_id = ${user.id} LIMIT 1`,
      );
      const offer = rows[0];
      if (!offer) throw new InvestorError(404, "not_found", "Offer not found.");
      if (TERMINAL_OFFER_STATUSES.includes(String(offer.status) as OfferStatus)) {
        throw new InvestorError(409, "bad_state", `This offer is already ${offer.status} and cannot be withdrawn.`);
      }
      const updated = await run(
        db,
        sql`UPDATE offers SET status = 'withdrawn', withdrawn_at = now(), updated_at = now()
            WHERE id = ${offerId} RETURNING *`,
      );
      await snapshotOffer(db, offerId, Number(user.id), "Offer withdrawn by investor");
      res.json({ offer: offerToJson(updated[0]) });
    } catch (e) {
      sendError(res, e);
    }
  });

  // ---- owner/team offer actions ----

  async function ownerOfferAction(
    db: DealDb,
    req: Request,
    res: Response,
    action: "viewed" | "accepted" | "rejected",
  ): Promise<void> {
    const admin = await requireAdmin(db, req);
    const offerId = parseId(req.params.offerId);
    const rows = await run(db, sql`SELECT * FROM offers WHERE id = ${offerId} LIMIT 1`);
    const offer = rows[0];
    if (!offer) throw new InvestorError(404, "not_found", "Offer not found.");
    const current = String(offer.status) as OfferStatus;
    const allowed = OFFER_OWNER_TRANSITIONS[current] ?? [];
    if (!allowed.includes(action)) {
      throw new InvestorError(409, "bad_transition", `Cannot mark this offer ${action} (current: ${current}).`);
    }
    const updated = await run(
      db,
      sql`UPDATE offers
          SET status = ${action},
              accepted_at = ${action === "accepted" ? sql`now()` : sql`accepted_at`},
              rejected_at = ${action === "rejected" ? sql`now()` : sql`rejected_at`},
              updated_at = now()
          WHERE id = ${offerId} RETURNING *`,
    );
    await snapshotOffer(db, offerId, Number(admin.id), `Owner marked offer ${action}`);
    if (action === "accepted") {
      const interest = await run(
        db,
        sql`SELECT id, status FROM deal_interests
            WHERE property_id = ${offer.property_id} AND investor_user_id = ${offer.investor_user_id}
            ORDER BY updated_at DESC LIMIT 1`,
      );
      if (interest[0] && (OWNER_TRANSITIONS[String(interest[0].status)] ?? []).includes("offer_accepted")) {
        await setInterestStatus(db, Number(interest[0].id), "offer_accepted");
      }
    }
    res.json({ offer: offerToJson(updated[0]) });
  }

  r.post("/api/admin/investors/offers/:offerId/viewed", (req, res) =>
    ownerOfferAction(db, req, res, "viewed").catch((e) => sendError(res, e)),
  );
  r.post("/api/admin/investors/offers/:offerId/accept", (req, res) =>
    ownerOfferAction(db, req, res, "accepted").catch((e) => sendError(res, e)),
  );
  r.post("/api/admin/investors/offers/:offerId/reject", (req, res) =>
    ownerOfferAction(db, req, res, "rejected").catch((e) => sendError(res, e)),
  );

  /**
   * POST /api/admin/investors/offers/:offerId/counter — counteroffer.
   * Creates a NEW offers row (parent_offer_id = countered offer,
   * version_number + 1); the old row becomes 'countered' and is never
   * overwritten. Snapshot both.
   */
  r.post("/api/admin/investors/offers/:offerId/counter", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(db, req);
      const offerId = parseId(req.params.offerId);
      const rows = await run(db, sql`SELECT * FROM offers WHERE id = ${offerId} LIMIT 1`);
      const offer = rows[0];
      if (!offer) throw new InvestorError(404, "not_found", "Offer not found.");
      const current = String(offer.status) as OfferStatus;
      if (!(OFFER_OWNER_TRANSITIONS[current] ?? []).includes("countered")) {
        throw new InvestorError(409, "bad_transition", `Cannot counter this offer (current: ${current}).`);
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const validation = validateOfferBody({ ...offerToJson(offer), ...body });
      if (!validation.ok) throw new InvestorError(400, "bad_offer", validation.message);

      const parent = await run(
        db,
        sql`UPDATE offers SET status = 'countered', updated_at = now()
            WHERE id = ${offerId} RETURNING *`,
      );
      await snapshotOffer(db, offerId, Number(admin.id), "Countered by owner (new version row created)");

      const contingencies = Array.isArray(body.contingencies) ? (body.contingencies as unknown[]).map(String) : [];
      const child = await run(
        db,
        sql`INSERT INTO offers (
               deal_room_id, property_id, investor_user_id, offer_amount, earnest_money,
               financing_type, inspection_period_days, closing_date, deal_structure,
               contingencies, additional_terms, expiration_at, buyer_entity, authorized_signer,
               status, version_number, parent_offer_id, submitted_at
             ) VALUES (
               ${offer.deal_room_id}, ${offer.property_id}, ${offer.investor_user_id},
               ${body.offerAmount != null ? Number(body.offerAmount) : offer.offer_amount},
               ${body.earnestMoney !== undefined ? (body.earnestMoney != null ? Number(body.earnestMoney) : null) : offer.earnest_money},
               ${body.financingType !== undefined ? str(body.financingType) : offer.financing_type},
               ${body.inspectionPeriodDays !== undefined ? (body.inspectionPeriodDays != null ? Number(body.inspectionPeriodDays) : null) : offer.inspection_period_days},
               ${body.closingDate !== undefined ? str(body.closingDate) : offer.closing_date},
               ${body.dealStructure !== undefined ? str(body.dealStructure) : offer.deal_structure},
               contingencies = COALESCE(${body.contingencies !== undefined ? pgTextArray(contingencies) : null}::text[], contingencies),
               ${body.additionalTerms !== undefined ? str(body.additionalTerms) : offer.additional_terms},
               ${body.expirationAt !== undefined ? (str(body.expirationAt) ? new Date(String(body.expirationAt)).toISOString() : null) : offer.expiration_at},
               ${body.buyerEntity !== undefined ? str(body.buyerEntity) : offer.buyer_entity},
               ${body.authorizedSigner !== undefined ? str(body.authorizedSigner) : offer.authorized_signer},
               'submitted', ${Number(offer.version_number) + 1}, ${offerId}, now()
             ) RETURNING *`,
      );
      await snapshotOffer(db, Number(child[0].id), Number(admin.id), "Counteroffer submitted by owner");
      res.status(201).json({ offer: offerToJson(child[0]), parent: offerToJson(parent[0]) });
    } catch (e) {
      sendError(res, e);
    }
  });

  /** GET /api/admin/investors/offers — owner offer queue. */
  r.get("/api/admin/investors/offers", async (req: Request, res: Response) => {
    try {
      await requireAdmin(db, req);
      const status = String(req.query.status || "");
      const rows = await run(
        db,
        sql`SELECT o.*, p.address, p.city, p.state, u.first_name, u.last_name, u.email
             FROM offers o
             JOIN properties p ON p.id = o.property_id
             JOIN users u ON u.id = o.investor_user_id
             WHERE ${status ? sql`o.status = ${status}` : sql`true`}
             ORDER BY o.updated_at DESC`,
      );
      res.json({
        offers: rows.map((x) => ({
          ...offerToJson(x),
          investor: { id: num(x.investor_user_id), name: fullName(x), email: str(x.email) },
        })),
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  /**
   * POST /api/admin/investors/offers/:offerId/convert — link an accepted
   * offer to its e-sign contract envelope (contracts wired later).
   */
  r.post("/api/admin/investors/offers/:offerId/convert", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(db, req);
      const offerId = parseId(req.params.offerId);
      const contractId = Number(req.body?.contractId);
      if (!Number.isFinite(contractId)) {
        throw new InvestorError(400, "contract_required", "contractId is required to convert an offer to a contract.");
      }
      const rows = await run(db, sql`SELECT * FROM offers WHERE id = ${offerId} LIMIT 1`);
      const offer = rows[0];
      if (!offer) throw new InvestorError(404, "not_found", "Offer not found.");
      if (String(offer.status) !== "accepted") {
        throw new InvestorError(409, "bad_state", `Only accepted offers can convert to contracts (current: ${offer.status}).`);
      }
      const updated = await run(
        db,
        sql`UPDATE offers SET status = 'converted_to_contract', contract_id = ${contractId}, updated_at = now()
            WHERE id = ${offerId} RETURNING *`,
      );
      await snapshotOffer(db, offerId, Number(admin.id), `Converted to contract #${contractId}`);
      const interest = await run(
        db,
        sql`SELECT id, status FROM deal_interests
            WHERE property_id = ${offer.property_id} AND investor_user_id = ${offer.investor_user_id}
            ORDER BY updated_at DESC LIMIT 1`,
      );
      if (interest[0] && (OWNER_TRANSITIONS[String(interest[0].status)] ?? []).includes("contract_sent")) {
        await setInterestStatus(db, Number(interest[0].id), "contract_sent");
      }
      res.json({ offer: offerToJson(updated[0]) });
    } catch (e) {
      sendError(res, e);
    }
  });

  return r;
}
