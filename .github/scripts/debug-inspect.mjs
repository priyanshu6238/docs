// Throwaway debugging script, NOT part of the pipeline.

import { chromium } from "playwright";

const STAGING_URL = process.env.GLIFIC_STAGING_URL.replace(/\/+$/, "");
const PHONE = process.env.GLIFIC_STAGING_PHONE;
const PASSWORD = process.env.GLIFIC_STAGING_PASSWORD;
const STAGING_HOST = new URL(STAGING_URL).hostname;

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

  const apiRequests = [];
  page.on("request", (req) => {
    try {
      const u = new URL(req.url());
      // Same host (or an api./graphql-looking subdomain of it) only —
      // exclude Sentry/analytics/third-party telemetry entirely.
      if (req.method() === "POST" && (u.hostname === STAGING_HOST || u.hostname.includes(STAGING_HOST.split(".").slice(-2).join(".")))) {
        apiRequests.push(req.url());
      }
    } catch {}
  });

  try {
    await login(page);
    console.log("Logged in. URL:", page.url());
    await page.waitForTimeout(3_000);

    const uniqueApiHosts = [...new Set(apiRequests.map((u) => new URL(u).origin + new URL(u).pathname))];
    console.log("=== POST endpoints seen on/near staging host ===");
    console.log(JSON.stringify(uniqueApiHosts, null, 2));

    if (uniqueApiHosts.length === 0) {
      console.log("No same-host POST requests observed — nothing to query with.");
      return;
    }

    const graphqlUrl = uniqueApiHosts.find((u) => /\/api\/?$/.test(u)) || uniqueApiHosts[0];
    console.log("Using GraphQL endpoint:", graphqlUrl);
    const flows = await page.evaluate(async (url) => {
      const session = JSON.parse(localStorage.getItem("glific_session") || "{}");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: session.access_token || "" },
        body: JSON.stringify({
          query: `query { flows(filter: {}, opts: {limit: 30, order: DESC, orderWith: "updated_at"}) { id name } }`,
        }),
      });
      return { status: res.status, body: await res.text() };
    }, graphqlUrl);
    console.log("=== flows query result ===");
    console.log(JSON.stringify(flows, null, 2));

    // If we got flow IDs, try opening the first one's editor directly and
    // screenshot it — this is the actual route that matters, not /flow.
    let flowId;
    try {
      const parsed = JSON.parse(flows.body);
      flowId = parsed?.data?.flows?.[0]?.id;
    } catch {}

    if (flowId) {
      console.log(`Opening /flow/configure/${flowId}`);
      await page.goto(`${STAGING_URL}/flow/configure/${flowId}`, { waitUntil: "load" });
      await page.waitForTimeout(5_000);
      console.log("=== /flow/configure URL after nav ===", page.url());
      await page.screenshot({ path: "flow-editor.png", fullPage: false });
      console.log("Saved flow-editor.png");
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
