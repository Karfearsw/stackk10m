/**
 * server/routes/sequences.ts — HTTP layer for follow-up sequences (Ticket 14).
 *
 * Mounted from server/app.ts. Business logic lives in server/sequences/*;
 * this file is thin HTTP glue. routes.ts is intentionally NOT touched
 * (conflict avoidance with parallel ticket work).
 *
 * Agent routes (session auth):
 *   GET    /api/sequences                     list sequences + enrollment counts
 *   POST   /api/sequences                     create sequence with steps (validated)
 *   GET    /api/sequences/:id                 sequence detail + steps
 *   PUT    /api/sequences/:id                 update sequence (replaces steps)
 *   DELETE /api/sequences/:id                 deactivate (soft delete)
 *   POST   /api/sequences/:id/enroll          enroll a lead
 *   GET    /api/sequences/:id/enrollments     list enrollments
 *   GET    /api/sequences/:id/logs            execution log
 *   POST   /api/sequences/enrollments/:eid/pause
 *   POST   /api/sequences/enrollments/:eid/resume
 *   POST   /api/sequences/enrollments/:eid/cancel
 *   POST   /api/sequences/process             process due steps (job queue / manual)
 *   POST   /api/sequences/opt-out             immediate STOP handling (also public)
 */
import type { Express, Request, Response } from "express";
import { pool } from "../db.js";
import { storage } from "../storage.js";
import { validateSequence, normalizeSteps } from "../sequences/builder.js";
import { processDueSteps, enrollLead, optOutLead } from "../sequences/engine.js";

async function requireAgent(req: Request, res: Response) {
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

function handleError(res: Response, error: any) {
  console.error("Sequence route error:", error?.message || error);
  res.status(500).json({ error: error?.message || "Internal error", code: "SEQUENCE_ERROR" });
}

export function registerSequenceRoutes(app: Express) {
  // ── List sequences with enrollment counts ──
  app.get("/api/sequences", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const r = await pool.query(
        `SELECT s.*, 
           (SELECT COUNT(*)::int FROM sequence_enrollments e WHERE e.sequence_id = s.id AND e.status = 'active') AS active_enrollments,
           (SELECT COUNT(*)::int FROM sequence_enrollments e WHERE e.sequence_id = s.id) AS total_enrollments,
           (SELECT COUNT(*)::int FROM sequence_steps st WHERE st.sequence_id = s.id) AS step_count
         FROM followup_sequences s
         ORDER BY s.updated_at DESC`
      );
      res.json({ items: r.rows });
    } catch (e) { handleError(res, e); }
  });

  // ── Create sequence ──
  app.post("/api/sequences", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const issues = validateSequence(req.body || {});
      if (issues.length > 0) return res.status(400).json({ error: "Validation failed", issues });

      const body = req.body;
      const ins = await pool.query(
        `INSERT INTO followup_sequences (name, description, trigger_stage, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          String(body.name).trim(),
          body.description?.trim() || null,
          body.trigger_stage?.trim() || null,
          body.is_active !== false,
          (user as any).id,
        ]
      );
      const seq = ins.rows[0];
      const steps = normalizeSteps(body.steps);
      for (const s of steps) {
        await pool.query(
          `INSERT INTO sequence_steps (sequence_id, step_order, channel, delay_hours, subject, body)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [seq.id, s.step_order, s.channel, s.delay_hours, s.subject, s.body]
        );
      }
      const full = await pool.query(`SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_order ASC`, [seq.id]);
      res.status(201).json({ ...seq, steps: full.rows });
    } catch (e) { handleError(res, e); }
  });

  // ── Sequence detail ──
  app.get("/api/sequences/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const id = Number(req.params.id);
      const s = await pool.query(`SELECT * FROM followup_sequences WHERE id = $1`, [id]);
      if (s.rows.length === 0) return res.status(404).json({ error: "Not found" });
      const steps = await pool.query(`SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_order ASC`, [id]);
      res.json({ ...s.rows[0], steps: steps.rows });
    } catch (e) { handleError(res, e); }
  });

  // ── Update sequence (replaces steps) ──
  app.put("/api/sequences/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const id = Number(req.params.id);
      const issues = validateSequence(req.body || {});
      if (issues.length > 0) return res.status(400).json({ error: "Validation failed", issues });

      const body = req.body;
      // Guard: refuse to replace steps while enrollments are mid-flight; the
      // operator should pause enrollments first (prevents half-applied edits).
      const active = await pool.query(
        `SELECT COUNT(*)::int AS n FROM sequence_enrollments WHERE sequence_id = $1 AND status = 'active'`, [id]
      );
      if (Number(active.rows[0].n) > 0 && body.steps) {
        return res.status(409).json({
          error: "Sequence has active enrollments. Pause them before editing steps.",
          code: "ACTIVE_ENROLLMENTS",
        });
      }

      await pool.query(
        `UPDATE followup_sequences SET name = COALESCE($2, name), description = $3, trigger_stage = $4,
           is_active = COALESCE($5, is_active), updated_at = NOW() WHERE id = $1`,
        [id, body.name?.trim() || null, body.description?.trim() ?? null, body.trigger_stage?.trim() || null,
         typeof body.is_active === "boolean" ? body.is_active : null]
      );
      if (Array.isArray(body.steps)) {
        await pool.query(`DELETE FROM sequence_steps WHERE sequence_id = $1`, [id]);
        const steps = normalizeSteps(body.steps);
        for (const st of steps) {
          await pool.query(
            `INSERT INTO sequence_steps (sequence_id, step_order, channel, delay_hours, subject, body)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, st.step_order, st.channel, st.delay_hours, st.subject, st.body]
          );
        }
      }
      const s = await pool.query(`SELECT * FROM followup_sequences WHERE id = $1`, [id]);
      const steps = await pool.query(`SELECT * FROM sequence_steps WHERE sequence_id = $1 ORDER BY step_order ASC`, [id]);
      res.json({ ...s.rows[0], steps: steps.rows });
    } catch (e) { handleError(res, e); }
  });

  // ── Deactivate (soft delete) ──
  app.delete("/api/sequences/:id", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const id = Number(req.params.id);
      await pool.query(`UPDATE followup_sequences SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
      await pool.query(
        `UPDATE sequence_enrollments SET status = 'cancelled', completed_at = NOW(), next_step_due_at = NULL
         WHERE sequence_id = $1 AND status IN ('active', 'paused')`, [id]
      );
      res.json({ ok: true });
    } catch (e) { handleError(res, e); }
  });

  // ── Enroll a lead ──
  app.post("/api/sequences/:id/enroll", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const id = Number(req.params.id);
      const leadId = Number(req.body?.lead_id);
      if (!Number.isFinite(leadId) || leadId <= 0) return res.status(400).json({ error: "lead_id required" });
      const out = await enrollLead(id, leadId, (user as any).id);
      res.status(out.deduped ? 200 : 201).json(out);
    } catch (e: any) {
      if (String(e?.message || "").includes("not found") || String(e?.message || "").includes("not active")) {
        return res.status(404).json({ error: e.message });
      }
      handleError(res, e);
    }
  });

  // ── Enrollments ──
  app.get("/api/sequences/:id/enrollments", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const id = Number(req.params.id);
      const r = await pool.query(
        `SELECT e.*, l.first_name, l.last_name, l.phone, l.email,
           (SELECT COUNT(*)::int FROM sequence_step_logs sl WHERE sl.enrollment_id = e.id AND sl.status = 'sent') AS steps_sent
         FROM sequence_enrollments e
         LEFT JOIN leads l ON l.id = e.lead_id
         WHERE e.sequence_id = $1 ORDER BY e.enrolled_at DESC LIMIT 200`,
        [id]
      );
      res.json({ items: r.rows });
    } catch (e) { handleError(res, e); }
  });

  // ── Execution log ──
  app.get("/api/sequences/:id/logs", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const id = Number(req.params.id);
      const r = await pool.query(
        `SELECT sl.*, e.lead_id FROM sequence_step_logs sl
         JOIN sequence_enrollments e ON e.id = sl.enrollment_id
         WHERE e.sequence_id = $1 ORDER BY sl.executed_at DESC LIMIT 200`,
        [id]
      );
      res.json({ items: r.rows });
    } catch (e) { handleError(res, e); }
  });

  // ── Pause / resume / cancel enrollment ──
  for (const [action, to] of [["pause", "paused"], ["resume", "active"], ["cancel", "cancelled"]] as const) {
    app.post(`/api/sequences/enrollments/:eid/${action}`, async (req: Request, res: Response) => {
      try {
        const user = await requireAgent(req, res);
        if (!user) return;
        const eid = Number(req.params.eid);
        if (to === "active") {
          await pool.query(
            `UPDATE sequence_enrollments SET status = 'active', next_step_due_at = COALESCE(next_step_due_at, NOW()) WHERE id = $1 AND status = 'paused'`,
            [eid]
          );
        } else {
          await pool.query(
            `UPDATE sequence_enrollments SET status = $2, ${to === "cancelled" ? "completed_at = NOW()," : ""} next_step_due_at = NULL WHERE id = $1`,
            [eid, to]
          );
        }
        res.json({ ok: true, status: to });
      } catch (e) { handleError(res, e); }
    });
  }

  // ── Process due steps (called by Ticket 09 job queue or manually) ──
  app.post("/api/sequences/process", async (req: Request, res: Response) => {
    try {
      const user = await requireAgent(req, res);
      if (!user) return;
      const out = await processDueSteps({ limit: Number(req.body?.limit) || 100, actorUserId: (user as any).id });
      res.json(out);
    } catch (e) { handleError(res, e); }
  });

  // ── Immediate STOP / opt-out ──
  // Public (no session): the Telnyx inbound webhook and the comms hub call
  // this. It is synchronous and idempotent.
  app.post("/api/sequences/opt-out", async (req: Request, res: Response) => {
    try {
      const leadId = Number(req.body?.lead_id);
      const phone = String(req.body?.phone || "").replace(/\D/g, "").slice(-10);
      let resolvedLeadId = Number.isFinite(leadId) && leadId > 0 ? leadId : null;
      if (!resolvedLeadId && phone.length >= 7) {
        const found: any = await pool.query(
          `SELECT id FROM leads WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') LIKE '%' || $1 ORDER BY id DESC LIMIT 1`,
          [phone]
        );
        resolvedLeadId = found.rows?.[0]?.id || null;
      }
      if (!resolvedLeadId) return res.status(404).json({ error: "Lead not found" });
      const out = await optOutLead(resolvedLeadId, {
        reason: String(req.body?.reason || "STOP request"),
        actorUserId: 0,
      });
      res.json(out);
    } catch (e) { handleError(res, e); }
  });
}
