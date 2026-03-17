import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("Auth DB failure handling", () => {
  const originalDbUrl = process.env.DATABASE_URL;
  let app: express.Express;

  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@db.invalid/db?sslmode=require";

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));

    storage.getUserByEmail = async () => {
      const err: any = new AggregateError([], "connect ECONNREFUSED");
      err.code = "ECONNREFUSED";
      throw err;
    };

    await registerRoutes(app);
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalDbUrl;
  });

  it("POST /api/auth/login returns 503 when DB is unavailable", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "x@example.com", password: "password123" });
    expect(res.status).toBe(503);
  });
});
