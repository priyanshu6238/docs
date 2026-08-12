// Throwaway debugging script, NOT part of the pipeline. Tests whether clicking
// the real "HSM Templates" sidebar link (client-side NavLink, per
// glific-frontend's src/components/UI/Layout/Navigation/SideMenus/SideMenus.tsx)
// renders the Template page correctly, vs. a raw page.goto('/template') which
// has been observed rendering the Chat shell underneath the /template URL even
// though this staging account has full Glific admin access.

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
  const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log("Body text (first 300 chars):", bodySnippet);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await login(page);
    await dump(page, "after login (landed on /chat)");

    // Raw navigation, for comparison with what take-screenshots.mjs does.
    await page.goto(`${STAGING_URL}/template`, { waitUntil: "load" });
    await page.waitForTimeout(3_000);
    await dump(page, "after raw page.goto('/template')");
    await page.screenshot({ path: "raw-goto-template.png" });

    // Back to a clean /chat, then click the real sidebar link like a real user would.
    await page.goto(`${STAGING_URL}/chat`, { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    await page.getByText("HSM Templates", { exact: true }).click();
    await page.waitForTimeout(3_000);
    await dump(page, "after clicking the 'HSM Templates' sidebar link");
    await page.screenshot({ path: "clicked-sidebar-template.png" });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
