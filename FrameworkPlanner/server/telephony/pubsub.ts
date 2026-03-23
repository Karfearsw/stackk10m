import type { TelephonyEvent } from "./ws.js";
import { pool } from "../db.js";

const CHANNEL = "telephony_events";

export async function publishTelephonyEvent(event: TelephonyEvent) {
  const payload = JSON.stringify({ event, ts: Date.now() });
  await pool.query("select pg_notify($1, $2)", [CHANNEL, payload]);
}

