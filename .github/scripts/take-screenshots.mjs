// Scans the docs/ files Claude just edited for `SCREENSHOT:<slug>:<route>` placeholders,
// captures each route from the staging Glific instance, and rewrites the placeholder
// with a real image path. No AI involved here — purely mechanical, run after the
// Claude authoring step in .github/workflows/auto-docs.yml.
//
// Logs in once and reuses that single browser session for every screenshot in the run
// (Glific auth is phone number + password — see src/containers/Auth/Login/Login.tsx
// in glific-frontend: the field names are "phoneNumber" and "password", and the submit
// button is data-testid="SubmitButton"; login finishes with a hard page redirect away
// from /login rather than client-side routing).
//
// A placeholder can optionally be paired with an interaction-steps file at
// .github/screenshot-steps/<slug>.json (an array of {click|fill|wait|waitText|sleep}
// steps, run in order after navigating to the route and before the screenshot) for
// anything that needs more than "navigate and shoot" — a dialog behind a button click,
// a dropdown selection, typing into a field. See runStep() below for the exact schema.
// Claude determines selectors by reading data-testid attributes in glific-frontend
// source, never by guessing blind. The steps file is deleted after use — it's a
// build-time instruction, not something that belongs in the committed doc.

import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

const STAGING_URL = requireEnv("GLIFIC_STAGING_URL").replace(/\/+$/, "");
const PHONE = requireEnv("GLIFIC_STAGING_PHONE");
const PASSWORD = requireEnv("GLIFIC_STAGING_PASSWORD");
const ISSUE_NUMBER = requireEnv("ISSUE_NUMBER");

const PLACEHOLDER_RE = /!\[\]\(SCREENSHOT:([a-z0-9-]+):([^)]+)\)/g;
const STEPS_DIR = ".github/screenshot-steps";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

function changedDocFiles() {
  // -z (not plain --porcelain) because doc folder names contain spaces, e.g.
  // "docs/3. Product Features/..." — git double-quotes any path containing a
  // space in the default format, which silently broke a plain line-slice
  // parse (the trailing quote meant paths never matched .endsWith(".md")).
  // -z disables that quoting and NUL-delimits entries instead.
  const output = execSync("git status --porcelain -z -- docs", {
    encoding: "utf8",
  });
  const entries = output.split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const status = entries[i].slice(0, 2);
    const path = entries[i].slice(3);
    if (/^[RC]/.test(status)) {
      i += 1; // renames/copies: skip the paired old-path entry
    }
    files.push(path);
  }
  return files.filter((path) => path.endsWith(".md") || path.endsWith(".mdx"));
}

function findPlaceholders(files) {
  const found = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(PLACEHOLDER_RE)) {
      found.push({ file, full: match[0], slug: match[1], route: match[2] });
    }
  }
  return found;
}

function relativeImagePath(docFile, imagePath) {
  const rel = relative(dirname(docFile), imagePath);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

// PhoneInput (react-phone-input-2, country="in") prepends "+91" asynchronously
// after mount and re-derives the dial code from whatever's already in the
// field — a plain .fill() clears it first and breaks that derivation, so the
// form silently never validates. Ported from scripts/screenshot.js's proven
// fillPhone()/authenticate(): wait for the dial code to land, then click +
// press End + type only the local part, never clearing the field.
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

  const value = await phoneInput.inputValue();
  if (value !== `+${DIAL_CODE}${local}`) {
    throw new Error(`Phone field shows "${value}", expected "+${DIAL_CODE}${local}"`);
  }

  await page.fill('input[name="password"]', PASSWORD);

  try {
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 20_000,
      }),
      page.click('[data-testid="SubmitButton"]'),
    ]);
  } catch (err) {
    throw new Error(
      `Login to staging Glific instance (${STAGING_URL}) did not leave /login within 20s — check GLIFIC_STAGING_PHONE/GLIFIC_STAGING_PASSWORD. Underlying error: ${err.message}`
    );
  }
  // Not networkidle: the post-login app (Chat) holds a persistent WebSocket
  // open for live subscriptions, so "no network activity for 500ms" never
  // actually happens and this would time out on every run. "load" plus a
  // fixed settle delay is the reliable option once authenticated.
  await page.waitForLoadState("load");
  await page.waitForTimeout(2_000);
}

// Step schema (one recognized key per step object):
//   { "click": "<css selector>" }
//   { "fill": { "selector": "<css selector>", "text": "<text>" } }
//   { "wait": "<css selector>" }               — wait for it to appear
//   { "waitText": "<visible text>" }            — wait for it anywhere on the page
//   { "sleep": <ms> }                           — last resort; prefer wait/waitText
async function runStep(page, step) {
  if (step.click !== undefined) {
    await page.click(step.click, { timeout: 8_000 });
  } else if (step.fill !== undefined) {
    await page.fill(step.fill.selector, step.fill.text, { timeout: 8_000 });
  } else if (step.wait !== undefined) {
    await page.waitForSelector(step.wait, { timeout: 8_000 });
  } else if (step.waitText !== undefined) {
    await page.waitForFunction(
      (text) => document.body.innerText.includes(text),
      step.waitText,
      { timeout: 8_000 }
    );
  } else if (step.sleep !== undefined) {
    await page.waitForTimeout(step.sleep);
  } else {
    throw new Error(`Unrecognized screenshot step: ${JSON.stringify(step)}`);
  }
}

async function main() {
  const files = changedDocFiles();
  const placeholders = findPlaceholders(files);

  if (placeholders.length === 0) {
    console.log("No SCREENSHOT: placeholders found, nothing to capture.");
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  try {
    await login(page); // one session, reused for every capture below

    const replacements = new Map(); // file -> [{full, markdown}]
    for (const { file, full, slug, route } of placeholders) {
      const outDir = `static/img/generated/${ISSUE_NUMBER}`;
      const outPath = `${outDir}/${slug}.png`;
      mkdirSync(outDir, { recursive: true });

      console.log(`Capturing ${route} -> ${outPath}`);
      // Same reasoning as login(): this is all post-auth, so the persistent
      // chat WebSocket means networkidle would never resolve.
      await page.goto(`${STAGING_URL}${route}`, { waitUntil: "load" });
      await page.waitForTimeout(2_000);

      // The app can silently redirect elsewhere (a route needing a feature
      // flag/permission this account doesn't have, or just not existing,
      // falling back to a default landing page) — page.goto() succeeds
      // either way, so without this check a capture of the WRONG page looks
      // identical to a correct one. Caught in practice: three "Template
      // Library" screenshots that were all silently the Chats page instead.
      const expectedPath = new URL(route, STAGING_URL).pathname.replace(/\/+$/, "");
      const actualPath = new URL(page.url()).pathname.replace(/\/+$/, "");
      if (actualPath !== expectedPath) {
        throw new Error(
          `Navigating to ${route} silently redirected to ${actualPath} instead of staying there — refusing to screenshot the wrong page. Likely causes: the route doesn't exist, needs a feature flag/permission this staging account doesn't have, or the app fell back to its default landing page.`
        );
      }

      const stepsPath = `${STEPS_DIR}/${slug}.json`;
      if (existsSync(stepsPath)) {
        const steps = JSON.parse(readFileSync(stepsPath, "utf8"));
        console.log(`  Running ${steps.length} interaction step(s) from ${stepsPath}`);
        for (const step of steps) {
          await runStep(page, step);
        }
      }

      await page.screenshot({ path: outPath });

      const markdown = `![${slug}](${relativeImagePath(file, outPath)})`;
      const list = replacements.get(file) ?? [];
      list.push({ full, markdown });
      replacements.set(file, list);
    }

    for (const [file, list] of replacements) {
      let content = readFileSync(file, "utf8");
      for (const { full, markdown } of list) {
        content = content.split(full).join(markdown);
      }
      writeFileSync(file, content);
    }

    // Build-time instructions only — never belong in the committed doc.
    rmSync(STEPS_DIR, { recursive: true, force: true });
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
