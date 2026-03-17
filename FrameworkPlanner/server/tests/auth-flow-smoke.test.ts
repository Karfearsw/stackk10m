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
  Boolean(process.env.TEST_PASSWORD);

(shouldRun ? describe : describe.skip)("/api/auth end-to-end smoke", () => {
  it("signup -> token -> /api/auth/me succeeds", async () => {
    const email = `smoke-${Date.now()}@example.com`;
    const employeeCode = requiredEnv("TEST_EMPLOYEE_CODE");
    const password = requiredEnv("TEST_PASSWORD");

    const signupRes = await fetch(`${baseUrl()}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Smoke",
        lastName: "Test",
        email,
        password,
        employeeCode,
      }),
    });
    expect([200, 201]).toContain(signupRes.status);
    const signupJson = await signupRes.json();
    expect(signupJson?.user?.email).toBe(email);
    expect(typeof signupJson?.token).toBe("string");

    const meRes = await fetch(`${baseUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${signupJson.token}` },
    });
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson?.email).toBe(email);
  });

  it("login -> token -> /api/auth/me succeeds", async () => {
    const email = `smoke-login-${Date.now()}@example.com`;
    const employeeCode = requiredEnv("TEST_EMPLOYEE_CODE");
    const password = requiredEnv("TEST_PASSWORD");

    const signupRes = await fetch(`${baseUrl()}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Smoke",
        lastName: "Login",
        email,
        password,
        employeeCode,
      }),
    });
    expect([200, 201]).toContain(signupRes.status);

    const loginRes = await fetch(`${baseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson?.user?.email).toBe(email);
    expect(typeof loginJson?.token).toBe("string");

    const meRes = await fetch(`${baseUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson?.email).toBe(email);
  });
});

