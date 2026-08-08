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

    const results = [];
    for (const route of ["/flow", "/template", "/speed-send"]) {
      results.push(await checkRoute(page, route));
    }

    if (results.every(Boolean)) {
      console.log("=== ALL ROUTES REACHABLE ===");
    } else {
      console.log("=== SOME ROUTES STILL BLOCKED ===");
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
