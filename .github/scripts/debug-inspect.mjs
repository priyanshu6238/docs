// Throwaway debugging script, NOT part of the pipeline. Verifies the staging
// account can actually reach non-Chat routes (was previously blocked by a
// Staff-role restriction in glific-frontend's AuthenticatedRoute.tsx).

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

async function checkRoute(page, route) {
  await page.goto(`${STAGING_URL}${route}`, { waitUntil: "load" });
  await page.waitForTimeout(2_000);
  const actualPath = new URL(page.url()).pathname.replace(/\/+$/, "");
  const expectedPath = route.replace(/\/+$/, "");
  const ok = actualPath === expectedPath;
  console.log(`${ok ? "OK " : "FAIL"} ${route} -> landed on ${actualPath}`);
  return ok;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await login(page);
    console.log("Logged in OK. Current URL:", page.url());

    const authKeysAfterLogin = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => /auth|session|token|user/i.test(k))
    );
    console.log("=== localStorage auth-related keys after login ===", authKeysAfterLogin);

    await page.goto(`${STAGING_URL}/flow`, { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    console.log("=== after goto /flow, URL ===", page.url());

    const authKeysAfterNav = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => /auth|session|token|user/i.test(k))
    );
    console.log("=== localStorage auth-related keys after nav to /flow ===", authKeysAfterNav);

    const pageText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log("=== body innerText at landing page (first 500 chars) ===");
    console.log(pageText);

    // Test theory: repeated hard reloads (page.goto) in quick succession
    // invalidate the session (single-use refresh-token race?), independent
    // of role. Go back to /chat via goto, then to /template via a client-side
    // link click (no hard reload) instead of another goto.
    await page.goto(`${STAGING_URL}/chat`, { waitUntil: "load" });
    await page.waitForTimeout(3_000);
    console.log("=== back on (via goto) ===", page.url());

    await page.click('a[href="/template"]', { force: true, timeout: 8_000 });
    await page.waitForTimeout(2_000);
    console.log("=== /template via client-side link click -> URL ===", page.url());
    console.log(
      "=== body innerText after client-side nav (first 300 chars) ===",
      await page.evaluate(() => document.body.innerText.slice(0, 300))
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
