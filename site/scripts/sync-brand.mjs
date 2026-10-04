// Pulls Layla's brand files for the site from Specimen (brand "layla"): favicons and manifest,
// app icons and the link-preview images. Needs SPECIMEN_TOKEN (or ~/.specimen-token-landing).
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const token = process.env.SPECIMEN_TOKEN ?? readFileSync(join(homedir(), ".specimen-token-landing"), "utf8").trim();
const get = async (path) => {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch("https://specimen.karefun.ai/api/v1/brands/layla/assets/" + path + "/file", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`${res.status} ${path}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 700 * i));
    }
  }
};
const files = {
  "favicon.ico": "favicons/favicon-ico",
  "favicon.svg": "favicons/favicon-svg",
  "site.webmanifest": "favicons/site-webmanifest",
  "apple-touch-icon.png": "symbol/apple-touch-icon",
  "icon-192.png": "symbol/app-icon-192",
  "icon-512.png": "symbol/app-icon-512",
  "icon-maskable-192.png": "symbol/app-icon-maskable-192",
  "icon-maskable-512.png": "symbol/app-icon-maskable-512",
  "og-fa.png": "og/og-fa-night",
  "og-en.png": "og/og-en-night",
};
for (const [name, asset] of Object.entries(files)) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), await get(asset));
  console.log("  ", name);
}

// Specimen's manifest is written for a site at the root; this one lives in a folder (/layla/),
// so every address in it becomes relative.
const manifest = JSON.parse(readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8"));
manifest.start_url = "./";
manifest.scope = "./";
// "/layla-app-icon-192.png" -> "icon-192.png", "/layla-app-icon-maskable-512.png" -> "icon-maskable-512.png"
for (const icon of manifest.icons) icon.src = icon.src.replace(/^\/layla-app-/, "");
writeFileSync(new URL("../public/site.webmanifest", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
console.log("   site.webmanifest: addresses made relative");
