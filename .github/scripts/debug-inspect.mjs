// Throwaway debugging script, NOT part of the pipeline. Finds a flow with a
// "Wait for Response" node and dumps the flow-editor canvas DOM to find real,
// usable selectors for the node and its config dialog — @glific/flow-editor
// is a compiled third-party bundle with no data-testid in glific-frontend
// source, so this has to come from live inspection instead.

import { chromium } from "playwright";

const STAGING_URL = process.env.GLIFIC_STAGING_URL.replace(/\/+$/, "");
const PHONE = process.env.GLIFIC_STAGING_PHONE;
const PASSWORD = process.env.GLIFIC_STAGING_PASSWORD;

function localPhone(raw) {
  return raw.replace(/\D/g, "").slice(-10);
}

async function login(page) {
  const local = localPhone(PHONE);
  await page.goto(`${STAGING_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="AuthContainer"]', { timeout: 10_000 });

  const phoneInput = page.locator('input[name="phoneNumber"]');
  await phoneInput.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('input[name="phoneNumber"]');
      return !!el && /^\+\d/.test(el.value);
    },
    { timeout: 5_000 }
  );
  await phoneInput.click();
  await phoneInput.press("End");
  await phoneInput.pressSequentially(local);

  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 }),
    page.click('[data-testid="SubmitButton"]'),
  ]);
  await page.waitForLoadState("load");
  await page.waitForTimeout(2_000);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await login(page);
    console.log("Logged in. URL:", page.url());

    const userRoles = await page.evaluate(() => {
      try {
        const user = JSON.parse(localStorage.getItem("glific_user") || "null");
        return user?.roles || user?.accessRoles || user;
      } catch (e) {
        return { parseError: String(e), raw: localStorage.getItem("glific_user") };
      }
    });
    console.log("=== glific_user roles/accessRoles ===", JSON.stringify(userRoles, null, 2));

    // Just read the flow list straight off the rendered page — no need for
    // the API detour, /flow is reachable now.
    await page.goto(`${STAGING_URL}/flow`, { waitUntil: "load" });
    await page.waitForTimeout(3_000);
    console.log("=== /flow URL ===", page.url());

    const roleAfterNav = await page.evaluate(() => localStorage.getItem("role"));
    console.log("=== localStorage 'role' after nav to /flow ===", roleAfterNav);

    await page.screenshot({ path: "flow-list.png", fullPage: true });
    console.log("Saved flow-list.png");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
