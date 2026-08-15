import 'dotenv/config';
import pg from 'pg';
const { URL } = globalThis;
const { Pool } = pg;
const raw = process.env.DATABASE_URL || '';
const u = new URL(raw);
u.searchParams.set('sslmode', 'disable');
u.searchParams.delete('channel_binding');
console.log('Trying:', u.host + u.pathname);
const pool = new Pool({ connectionString: u.toString(), connectionTimeoutMillis: 10000 });
pool.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'teams' AND column_name IN ('invite_code','join_code') ORDER BY ordinal_position")
  .then(r => {
    console.log(JSON.stringify(r.rows, null, 2));
    process.exit(0);
  })
  .catch(e => {
    console.log('ERR', e.message);
    process.exit(1);
  });
