import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { getRvmProvider } from "../services/rvm/provider.js";

export function startRvmPoller(intervalMs = 60_000) {
  let running = false;
  const provider = getRvmProvider();

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rows: any = await db.execute(sql`
        SELECT id, provider_id, status
        FROM rvm_drops
        WHERE provider_id IS NOT NULL
          AND status IN ('queued', 'sending')
        ORDER BY requested_at ASC
        LIMIT 200
      `);
      const drops = (rows as any).rows || [];
      const providerIds = drops.map((d: any) => String(d.provider_id || "")).filter(Boolean);
      if (!providerIds.length) return;
      const statuses = await provider.pollStatuses(providerIds);
      for (const d of drops) {
        const pid = String(d.provider_id || "");
        const next = statuses[pid];
        if (!next) continue;
        if (next.status === d.status) continue;
        await db.execute(sql`
          UPDATE rvm_drops
          SET status = ${next.status},
              error = ${next.error || null},
              completed_at = ${next.status === "sent" || next.status === "failed" ? sql`NOW()` : null}
          WHERE id = ${Number(d.id)}
        `);
      }
    } finally {
      running = false;
    }
  };

  tick().catch(() => {});
  return setInterval(() => tick().catch(() => {}), intervalMs);
}

