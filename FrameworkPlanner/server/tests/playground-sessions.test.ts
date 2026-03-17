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

(shouldRun ? describe : describe.skip)("/api/playground/sessions", () => {
  it("opens, patches, reads, and sends a session to a lead", async () => {
    const email = `smoke-playground-${Date.now()}@example.com`;
    const employeeCode = requiredEnv("TEST_EMPLOYEE_CODE");
    const password = requiredEnv("TEST_PASSWORD");

    const signupRes = await fetch(`${baseUrl()}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Smoke",
        lastName: "Playground",
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
    const token = bypassJson.token as string;
    expect(typeof token).toBe("string");

    const meRes = await fetch(`${baseUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);
    const me = await meRes.json();
    expect(typeof me?.id).toBe("number");

    const openRes = await fetch(`${baseUrl()}/api/playground/sessions/open`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ address: `123 Smoke St ${Date.now()}` }),
    });
    expect(openRes.status).toBe(200);
    const opened = await openRes.json();
    expect(typeof opened?.id).toBe("number");

    const uw = { arv: 250000, repairEstimate: 30000, mao: 150000, offerMin: 140000, offerMax: 155000, exitStrategy: "Wholesale" };
    const patchRes = await fetch(`${baseUrl()}/api/playground/sessions/${opened.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ underwritingJson: JSON.stringify(uw) }),
    });
    expect(patchRes.status).toBe(200);

    const assignRes = await fetch(`${baseUrl()}/api/playground/sessions/${opened.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assignedTo: me.id, assignmentStatus: "In progress" }),
    });
    expect(assignRes.status).toBe(200);

    const getRes = await fetch(`${baseUrl()}/api/playground/sessions/${opened.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status).toBe(200);
    const got = await getRes.json();
    expect(typeof got?.underwritingJson).toBe("string");

    const activityRes = await fetch(`${baseUrl()}/api/activity?limit=10&playgroundSessionId=${opened.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(activityRes.status).toBe(200);
    const activity = await activityRes.json();
    expect(Array.isArray(activity)).toBe(true);

    const leadRes = await fetch(`${baseUrl()}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        address: "123 Lead St",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        ownerName: "Smoke Lead",
        ownerPhone: "5555555555",
        ownerEmail: "lead@example.com",
        estimatedValue: 0,
        status: "new",
      }),
    });
    expect([200, 201]).toContain(leadRes.status);
    const lead = await leadRes.json();
    expect(typeof lead?.id).toBe("number");

    const sendRes = await fetch(`${baseUrl()}/api/playground/sessions/${opened.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetType: "lead", targetId: lead.id }),
    });
    expect(sendRes.status).toBe(200);
    const sent = await sendRes.json();
    expect(sent?.leadId).toBe(lead.id);

    const leadGetRes = await fetch(`${baseUrl()}/api/leads/${lead.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(leadGetRes.status).toBe(200);
    const leadGot = await leadGetRes.json();
    expect(String(leadGot?.notes || "")).toContain("Playground Research");
  });
});
