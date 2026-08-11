// Throwaway debugging script, NOT part of the pipeline. Logs in exactly like
// take-screenshots.mjs, then navigates to /template and dumps what's actually
// happening at the point of failure (auth session state in localStorage, the
// real URL/title, and a screenshot) instead of guessing from source reading.

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

async function dump(page, label) {
  console.log(`\n=== ${label} ===`);
  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  const session = await page.evaluate(() => localStorage.getItem("glific_session"));
  console.log("glific_session:", session);
  const cookies = await page.context().cookies();
  console.log("Cookies:", JSON.stringify(cookies));
  const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("Body text (first 300 chars):", bodySnippet);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page);
    await dump(page, "after login");
    await page.screenshot({ path: "after-login.png" });

    await page.goto(`${STAGING_URL}/template`, { waitUntil: "load" });
    await page.waitForTimeout(3_000);
    await dump(page, "after navigating to /template");
    await page.screenshot({ path: "after-template-nav.png" });

    // Re-check /chat for comparison, same session, same page.
    await page.goto(`${STAGING_URL}/chat`, { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    await dump(page, "after navigating back to /chat");
    await page.screenshot({ path: "after-chat-nav.png" });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
