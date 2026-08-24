import { pool } from "../db";
async function main() {
  const res = await pool.query("select * from user_feature_flags where user_id = 11 order by feature_key");
  console.log(JSON.stringify(res.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
