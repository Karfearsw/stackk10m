function baseUrl() {
  return process.env.TEST_BASE_URL || "http://localhost:3000";
}

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const shouldRun =
  Boolean(process.env.TEST_BASE_URL) &&
  Boolean(process.env.TEST_EMPLOYEE_CODE) &&
  Boolean(process.env.TEST_PASSWORD) &&
  Boolean(process.env.TEST_DEV_BYPASS_ENABLED);

(shouldRun ? describe : describe.skip)("/api/auth/dev-bypass smoke", () => {
  it("dev-bypass grants a session+token for an existing user", async () => {
    const email = `smoke-dev-bypass-${Date.now()}@example.com`;
    const employeeCode = requiredEnv("TEST_EMPLOYEE_CODE");
    const password = requiredEnv("TEST_PASSWORD");

    const signupRes = await fetch(`${baseUrl()}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Smoke",
        lastName: "DevBypass",
        email,
        password,
        employeeCode,
      }),
    });
    expect([200, 201]).toContain(signupRes.status);

    const bypassRes = await fetch(`${baseUrl()}/api/auth/dev-bypass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, employeeCode }),
    });
    expect(bypassRes.status).toBe(200);
    const bypassJson = await bypassRes.json();
    expect(bypassJson?.user?.email).toBe(email);
    expect(typeof bypassJson?.token).toBe("string");

    const meRes = await fetch(`${baseUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${bypassJson.token}` },
    });
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson?.email).toBe(email);
  });
});
