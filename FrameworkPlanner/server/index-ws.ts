import "dotenv/config";

import express from "express";
import { createServer } from "node:http";

import { pool } from "./db.js";
import { emitTelephonyEventToAll, initTelephonyWs } from "./telephony/ws.js";

const CHANNEL = "telephony_events";

async function listenForTelephonyEvents() {
  const client = await pool.connect();
  await client.query(`LISTEN ${CHANNEL}`);

  client.on("notification", (msg) => {
    try {
      const parsed = JSON.parse(String(msg.payload || "{}"));
      const evt = parsed?.event;
      if (!evt || typeof evt.type !== "string") return;
      emitTelephonyEventToAll(evt);
    } catch {}
  });

  client.on("error", () => {
    try {
      client.release();
    } catch {}
    setTimeout(() => {
      listenForTelephonyEvents().catch(() => {});
    }, 1000);
  });
}

async function main() {
  const app = express();
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  initTelephonyWs(server);

  await listenForTelephonyEvents();

  const port = parseInt(process.env.PORT || "3001", 10);
  server.listen({ port, host: "0.0.0.0" });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

