// Throwaway debugging script, NOT part of the pipeline. Logs in to staging and dumps
// DOM structure so real selectors can be found for things the source code can't reveal
// (e.g. @glific/flow-editor, a compiled third-party bundle with no inspectable source).
// Deleted once the investigation this exists for is done.

import { chromium } from "playwright";

const STAGING_URL = process.env.GLIFIC_STAGING_URL.replace(/\/+$/, "");
const PHONE = process.env.GLIFIC_STAGING_PHONE;
const PASSWORD = process.env.GLIFIC_STAGING_PASSWORD;

const DIAL_CODE = "91";
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
    console.log("Logged in OK. Current URL:", page.url());

    // Step 1: find a flow to open. List flows via the /flow page.
    await page.goto(`${STAGING_URL}/flow`, { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    console.log("=== /flow page URL after nav ===", page.url());

    const flowLinks = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("a[href*='/flow/configure/']"));
      return rows.slice(0, 15).map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim() }));
    });
    console.log("=== Flow links found ===");
    console.log(JSON.stringify(flowLinks, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
