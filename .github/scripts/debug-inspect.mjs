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

    // Step 1: try a hard page.goto() to /flow (what take-screenshots.mjs does).
    await page.goto(`${STAGING_URL}/flow`, { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    console.log("=== /flow via page.goto() -> URL after nav ===", page.url());

    // Step 2: from wherever that landed, click the sidebar's Flows link instead
    // (client-side SPA navigation) and see if that actually works.
    await page.goto(`${STAGING_URL}/chat`, { waitUntil: "load" });
    await page.waitForTimeout(2_000);
    console.log("=== back on ===", page.url());
    await page.click('a[href="/flow"]');
    await page.waitForTimeout(2_000);
    console.log("=== /flow via sidebar click -> URL after nav ===", page.url());

    const flowLinks = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("a[href*='/flow/configure/']"));
      return rows.slice(0, 15).map((a) => ({ href: a.getAttribute("href"), text: a.textContent?.trim() }));
    });
    console.log("=== Flow links found ===");
    console.log(JSON.stringify(flowLinks, null, 2));

    console.log("=== Page title ===", await page.title());

    const anyLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).slice(0, 20).map((a) => a.getAttribute("href"))
    );
    console.log("=== First 20 <a href> on page ===");
    console.log(JSON.stringify(anyLinks, null, 2));

    const flowTestIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-testid]"))
        .map((el) => el.getAttribute("data-testid"))
        .filter((id) => /flow/i.test(id))
    );
    console.log("=== data-testid containing 'flow' ===");
    console.log(JSON.stringify(flowTestIds, null, 2));

    const mainEl = await page.evaluate(() => {
      const main = document.querySelector("main") || document.querySelector('[role="main"]');
      return main ? main.innerText.slice(0, 2000) : "(no <main> or role=main found)";
    });
    console.log("=== <main> innerText (first 2000 chars) ===");
    console.log(mainEl);

    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    console.log("=== total body innerText length ===", bodyLen);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
