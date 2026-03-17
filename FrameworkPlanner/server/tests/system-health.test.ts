function baseUrl() {
  return process.env.TEST_BASE_URL || "http://localhost:3000";
}

(process.env.TEST_BASE_URL ? describe : describe.skip)("/api/system/health", () => {
  it("returns diagnostics JSON", async () => {
    const res = await fetch(`${baseUrl()}/api/system/health`);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.get("content-type") || "").toMatch(/json/);
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("signalwire");
    expect(body).toHaveProperty("env");
  });
});
