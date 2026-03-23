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

const routes = [
  { path: "/leads", readyText: "Leads Pipeline" },
  { path: "/opportunities", readyText: "Opportunities" },
  { path: "/phone", readyText: "Phone" },
  { path: "/contacts", readyText: "Contacts" },
  { path: "/calculator", readyText: "Deal Calculator" },
  { path: "/contracts", readyText: "Document Management" },
  { path: "/buyers", readyText: "Cash Buyers CRM" },
] as const;

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

(shouldRun ? test.describe : test.describe.skip)("Responsive layout checks", () => {
  test("no horizontal page overflow + responsive navigation", async ({ page }) => {
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

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      for (const r of routes) {
        await page.goto(r.path, { waitUntil: "domcontentloaded" });
        await expect(page.getByText(r.readyText).first()).toBeVisible();

        const dims = await page.evaluate(() => {
          const el = document.scrollingElement || document.documentElement;
          return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
        });
        expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth + 1);

        if (vp.name === "mobile") {
          await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
          await expect(page.getByTestId("button-toggle-sidebar")).toHaveCount(0);

          await page.getByTestId("mobile-bottom-nav-more").click();
          await expect(page.getByTestId("mobile-nav-drawer")).toBeVisible();

          await page.getByTestId("button-hamburger").click();
          await expect(page.getByTestId("mobile-nav-drawer")).toBeHidden();
        } else {
          await expect(page.getByTestId("mobile-bottom-nav")).toBeHidden();
          await expect(page.getByTestId("button-toggle-sidebar")).toBeVisible();
        }
      }
    }
  });
});

