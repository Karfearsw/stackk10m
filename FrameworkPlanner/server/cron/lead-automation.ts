import { storage } from "../storage.js";
import { insertPropertySchema } from "../shared-schema.js";

export async function runLeadAutomation() {
  console.log("[Automation] Running lead-to-opportunity automation...");
  try {
    const leads = await storage.getLeads();
    
    // Find leads in negotiation or contract stage that don't have a linked property yet
    // Note: This is an in-memory filter. For scale, we should add a DB query method.
    const candidates = [];
    for (const lead of leads) {
      const status = lead.status?.toLowerCase().trim();
      if (status === "negotiation" || status === "under_contract") {
        const existingProperty = await storage.getPropertyBySourceLeadId(lead.id);
        if (!existingProperty) {
          candidates.push(lead);
        }
      }
    }

    console.log(`[Automation] Found ${candidates.length} candidates for conversion.`);

    for (const lead of candidates) {
      try {
        console.log(`[Automation] Converting lead ${lead.id} (${lead.address})...`);
        
        // Map lead status to property status
        let propertyStatus = "active";
        if (lead.status?.toLowerCase() === "under_contract") {
          propertyStatus = "under_contract";
        } else if (lead.status?.toLowerCase() === "negotiation") {
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
  // Run immediately on startup
  runLeadAutomation();
  
  // Schedule periodic run
  setInterval(runLeadAutomation, intervalMs);
  console.log(`[Automation] Worker started with ${intervalMs}ms interval`);
}
