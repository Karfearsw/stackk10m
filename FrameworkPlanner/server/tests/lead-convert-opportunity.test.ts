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

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

(shouldRun ? describe : describe.skip)("lead → opportunity conversion", () => {
  let token = "";
  let leadId = 0;
  let propertyId = 0;

  beforeAll(async () => {
    const base = baseUrl();
    const employeeCode = requiredEnv("TEST_EMPLOYEE_CODE");
    const password = requiredEnv("TEST_PASSWORD");
    const email = `convert-${unique()}@example.com`;

    const signupRes = await fetch(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Convert",
        lastName: "Tester",
        email,
        password,
        employeeCode,
      }),
    });
    expect([200, 201]).toContain(signupRes.status);
    token = ((await signupRes.json()) as any).token;

    const leadRes = await fetch(`${base}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        address: `${unique()} Convert Test St`,
        city: "Test City",
        state: "MI",
        zipCode: "48043",
        ownerName: "Convert Test Owner",
        ownerPhone: "5550101234",
        ownerEmail: "convert-test@example.com",
        source: "Test",
        status: "new",
      }),
    });
    expect(leadRes.status).toBe(201);
    leadId = ((await leadRes.json()) as any).id;
  });

  afterAll(async () => {
    const base = baseUrl();
    if (propertyId && token) {
      await fetch(`${base}/api/opportunities/${propertyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (leadId && token) {
      await fetch(`${base}/api/leads/${leadId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  it("converts a 'new' lead (no under_contract gate) to an opportunity", async () => {
    const res = await fetch(`${baseUrl()}/api/leads/${leadId}/convert-to-property`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    propertyId = json?.property?.id;
    expect(typeof propertyId).toBe("number");
    expect(json?.property?.sourceLeadId).toBe(leadId);
  });

  it("returns 409 with the existing opportunity id instead of duplicating", async () => {
    const res = await fetch(`${baseUrl()}/api/leads/${leadId}/convert-to-property`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const json = (await res.json()) as any;
    expect(json?.propertyId).toBe(propertyId);
  });

  it("links the opportunity deal room back to the source lead", async () => {
    const res = await fetch(`${baseUrl()}/api/opportunities/${propertyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json?.lead?.id).toBe(leadId);
  });
});
