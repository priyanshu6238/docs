// Throwaway debugging script, NOT part of the pipeline. Retest after waiting
// out the per-user rate-limit window from earlier repeated testing.

import { chromium } from "playwright";

const STAGING_URL = process.env.GLIFIC_STAGING_URL.replace(/\/+$/, "");
const PHONE = process.env.GLIFIC_STAGING_PHONE;
const PASSWORD = process.env.GLIFIC_STAGING_PASSWORD;
const FLOW_UUID = "70d67e11-e49f-4229-9c36-6ab222cf4a82"; // test_bug, confirmed to have Wait for Response nodes

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

  const failedRequests = [];
  page.on("response", (res) => {
    if (res.status() === 429) failedRequests.push(`429: ${res.url()}`);
  });

  try {
    await login(page);
    console.log("Logged in. URL:", page.url());

    await page.goto(`${STAGING_URL}/flow/configure/${FLOW_UUID}`, { waitUntil: "load" });
    await page.waitForTimeout(8_000);
    console.log("=== flow editor URL ===", page.url());

    const showingChat = await page
      .locator('input[placeholder="Type a message..."]')
      .isVisible()
      .catch(() => false);
    console.log("=== showing Chat instead of the editor? ===", showingChat);

    console.log("=== any 429s seen ===");
    console.log(failedRequests.join("\n") || "(none)");

    await page.screenshot({ path: "flow-editor-retry.png", fullPage: false });
    console.log("Saved flow-editor-retry.png");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
