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

import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

const STAGING_URL = requireEnv("GLIFIC_STAGING_URL").replace(/\/+$/, "");
const PHONE = requireEnv("GLIFIC_STAGING_PHONE");
const PASSWORD = requireEnv("GLIFIC_STAGING_PASSWORD");
const ISSUE_NUMBER = requireEnv("ISSUE_NUMBER");

const PLACEHOLDER_RE = /!\[\]\(SCREENSHOT:([a-z0-9-]+):([^)]+)\)/g;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

function changedDocFiles() {
  const output = execSync("git status --porcelain -- docs", {
    encoding: "utf8",
  });
  return output
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter((path) => path.endsWith(".md") || path.endsWith(".mdx"));
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

async function login(page) {
  await page.goto(`${STAGING_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="phoneNumber"]', PHONE);
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
  await page.waitForLoadState("networkidle");
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
      await page.goto(`${STAGING_URL}${route}`, { waitUntil: "networkidle" });
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
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
