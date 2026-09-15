/**
 * Backfill the 20 buyer-intro SMS sent via Telnyx on 2026-09-14 into crm_sms_messages.
 *
 * Run AFTER migration 0069 (adds crm_sms_messages.buyer_id + buyers.do_not_call):
 *   npx tsx server/scripts/apply-migrations.ts   (or your normal migrate flow)
 *   npx tsx server/scripts/backfill-buyer-sms-2026-09-14.ts --dry-run   # preview
 *   npx tsx server/scripts/backfill-buyer-sms-2026-09-14.ts             # write
 *
 * Idempotent: rows are skipped when provider_message_id already exists, so it
 * is safe to re-run. Each `to` number is matched to a buyer by last-10 digits.
 */
import { pool } from "../db";

const FROM = "+13212940738";
const CREATED_AT = "2026-09-15T00:30:00Z";

const bodyFor = (name: string) =>
  `Hey ${name}, Benji with Ocean Luxe. We send off-market deals to our buyers list every week \u2014 real deals, numbers already run. Want in? Reply with your buy box. Reply STOP to opt out.`;

type BackfillRow = { to: string; providerId: string; name: string };

const ROWS: BackfillRow[] = [
  { to: "+12406935776", providerId: "4031a0a2-77bf-4ca9-8a41-2f2e053b7d7e", name: "Justin" },
  { to: "+14108078767", providerId: "4031a0a2-77c8-4196-92dc-0541c557d92b", name: "Brad" },
  { to: "+14102749678", providerId: "4031a0a2-77ce-45f6-aa02-f827bf750bbe", name: "there" },
  { to: "+14433917080", providerId: "4031a0a2-77d4-4cbb-b904-582907417da4", name: "there" },
  { to: "+14102378034", providerId: "4031a0a2-77da-43e8-8860-04cad95f0ad3", name: "there" },
  { to: "+14432782743", providerId: "4031a0a2-77e1-4eb0-8813-f4eef0c08f77", name: "there" },
  { to: "+14108709228", providerId: "4031a0a2-77e7-4990-a163-5842cd565d02", name: "there" },
  { to: "+12403894319", providerId: "4031a0a2-77ed-4da4-9dec-1dcb8e3fdbc6", name: "there" },
  { to: "+14438984799", providerId: "4031a0a2-77f3-4cbd-a18f-bae325033f1e", name: "there" },
  { to: "+14106572670", providerId: "4031a0a2-77f9-488c-af1f-a3ae7aba4bde", name: "there" },
  { to: "+14104413485", providerId: "4031a0a2-77ff-4bea-8cc2-4ce0f821d7c1", name: "there" },
  { to: "+14107055800", providerId: "4031a0a2-7806-401e-a71c-0582bc3654b7", name: "there" },
  { to: "+13013374747", providerId: "4031a0a2-780c-48bf-b497-2eebbaf8c748", name: "there" },
  { to: "+15715688480", providerId: "4031a0a2-7812-4c6f-8ba9-d8fdf4d6ece4", name: "there" },
  { to: "+12165849069", providerId: "4031a0a2-7819-4002-b787-6236064822e1", name: "there" },
  { to: "+12162004160", providerId: "4031a0a2-781f-4501-9306-22bb9da432fd", name: "Chase" },
  { to: "+15137172282", providerId: "4031a0a2-7826-455d-adf3-14dfac3ac8d1", name: "there" },
  { to: "+13305787886", providerId: "4031a0a2-782c-4f92-9abe-3f3bf6ebd6a9", name: "there" },
  { to: "+13309694175", providerId: "4031a0a2-7833-4106-af76-65cb040da72f", name: "there" },
  { to: "+14405776552", providerId: "4031a0a2-7839-4405-a8b4-f3a1bbb9f089", name: "there" },
];

async function resolveBuyerId(to: string): Promise<number | null> {
  const digits = to.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const last10 = digits.slice(-10);
  const res: any = await pool.query(
    `SELECT id FROM buyers WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $1 ORDER BY id DESC LIMIT 1`,
    [`%${last10}`],
  );
  const row = res.rows?.[0];
  return row?.id ? Number(row.id) : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  let inserted = 0;
  let skipped = 0;

  for (const row of ROWS) {
    const buyerId = await resolveBuyerId(row.to);
    const exists: any = await pool.query(
      `SELECT 1 FROM crm_sms_messages WHERE provider_message_id = $1 LIMIT 1`,
      [row.providerId],
    );
    if (exists.rows?.length) {
      skipped += 1;
      console.log(`SKIP (already backfilled) to=${row.to} buyer_id=${buyerId}`);
      continue;
    }
    if (dryRun) {
      console.log(`WOULD INSERT to=${row.to} buyer_id=${buyerId} provider=${row.providerId}`);
      continue;
    }
    await pool.query(
      `INSERT INTO crm_sms_messages
         (user_id, buyer_id, direction, from_number, to_number, body, status, provider_message_id, metadata, created_at)
       VALUES (0, $1, 'outbound', $2, $3, $4, 'sent', $5, $6, $7)`,
      [
        buyerId,
        FROM,
        row.to,
        bodyFor(row.name),
        row.providerId,
        JSON.stringify({ backfill: "buyer-intro-2026-09-14", buyerId: buyerId ?? undefined }),
        CREATED_AT,
      ],
    );
    inserted += 1;
    console.log(`INSERTED to=${row.to} buyer_id=${buyerId}`);
  }

  console.log(`done: inserted=${inserted} skipped=${skipped} dryRun=${dryRun}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
