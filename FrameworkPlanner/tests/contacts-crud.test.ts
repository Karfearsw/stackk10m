import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";

describe("Contacts CRUD", () => {
  let app: express.Express;

  beforeAll(async () => {
    storage.getContacts = async () =>
      [
        { id: 1, name: "Alice", phone: "+15551234567", email: "a@example.com", company: "Acme", type: "seller", notes: null },
        { id: 2, name: "Bob", phone: null, email: "bob@example.com", company: null, type: null, notes: "test" },
      ] as any;

    storage.getContactById = async (id: number) =>
      (id === 1 ? ({ id: 1, name: "Alice", phone: "+15551234567", email: "a@example.com", company: "Acme", type: "seller", notes: null } as any) : undefined);

    storage.createContact = async (input: any) => ({ id: 3, ...input } as any);
    storage.updateContact = async (id: number, patch: any) => ({ id, name: "Alice Updated", ...patch } as any);
    storage.deleteContact = async () => {};

    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    await registerRoutes(app);
  });

  it("GET /api/contacts returns list", async () => {
    const res = await request(app).get("/api/contacts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it("GET /api/contacts filters by query", async () => {
    const res = await request(app).get("/api/contacts?query=alice");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(1);
  });

  it("POST /api/contacts creates contact", async () => {
    const res = await request(app).post("/api/contacts").send({ name: "New Contact", phone: "5551239999" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(3);
    expect(res.body.name).toBe("New Contact");
  });

  it("GET /api/contacts/:id returns contact", async () => {
    const res = await request(app).get("/api/contacts/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("PATCH /api/contacts/:id updates contact", async () => {
    const res = await request(app).patch("/api/contacts/1").send({ company: "NewCo" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.company).toBe("NewCo");
  });

  it("DELETE /api/contacts/:id deletes contact", async () => {
    const res = await request(app).delete("/api/contacts/1");
    expect(res.status).toBe(200);
    expect(String(res.body.message || "").toLowerCase()).toContain("deleted");
  });
});
