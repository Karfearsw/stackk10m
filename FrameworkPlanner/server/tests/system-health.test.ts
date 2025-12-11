import request from "supertest";
import { app } from "../../server/app";

describe("/api/system/health", () => {
  it("returns diagnostics JSON", async () => {
    const res = await request(app).get("/api/system/health");
    expect(res.status).toBeLessThan(500);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("db");
    expect(res.body).toHaveProperty("signalwire");
    expect(res.body).toHaveProperty("env");
  });
});
