import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { storage } from "../storage.js";
import { insertPropertySchema } from "../shared-schema.js";

/**
 * Finds leads in negotiation / under_contract that have no linked property yet.
 *
 * Runs as a single indexed SQL query (see migration 0064_leads_performance.sql)
 * instead of loading every lead into memory each tick — the old approach pulled
 * all 10k+ rows every minute, monopolizing the DB pool and slowing every page.
 */
export async function runLeadAutomation() {
  console.log("[Automation] Running lead-to-opportunity automation...");
  try {
    const result = await db.execute(sql`
      select l.id, l.address, l.city, l.state, l.zip_code as "zipCode",
             l.estimated_value as "estimatedValue", l.status, l.source
      from leads l
      where l.status in ('negotiation', 'under_contract')
        and not exists (
          select 1 from properties p where p.source_lead_id = l.id
        )
      order by l.id
      limit 50
    `);

    const candidates = (result.rows || []) as any[];
    console.log(`[Automation] Found ${candidates.length} candidates for conversion.`);

    for (const lead of candidates) {
      try {
        console.log(`[Automation] Converting lead ${lead.id} (${lead.address})...`);

        // Map lead status to property status
        let propertyStatus = "active";
        if (String(lead.status).toLowerCase() === "under_contract") {
          propertyStatus = "under_contract";
        } else if (String(lead.status).toLowerCase() === "negotiation") {
          propertyStatus = "active"; // Negotiation leads become active opportunities
        }

        const propertyData = insertPropertySchema.parse({
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zipCode: lead.zipCode,
          price: lead.estimatedValue || null,
          status: propertyStatus,
          sourceLeadId: lead.id,
          leadSource: lead.source || null,
        });

        const property = await storage.createProperty(propertyData);

        // Log system activity (userId 0 or null for system)
        await storage.createGlobalActivity({
          userId: 0, // 0 denotes system
          action: "auto_converted_lead",
          description: `Auto-converted lead to opportunity: ${property.address}`,
          metadata: JSON.stringify({
            leadId: lead.id,
            propertyId: property.id,
            address: property.address,
            trigger: "status_change"
          }),
        });

        console.log(`[Automation] Successfully converted lead ${lead.id} to property ${property.id}`);
      } catch (err) {
        console.error(`[Automation] Failed to convert lead ${lead.id}:`, err);
      }
    }
  } catch (error) {
    console.error("[Automation] Error running lead automation:", error);
  }
}

// Start the worker
export function startAutomationWorker(intervalMs = 60000) {
  // Stagger the first run: let the app finish serving its startup queries
  // before background work touches the database.
  const startupDelayMs = 15000;
  const initial = setTimeout(() => {
    runLeadAutomation();
  }, startupDelayMs);
  if (typeof initial.unref === "function") initial.unref();

  // Schedule periodic run
  const timer = setInterval(runLeadAutomation, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[Automation] Worker started with ${intervalMs}ms interval (first run in ${startupDelayMs / 1000}s)`);
}
