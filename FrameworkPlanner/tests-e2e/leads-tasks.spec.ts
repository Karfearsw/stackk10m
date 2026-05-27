import { test, expect, request } from "@playwright/test";

function boolEnv(name: string) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_BASE_URL || "http://localhost:3000";
const employeeCode = process.env.E2E_EMPLOYEE_CODE || process.env.TEST_EMPLOYEE_CODE || "";
const password = process.env.E2E_PASSWORD || process.env.TEST_PASSWORD || "";
const bypassEnabled = boolEnv("E2E_DEV_BYPASS_ENABLED") || boolEnv("TEST_DEV_BYPASS_ENABLED");

const shouldRun = Boolean(baseURL) && Boolean(employeeCode) && Boolean(password) && bypassEnabled;

(shouldRun ? test.describe : test.describe.skip)("Leads Pipeline + Task Check", () => {
  test("core button flows work without console errors", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const email = `e2e-${suffix}@example.com`;

    const api = await request.newContext({ baseURL });

    const signupRes = await api.post("/api/auth/signup", {
      data: {
        firstName: "E2E",
        lastName: "User",
        email,
        password,
        employeeCode,
      },
    });
    expect([200, 201]).toContain(signupRes.status());

    const bypassRes = await api.post("/api/auth/dev-bypass", {
      data: { email, employeeCode },
    });
    expect(bypassRes.status()).toBe(200);
    const setCookie = String(bypassRes.headers()["set-cookie"] || "");
    const cookiePair = setCookie ? setCookie.split(";")[0] : "";
    expect(cookiePair).not.toBe("");
    const eq = cookiePair.indexOf("=");
    const cookieName = eq >= 0 ? cookiePair.slice(0, eq) : "";
    const cookieValue = eq >= 0 ? cookiePair.slice(eq + 1) : "";
    await page.context().addCookies([{ name: cookieName, value: cookieValue, url: baseURL }]);

    const leadAddress = `123 E2E St ${suffix}`;
    const leadRes = await api.post("/api/leads", {
      data: {
        address: leadAddress,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        ownerName: "E2E Owner",
        ownerPhone: "5551234567",
        ownerEmail: `owner-${suffix}@example.com`,
        source: "e2e",
        status: "new",
      },
    });
    expect([200, 201]).toContain(leadRes.status());

    const taskTitle = `E2E task ${suffix}`;
    const taskRes = await api.post("/api/tasks", {
      data: {
        title: taskTitle,
        dueAt: new Date().toISOString(),
        priority: "medium",
        status: "open",
        isPrivate: false,
      },
    });
    expect([200, 201]).toContain(taskRes.status());

    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e?.message || e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/leads", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Leads Pipeline" })).toBeVisible();
    await expect(page.getByText(leadAddress)).toBeVisible();


    await page.getByTestId("button-leads-filter").click();
    await page.getByTestId("button-filter-clear").click();
    await page.getByTestId("button-filter-apply").click();

    await page.getByRole("tab", { name: "Pipeline" }).click();
    await expect(page.getByText(leadAddress)).toBeVisible();

    await page.goto("/today", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText(taskTitle)).toBeVisible();
    await page.getByRole("button", { name: "Tomorrow" }).first().click();
    await expect(page.getByText(taskTitle)).toHaveCount(0);

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await page.getByPlaceholder("Search title/description").fill(taskTitle);
    await page.getByRole("button", { name: "Complete" }).first().click();

    expect(consoleErrors).toEqual([]);
  });
});
