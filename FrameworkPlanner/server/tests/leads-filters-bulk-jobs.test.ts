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

async function signupAndBypass() {
  const email = `smoke-leads-${Date.now()}@example.com`;
  const employeeCode = requiredEnv("TEST_EMPLOYEE_CODE");
  const password = requiredEnv("TEST_PASSWORD");

  const signupRes = await fetch(`${baseUrl()}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      firstName: "Smoke",
      lastName: "Leads",
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
  return { token: String(bypassJson.token), user: bypassJson.user };
}

async function createLead(input: any) {
  const res = await fetch(`${baseUrl()}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(res.status).toBe(201);
  return res.json();
}

async function deleteLead(id: number) {
  await fetch(`${baseUrl()}/api/leads/${id}`, { method: "DELETE" });
}

async function waitForBulkJob(token: string, id: number) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${baseUrl()}/api/leads/bulk/jobs/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const job = await res.json();
    const status = String(job?.status || "");
    if (status === "completed" || status === "failed") return job;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for bulk job");
}

(shouldRun ? describe : describe.skip)("/api/leads filters + bulk jobs", () => {
  const marker = `t6-${Date.now()}`;
  let token = "";
  let leadA: any = null;
  let leadB: any = null;
  let leadC: any = null;

  beforeAll(async () => {
    const auth = await signupAndBypass();
    token = auth.token;

    leadA = await createLead({
      address: `${marker} A Street`,
      city: "Miami",
      state: "FL",
      zipCode: "11111",
      ownerName: `${marker} Owner A`,
      ownerPhone: "5551112222",
      ownerEmail: "",
      county: "Miami-Dade",
      leadType: "probate",
      relasScore: 80,
      tags: [marker, "alpha"],
      source: "smoke_test",
      status: "new",
    });

    leadB = await createLead({
      address: `${marker} B Ave`,
      city: "Orlando",
      state: "FL",
      zipCode: "22222",
      ownerName: `${marker} Owner B`,
      ownerPhone: "",
      ownerEmail: "b@example.com",
      county: "Orange",
      leadType: "absentee",
      relasScore: 20,
      tags: [marker, "beta"],
      source: "smoke_test",
      status: "new",
    });

    leadC = await createLead({
      address: `${marker} C Blvd`,
      city: "Atlanta",
      state: "GA",
      zipCode: "11111",
      ownerName: `${marker} Owner C`,
      ownerPhone: "5559990000",
      ownerEmail: "c@example.com",
      county: "Fulton",
      leadType: "probate",
      relasScore: 50,
      tags: [marker, "alpha", "beta"],
      source: "smoke_test",
      status: "new",
    });

    const noteRes = await fetch(`${baseUrl()}/api/leads/${leadA.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: `note ${marker}` }),
    });
    expect(noteRes.status).toBe(201);
  });

  afterAll(async () => {
    const ids = [leadA?.id, leadB?.id, leadC?.id].map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    for (const id of ids) await deleteLead(id);
  });

  it("filters by zip/state/city/county/leadType", async () => {
    const res1 = await fetch(`${baseUrl()}/api/leads?zip=11111&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    const ids1 = (json1.items || []).map((l: any) => Number(l.id));
    expect(ids1).toContain(Number(leadA.id));
    expect(ids1).toContain(Number(leadC.id));

    const res2 = await fetch(`${baseUrl()}/api/leads?state=FL&city=Orlando&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    const ids2 = (json2.items || []).map((l: any) => Number(l.id));
    expect(ids2).toEqual([Number(leadB.id)]);

    const res3 = await fetch(`${baseUrl()}/api/leads?county=Miami-Dade&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res3.status).toBe(200);
    const json3 = await res3.json();
    const ids3 = (json3.items || []).map((l: any) => Number(l.id));
    expect(ids3).toEqual([Number(leadA.id)]);

    const res4 = await fetch(`${baseUrl()}/api/leads?leadType=probate&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res4.status).toBe(200);
    const json4 = await res4.json();
    const ids4 = (json4.items || []).map((l: any) => Number(l.id));
    expect(ids4).toContain(Number(leadA.id));
    expect(ids4).toContain(Number(leadC.id));
  });

  it("filters by tags/score/contact presence/notes", async () => {
    const res1 = await fetch(`${baseUrl()}/api/leads?tags=${encodeURIComponent(marker)}%2Calpha&tagsMode=all&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    const ids1 = (json1.items || []).map((l: any) => Number(l.id));
    expect(ids1).toContain(Number(leadA.id));
    expect(ids1).toContain(Number(leadC.id));

    const res2 = await fetch(`${baseUrl()}/api/leads?scoreMin=60&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    const ids2 = (json2.items || []).map((l: any) => Number(l.id));
    expect(ids2).toEqual([Number(leadA.id)]);

    const res3 = await fetch(`${baseUrl()}/api/leads?contactPresence=phone_only&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res3.status).toBe(200);
    const json3 = await res3.json();
    const ids3 = (json3.items || []).map((l: any) => Number(l.id));
    expect(ids3).toEqual([Number(leadA.id)]);

    const res4 = await fetch(`${baseUrl()}/api/leads?hasNotes=true&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res4.status).toBe(200);
    const json4 = await res4.json();
    const ids4 = (json4.items || []).map((l: any) => Number(l.id));
    expect(ids4).toEqual([Number(leadA.id)]);

    const res5 = await fetch(`${baseUrl()}/api/leads?noteUpdatedWithinDays=1&q=${encodeURIComponent(marker)}&limit=50`);
    expect(res5.status).toBe(200);
    const json5 = await res5.json();
    const ids5 = (json5.items || []).map((l: any) => Number(l.id));
    expect(ids5).toEqual([Number(leadA.id)]);
  });

  it("supports bulk preview + async bulk jobs (explicit + all_filtered)", async () => {
    const previewExplicit = await fetch(`${baseUrl()}/api/leads/bulk/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        selectionScope: "explicit",
        leadIds: [leadA.id, leadB.id, leadC.id],
        action: "archive",
        params: {},
      }),
    });
    expect(previewExplicit.status).toBe(200);
    const previewExplicitJson = await previewExplicit.json();
    expect(Number(previewExplicitJson.totalTargets)).toBe(3);

    const previewFiltered = await fetch(`${baseUrl()}/api/leads/bulk/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        selectionScope: "all_filtered",
        filter: { state: "FL", q: marker },
        action: "archive",
        params: {},
      }),
    });
    expect(previewFiltered.status).toBe(200);
    const previewFilteredJson = await previewFiltered.json();
    expect(Number(previewFilteredJson.totalTargets)).toBe(2);

    const jobCreate1 = await fetch(`${baseUrl()}/api/leads/bulk/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        selectionScope: "explicit",
        leadIds: [leadA.id, leadB.id, leadC.id],
        action: "set_status",
        params: { status: `t6_status_${marker}` },
      }),
    });
    expect(jobCreate1.status).toBe(201);
    const jobCreate1Json = await jobCreate1.json();
    const job1 = await waitForBulkJob(token, Number(jobCreate1Json.jobId));
    expect(job1.status).toBe("completed");
    expect(Number(job1.totalTargets)).toBe(3);
    expect(Number(job1.processed)).toBe(3);
    expect(Number(job1.succeeded)).toBe(3);
    expect(Number(job1.failed)).toBe(0);

    const statusCheck = await fetch(`${baseUrl()}/api/leads?status=${encodeURIComponent(`t6_status_${marker}`)}&q=${encodeURIComponent(marker)}&limit=50`);
    expect(statusCheck.status).toBe(200);
    const statusCheckJson = await statusCheck.json();
    const idsStatus = (statusCheckJson.items || []).map((l: any) => Number(l.id));
    expect(idsStatus).toContain(Number(leadA.id));
    expect(idsStatus).toContain(Number(leadB.id));
    expect(idsStatus).toContain(Number(leadC.id));

    const jobCreate2 = await fetch(`${baseUrl()}/api/leads/bulk/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        selectionScope: "all_filtered",
        filter: { state: "FL", q: marker },
        action: "archive",
        params: {},
      }),
    });
    expect(jobCreate2.status).toBe(201);
    const jobCreate2Json = await jobCreate2.json();
    const job2 = await waitForBulkJob(token, Number(jobCreate2Json.jobId));
    expect(job2.status).toBe("completed");
    expect(Number(job2.totalTargets)).toBe(2);

    const archivedCheck = await fetch(`${baseUrl()}/api/leads?archived=only&state=FL&q=${encodeURIComponent(marker)}&limit=50`);
    expect(archivedCheck.status).toBe(200);
    const archivedCheckJson = await archivedCheck.json();
    const archivedIds = (archivedCheckJson.items || []).map((l: any) => Number(l.id));
    expect(archivedIds).toContain(Number(leadA.id));
    expect(archivedIds).toContain(Number(leadB.id));
    expect(archivedIds).not.toContain(Number(leadC.id));
  });
});

