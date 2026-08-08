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

    // Find flows via the GraphQL endpoint directly (avoids relying on UI
    // list rendering / another route hop). Confirmed from glific-frontend
    // source: token at localStorage.glific_session.access_token, endpoint is
    // GLIFIC_API_URL (${backend}/api) directly, no /graphql suffix.
    const flows = await page.evaluate(async () => {
      const session = JSON.parse(localStorage.getItem("glific_session") || "{}");
      const res = await fetch("/api", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: session.access_token || "" },
        body: JSON.stringify({
          query: `query { flows(filter: {}, opts: {limit: 20}) { id name } }`,
        }),
      });
      return { status: res.status, body: await res.text() };
    });
    console.log("=== flows query result ===");
    console.log(JSON.stringify(flows, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
