function baseUrl() {
  return process.env.TEST_BASE_URL || "http://localhost:3000";
}

const smokeToken = String(process.env.TEST_AUTH_TOKEN || "").trim();
const shouldRun = Boolean(process.env.TEST_BASE_URL) && Boolean(smokeToken);

(shouldRun ? describe : describe.skip)("/api/ops/agents", () => {
  it("returns fleet JSON for an authenticated smoke token", async () => {
    const res = await fetch(`${baseUrl()}/api/ops/agents?limit=10`, {
      headers: {
        Authorization: `Bearer ${smokeToken}`,
      },
    });

    expect(res.status).toBeLessThan(500);
    expect(res.headers.get("content-type") || "").toMatch(/json/);
  });
});
