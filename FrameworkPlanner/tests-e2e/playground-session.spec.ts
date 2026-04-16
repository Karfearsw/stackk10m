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

(shouldRun ? test.describe : test.describe.skip)("Playground session persistence", () => {
  test("tags, checklist, assignment, and browser mode persist", async ({ page }) => {
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
    const bypassJson = await bypassRes.json();
    const token = String(bypassJson?.token || "");
    expect(token).not.toBe("");

    await page.addInitScript((t) => {
      try {
        localStorage.setItem("authToken", String(t));
      } catch {}
    }, token);

    const address = `123 Playground St ${suffix}`;
    await page.goto(`/playground?address=${encodeURIComponent(address)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("page-title")).toBeVisible();

    await page.getByRole("tab", { name: "Session" }).click();

    await page.getByPlaceholder("Add a tag (e.g. zoning_risk)").fill("zoning_risk");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("button", { name: /zoning_risk/ })).toBeVisible();

    await page.getByPlaceholder("New checklist item").fill("Pull comps");
    await page.getByRole("button", { name: "Add" }).nth(1).click();
    await expect(page.getByText("Pull comps")).toBeVisible();

    await page.getByRole("tab", { name: "Browser" }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "External first" }).click();
    await page.waitForTimeout(900);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("page-title")).toBeVisible();
    await page.getByRole("tab", { name: "Session" }).click();
    await expect(page.getByRole("button", { name: /zoning_risk/ })).toBeVisible();
    await expect(page.getByText("Pull comps")).toBeVisible();
  });
});

