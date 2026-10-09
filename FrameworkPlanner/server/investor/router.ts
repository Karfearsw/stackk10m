/**
 * Investor portal HTTP routes.
 *
 * Mount: registerInvestorRoutes(app) is called from server/app.ts (and
 * server/index-vercel.ts) AFTER registerRoutes, so the /api session + JWT
 * middleware already applies. server/routes.ts is intentionally untouched.
 *
 * Auth model: investors use a SEPARATE session key (investorUserId), never
 * session.userId, so the agent CRM's requireAuth can never see them and they
 * can never reach agent-only routes or data.
 */
import { Router, type Express, type Request, type Response } from "express";
import multer from "multer";
// NOTE: ../db.js is imported lazily inside registerInvestorRoutes so that
// unit tests can import this router without touching the database module.
import { drizzleInvestorStore, type InvestorStore } from "./store.js";
import { investorPortalGuard, isInvestorPortalEnabled } from "./flag.js";
import {
  InvestorError,
  signupInvestor,
  sanitizeInvestorUser,
  loginInvestor,
  decideInvestor,
  validateBuyBox,
  buildFeed,
  swipeDeal,
  makeOffer,
  hashPof,
  validatePofFile,
  getMessageThreads,
  sendInvestorMessage,
  requireActiveInvestor,
} from "./service.js";

declare module "express-session" {
  interface SessionData {
    investorUserId?: number;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// --- tiny in-memory brute-force guard for the public auth endpoints ---
const attemptLog = new Map<string, number[]>();
function tooManyAttempts(key: string, max = 30, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const arr = (attemptLog.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  attemptLog.set(key, arr);
  return arr.length > max;
}

function sendInvestorError(res: Response, err: unknown) {
  if (err instanceof InvestorError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  console.error("[investor]", err);
  return res.status(500).json({ code: "internal_error", message: "Something went wrong." });
}

function investorSessionUserId(req: Request): number | null {
  const id = (req.session as any)?.investorUserId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function isAdminish(u: { isSuperAdmin?: boolean | null; role?: string | null }): boolean {
  if (u.isSuperAdmin) return true;
  const role = String(u.role || "").toLowerCase();
  return role === "admin" || role === "owner" || role === "manager";
}

export interface InvestorRouterDeps {
  store: InvestorStore;
}

export function createInvestorRouter(deps: InvestorRouterDeps): Router {
  const { store } = deps;
  const r = Router();

  // Public: flag status (NOT gated — the client needs it to decide routing).
  r.get("/api/investor/status", (_req, res) => {
    res.json({ enabled: isInvestorPortalEnabled() });
  });

  r.use("/api/investor", investorPortalGuard);
  r.use("/api/admin/investors", investorPortalGuard);

  const requireInvestor = async (req: Request, res: Response) => {
    const id = investorSessionUserId(req);
    if (!id) {
      res.status(401).json({ code: "unauthorized", message: "Investor login required." });
      return null;
    }
    try {
      const { user } = await requireActiveInvestor(store, id);
      return user;
    } catch (e) {
      sendInvestorError(res, e);
      return null;
    }
  };

  const requireAdmin = async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      res.status(401).json({ code: "unauthorized", message: "Admin login required." });
      return null;
    }
    const admin = await store.getUserById(Number(userId));
    if (!admin || !isAdminish(admin)) {
      res.status(403).json({ code: "forbidden", message: "Admin access required." });
      return null;
    }
    return admin;
  };

  // ---------- public auth ----------
  r.post("/api/investor/signup", upload.single("pof"), async (req: Request, res: Response) => {
    try {
      if (tooManyAttempts(`signup:${req.ip}`)) {
        return res.status(429).json({ code: "rate_limited", message: "Too many attempts. Try again later." });
      }
      const user = await signupInvestor(store, {
        firstName: req.body?.firstName,
        lastName: req.body?.lastName,
        email: req.body?.email,
        password: req.body?.password,
        phone: req.body?.phone ?? null,
        company: req.body?.company ?? null,
      });
      const file = (req as any).file as Express.Multer.File | undefined;
      if (file) {
        validatePofFile(file);
        await store.savePofDocument({
          userId: user.id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          sha256: hashPof(file.buffer),
          data: file.buffer,
        });
        await store.markPofProvided(user.id);
      }
      // Pending investors do NOT get a session — admin approval comes first.
      res.status(201).json({ user: sanitizeInvestorUser(user), pendingApproval: true });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/investor/login", async (req: Request, res: Response) => {
    try {
      if (tooManyAttempts(`login:${req.ip}:${String(req.body?.email || "").toLowerCase()}`)) {
        return res.status(429).json({ code: "rate_limited", message: "Too many attempts. Try again later." });
      }
      const user = await loginInvestor(store, req.body?.email, req.body?.password);
      // Separate session key — never session.userId, so the CRM auth path
      // (requireAuth) can never resolve an investor.
      (req.session as any).investorUserId = user.id;
      delete (req.session as any).userId;
      res.json({ user: sanitizeInvestorUser(user) });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/investor/logout", (req: Request, res: Response) => {
    delete (req.session as any).investorUserId;
    res.json({ ok: true });
  });

  // ---------- investor (session) ----------
  r.get("/api/investor/me", async (req: Request, res: Response) => {
    const user = await requireInvestor(req, res);
    if (!user) return;
    const buyer = await store.getBuyerByUserId(user.id);
    res.json({
      user: sanitizeInvestorUser(user),
      pofVerified: Boolean(buyer?.proofOfFundsVerifiedAt),
      pofProvided: Boolean(buyer?.proofOfFunds),
    });
  });

  r.get("/api/investor/buy-box", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      res.json(await store.getBuyBox(user.id));
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.put("/api/investor/buy-box", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const validated = validateBuyBox(req.body ?? {});
      res.json(await store.upsertBuyBox(user.id, validated));
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.get("/api/investor/feed", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const sort = String(req.query.sort || "score");
      const cards = await buildFeed(store, user.id, {
        sort: sort === "price" || sort === "newest" ? sort : "score",
        limit: 100,
      });
      res.json({
        cards: cards.map((c) => ({
          score: c.score,
          reasons: c.reasons,
          spread: c.spread,
          saved: c.saved,
          deal: {
            id: c.deal.id,
            address: c.deal.address,
            city: c.deal.city,
            state: c.deal.state,
            zipCode: c.deal.zipCode,
            price: c.deal.price,
            beds: c.deal.beds,
            baths: c.deal.baths,
            sqft: c.deal.sqft,
            propertyType: c.deal.propertyType,
            image: c.deal.images[0] ?? null,
            arv: c.deal.arv,
            repairCost: c.deal.repairCost,
          },
        })),
      });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.get("/api/investor/saved", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const cards = await buildFeed(store, user.id, { sort: "score", limit: 200 });
      res.json({ saved: cards.filter((c) => c.saved) });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/investor/deals/:id/interest", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      res.json(await swipeDeal(store, user.id, id, "interested"));
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/investor/deals/:id/pass", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      res.json(await swipeDeal(store, user.id, id, "pass"));
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/investor/deals/:id/offers", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      const result = await makeOffer(store, user.id, id, {
        offerAmount: req.body?.offerAmount,
        earnestMoney: req.body?.earnestMoney ?? null,
        closingTimelineDays: req.body?.closingTimelineDays ?? null,
        contingencies: req.body?.contingencies ?? [],
        specialTerms: req.body?.specialTerms ?? null,
      });
      res.status(201).json(result);
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.get("/api/investor/offers", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      res.json({ offers: await store.getOffers(user.id) });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.get("/api/investor/messages", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      res.json({ threads: await getMessageThreads(store, user.id) });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/investor/deals/:id/messages", async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid deal id." });
      res.json(await sendInvestorMessage(store, user.id, id, req.body?.content));
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/investor/pof", upload.single("pof"), async (req: Request, res: Response) => {
    try {
      const user = await requireInvestor(req, res);
      if (!user) return;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ code: "file_required", message: "A proof-of-funds file is required." });
      validatePofFile(file);
      await store.savePofDocument({
        userId: user.id,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256: hashPof(file.buffer),
        data: file.buffer,
      });
      await store.markPofProvided(user.id);
      res.json({ ok: true });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  // ---------- admin approval queue (agent CRM session, admin role) ----------
  r.get("/api/admin/investors/pending", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      res.json({ investors: (await store.listPendingInvestors()).map(sanitizeInvestorUser) });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/admin/investors/:id/approve", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ code: "bad_id", message: "Invalid investor id." });
      const decision = String(req.body?.decision || "").toLowerCase();
      if (decision !== "approve" && decision !== "reject") {
        return res.status(400).json({ code: "bad_decision", message: "decision must be 'approve' or 'reject'." });
      }
      const user = await decideInvestor(store, id, { decision, reason: req.body?.reason ?? null });
      res.json({ user: sanitizeInvestorUser(user) });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  r.post("/api/admin/investors/buyers/:buyerId/pof-verify", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const buyerId = parseInt(req.params.buyerId, 10);
      if (!Number.isFinite(buyerId)) return res.status(400).json({ code: "bad_id", message: "Invalid buyer id." });
      await store.setPofVerified(buyerId, Boolean(req.body?.verified));
      res.json({ ok: true });
    } catch (e) {
      sendInvestorError(res, e);
    }
  });

  return r;
}

/**
 * Mount the investor portal on an Express app. Call AFTER registerRoutes so
 * the /api session middleware is already in place.
 */
export async function registerInvestorRoutes(app: Express): Promise<void> {
  const { db } = await import("../db.js");
  const store = drizzleInvestorStore(db as any);
  app.use(createInvestorRouter({ store }));
  // Deal Matchroom phases 9–16 (each module owns its routes; all flag-gated
  // by the same INVESTOR_PORTAL_ENABLED guard inside the routers).
  try {
    const { createBuyBoxRouter } = await import("./buybox.js");
    app.use(createBuyBoxRouter({ store, db: db as any }));
  } catch (e) {
    console.error("[investor] buybox router mount failed:", e);
  }
  try {
    const { createDiscoveryRouter } = await import("./discovery.js");
    app.use(createDiscoveryRouter({ store, db: db as any }));
  } catch (e) {
    console.error("[investor] discovery router mount failed:", e);
  }
  try {
    const { createDealRoomsRouter } = await import("./dealrooms.js");
    app.use(createDealRoomsRouter({ db: db as any }));
  } catch (e) {
    console.error("[investor] dealrooms router mount failed:", e);
  }
  try {
    const { createLockedUpRouter } = await import("./lockedup.js");
    app.use(createLockedUpRouter({ store }));
  } catch (e) {
    console.error("[investor] lockedup router mount failed:", e);
  }
}
