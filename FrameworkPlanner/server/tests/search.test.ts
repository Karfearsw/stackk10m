function baseUrl() {
  return process.env.TEST_BASE_URL || "http://localhost:3000";
}

(process.env.TEST_BASE_URL ? describe : describe.skip)("/api/search", () => {
  it("returns results payload", async () => {
    const q = "st";
    const res = await fetch(
      `${baseUrl()}/api/search?q=${encodeURIComponent(q)}&limit=10`,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json && typeof json === "object").toBe(true);
    expect(Array.isArray(json.results)).toBe(true);
    expect(typeof json.counts?.total).toBe("number");
  });
});

