// Screenshot every page of the site at 1200x630 and stage the results as
// per-route OpenGraph images:
//   - static routes  → app/<route>/opengraph-image.png   (Next file
//     convention: og:image + twitter:image tags appear automatically)
//   - docs pages     → public/og/docs/<slug>.png          (referenced by
//     generateMetadata in app/docs/[[...slug]]/page.tsx)
//
// The images are COMMITTED — regenerate when pages change:
//   npm run build && (PORT=3777 npm run start &) && node scripts/gen-og-images.mjs
//
// Uses the chromium already present in ~/.cache/ms-playwright (no browser
// download); BASE_URL overrides the target (default http://localhost:3777).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const BASE = process.env.BASE_URL ?? "http://localhost:3777";

function chromePath() {
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  const dirs = fs
    .readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const p = path.join(cache, d, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("no chromium in ~/.cache/ms-playwright");
}

// Static routes: app/**/page.tsx, minus dynamic/api/checkout/account.
function staticRoutes() {
  const skip = new Set(["api", "buy", "account"]);
  const routes = [];
  function walk(dir, route) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith("[") || skip.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      const r = `${route}/${e.name}`;
      if (fs.existsSync(path.join(sub, "page.tsx"))) routes.push(r);
      walk(sub, r);
    }
  }
  const appDir = path.join(root, "app");
  const out = ["/"];
  walk(appDir, "");
  return out.concat(routes);
}

function docSlugs() {
  const dir = path.join(root, "content", "docs");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

const browser = await chromium.launch({ executablePath: chromePath() });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1
});

async function shoot(url, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(350); // font/layout settle
  await page.screenshot({ path: outFile });
  console.log(`${url} → ${path.relative(root, outFile)}`);
}

for (const route of staticRoutes()) {
  const dest =
    route === "/"
      ? path.join(root, "app", "opengraph-image.png")
      : path.join(root, "app", ...route.split("/").filter(Boolean), "opengraph-image.png");
  await shoot(`${BASE}${route}`, dest);
}

for (const slug of docSlugs()) {
  const route = slug === "overview" ? "/docs" : `/docs/${slug}`;
  await shoot(`${BASE}${route}`, path.join(root, "public", "og", "docs", `${slug}.png`));
}

await browser.close();
console.log("done");
