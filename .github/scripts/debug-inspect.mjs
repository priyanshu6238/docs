// Throwaway debugging script, NOT part of the pipeline. Tests whether headed
// mode (matching scripts/screenshot.js's chromium.launch({ headless: false }))
// avoids whatever is causing the flow editor to render as Chat instead, when
// launched headless (the default, used by take-screenshots.mjs).

import { chromium } from "playwright";

const STAGING_URL = process.env.GLIFIC_STAGING_URL.replace(/\/+$/, "");
const PHONE = process.env.GLIFIC_STAGING_PHONE;
const PASSWORD = process.env.GLIFIC_STAGING_PASSWORD;
const FLOW_UUID = "70d67e11-e49f-4229-9c36-6ab222cf4a82"; // test_bug, has Wait for Response nodes

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
  // The one deliberate difference under test: headed, not headless.
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page);
    console.log("Logged in. URL:", page.url());

    await page.goto(`${STAGING_URL}/flow/configure/${FLOW_UUID}`, { waitUntil: "load" });
    await page.waitForTimeout(8_000);
    console.log("=== flow editor URL ===", page.url());

    const showingChat = await page
      .locator('[data-testid="app"]')
      .evaluate((el) => el.innerText.includes("Contacts") && el.querySelector('[href="/chat"]') !== null)
      .catch(() => "check failed");
    console.log("=== looks like Chat shell present? ===", showingChat);

    await page.screenshot({ path: "flow-editor-headed.png", fullPage: false });
    console.log("Saved flow-editor-headed.png");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
