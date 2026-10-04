// Diagnosis pictures of the built site (../web) at /layla/, with /layla/api/* forwarded to the live
// Layla so the live box answers. Not a test suite.
//   node scripts/look.mjs <out-dir> <hash> <width>x<height> [dark] [still] [en] <scroll-in-screens>...
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(fileURLToPath(new URL("../../../Pendar/ui/node_modules/@playwright/test/index.mjs", import.meta.url))).href);
const root = fileURLToPath(new URL("../../web/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/layla/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const up = await fetch("https://pendarsolutions.ir" + url.pathname + url.search, {
      method: req.method,
      headers: { "content-type": req.headers["content-type"] ?? "application/json", "x-requested-with": "layla" },
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    }).catch(() => null);
    if (!up) return res.writeHead(502).end();
    res.writeHead(up.status, { "content-type": up.headers.get("content-type") ?? "application/json" });
    if (up.body) for await (const c of up.body) res.write(c);
    return res.end();
  }
  let path = url.pathname.replace(/^\/layla/, "") || "/";
  if (path.endsWith("/")) path += "index.html";
  try {
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(join(root, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/layla/`;

const [out, hash, size, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flags = new Set(rest.filter((r) => isNaN(Number(r))));
const stops = rest.filter((r) => !isNaN(Number(r))).map(Number);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width, height }, colorScheme: flags.has("dark") ? "dark" : "light", reducedMotion: flags.has("still") ? "reduce" : "no-preference" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(base + (flags.has("en") ? "?lang=en" : "") + (hash === "-" ? "" : hash), { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
const tag = `${hash === "-" ? "home" : hash.replace(/[#/?=]/g, "")}${flags.has("en") ? "-en" : ""}-${width}${flags.has("dark") ? "-dark" : ""}${flags.has("still") ? "-still" : ""}`;
const total = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(tag, "page height", total, "screens", (total / height).toFixed(1), "width", await page.evaluate(() => document.documentElement.scrollWidth));
for (const s of stops) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(s * height));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `L-${tag}-${String(s).replace(".", "_")}.png`) });
}
if (flags.has("run")) {
  // Try the live box for real: the first example, then «بفرستید» (or "Send"), and wait for the answers.
  const live = page.locator("#try");
  await live.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await live.getByRole("button").filter({ hasText: /پیام پشتیبانی|Support message/ }).first().click();
  await page.waitForTimeout(400);
  await live.getByRole("button", { name: /بفرستید|Send/ }).first().click();
  await page.waitForTimeout(9000);
  await live.screenshot({ path: join(out, `L-${tag}-run.png`) });
  console.log("answers:", await live.evaluate((el) => el.innerText.match(/[۰-۹0-9]+٪|[0-9]+%/g)?.join(" ")));
}
if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
await browser.close();
server.close();
