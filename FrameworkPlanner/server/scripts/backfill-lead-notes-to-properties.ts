import dotenv from 'dotenv';
import { join } from 'node:path';
dotenv.config({ path: join(process.cwd(), 'FrameworkPlanner', '.env') });

const { storage } = await import('../storage.js');

async function run() {
  const leads = await storage.getLeads(undefined, 0);
  let migrated = 0;
  for (const lead of leads) {
    if (!lead?.id) continue;
    const property = await storage.getPropertyBySourceLeadId(lead.id);
    if (property && lead.notes && (!property.notes || property.notes.indexOf(lead.notes) === -1)) {
      await storage.updateProperty(property.id, { notes: [property.notes || '', lead.notes].filter(Boolean).join('\n') } as any);
      migrated++;
      console.log(`[backfill] migrated notes from lead ${lead.id} to property ${property.id}`);
    }
  }
  console.log(`Backfill complete. Migrated ${migrated} properties.`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
