function baseUrl() {
  return process.env.TEST_BASE_URL || "http://localhost:3000";
}

(process.env.TEST_BASE_URL ? describe : describe.skip)("/api/auth smoke", () => {
  it("GET /api/auth/me returns 401 when unauthenticated", async () => {
    const res = await fetch(`${baseUrl()}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login returns 400 for missing fields", async () => {
    const res = await fetch(`${baseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/signup returns 400 for missing fields", async () => {
    const res = await fetch(`${baseUrl()}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@example.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/signup returns 403 for invalid employee code", async () => {
    const res = await fetch(`${baseUrl()}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Smoke",
        lastName: "Test",
        email: `smoke-${Date.now()}@example.com`,
        password: "password123",
        employeeCode: "invalid",
      }),
    });
    expect(res.status).toBe(403);
  });
});

