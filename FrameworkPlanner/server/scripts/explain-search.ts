import { pool } from "../db.js";

async function run() {
  const q = process.argv[2] || "Main";
  const term = `%${q}%`;
  const sql = `
    EXPLAIN ANALYZE
    SELECT * FROM (
      SELECT 'lead' AS type, l.id, l.address AS title
      FROM leads l
      WHERE lower(l.address) LIKE lower($1) OR lower(l.city) LIKE lower($1) OR lower(l.state) LIKE lower($1)
         OR lower(l.owner_name) LIKE lower($1) OR lower(l.owner_phone) LIKE lower($1) OR lower(l.owner_email) LIKE lower($1)
      UNION ALL
      SELECT 'opportunity' AS type, p.id, p.address AS title
      FROM properties p
      WHERE lower(p.address) LIKE lower($1) OR lower(p.city) LIKE lower($1) OR lower(p.state) LIKE lower($1)
         OR lower(p.apn) LIKE lower($1) OR lower(p.zip_code) LIKE lower($1)
      UNION ALL
      SELECT 'contact' AS type, c.id, c.name AS title
      FROM contacts c
      WHERE lower(c.name) LIKE lower($1) OR lower(c.email) LIKE lower($1) OR lower(c.phone) LIKE lower($1)
    ) t LIMIT 20;
  `;
  const res = await pool.query(sql, [term]);
  console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

