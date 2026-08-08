// Throwaway debugging script, NOT part of the pipeline.

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

    const flowUuid = await page.evaluate(async () => {
      const session = JSON.parse(localStorage.getItem("glific_session") || "{}");
      const res = await fetch("https://api.staging.glific.com/api", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: session.access_token || "" },
        body: JSON.stringify({
          query: `query { flows(filter: {name: "test_bug"}, opts: {limit: 1}) { id name uuid } }`,
        }),
      });
      const json = await res.json();
      return json?.data?.flows?.[0];
    });
    console.log("=== test_bug flow ===", JSON.stringify(flowUuid));

    if (!flowUuid?.uuid) {
      console.log("No uuid found — stopping.");
      return;
    }

    await page.goto(`${STAGING_URL}/flow/configure/${flowUuid.uuid}`, { waitUntil: "load" });
    await page.waitForTimeout(5_000);
    console.log("=== flow editor URL ===", page.url());
    await page.screenshot({ path: "flow-editor-canvas.png", fullPage: false });

    // Try clicking a "Wait for Response" node by its visible text (canvas has
    // no data-testid, but the node label text is real DOM content).
    const waitNode = page.getByText("Wait for Response", { exact: false }).first();
    const count = await page.getByText("Wait for Response", { exact: false }).count();
    console.log(`Found ${count} "Wait for Response" text matches on canvas`);

    if (count > 0) {
      await waitNode.dblclick({ timeout: 8_000 });
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: "flow-editor-node-dialog.png", fullPage: false });
      console.log("Saved flow-editor-node-dialog.png after double-click");

      // Dump attributes of whatever is now visible in a dialog/modal, to find
      // real selectors for the response-type options.
      const dialogInfo = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"], .modal, [class*="Dialog" i], [class*="modal" i]');
        if (!dialog) return "(no dialog-like element found)";
        return dialog.outerHTML.slice(0, 4000);
      });
      console.log("=== dialog-like element outerHTML (first 4000 chars) ===");
      console.log(dialogInfo);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
