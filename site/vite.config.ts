import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig, runnerImport, type Plugin, type ViteDevServer } from "vite";

type Prerender = typeof import("./src/prerender.tsx");
const PRERENDER = "/src/prerender.tsx";
const JSX = { oxc: { jsx: { runtime: "automatic" as const, importSource: "react" } } };
const OUT = join(import.meta.dirname, "../web");

/**
 * The landing is rendered at build time, so it reads before any JavaScript runs and search engines
 * and link previews see it; the browser then takes it over. index.html is the Persian page; en.html,
 * written from it once the build is done, is the English one (its own title, meta and landing),
 * which the server sends for ?lang=en.
 */
function prerender(): Plugin {
  let server: ViteDevServer | undefined;
  const load = async () =>
    server
      ? ((await server.ssrLoadModule(PRERENDER)) as Prerender)
      : (await runnerImport<Prerender>(PRERENDER, { configFile: false, root: import.meta.dirname, ...JSX, logLevel: "error" })).module;
  return {
    name: "layla-prerender",
    configureServer(s) {
      server = s;
    },
    async transformIndexHtml(html) {
      const mod = await load();
      return html.replace("<!--head-->", `<!--head-->${mod.head("fa")}<!--/head-->`).replace("<!--app-->", mod.render("fa"));
    },
    async closeBundle() {
      if (server) return;
      const mod = await load();
      const fa = await readFile(join(OUT, "index.html"), "utf8");
      const en = fa
        .replace('<html lang="fa" dir="rtl">', '<html lang="en" dir="ltr">')
        .replace(/<!--head-->[\s\S]*?<!--\/head-->/, () => `<!--head-->${mod.head("en")}<!--/head-->`)
        .replace(/<div id="root">[\s\S]*<\/div>(\s*<\/body>)/, (_, end: string) => `<div id="root">${mod.render("en")}</div>${end}`);
      if (en === fa || !en.includes('<html lang="en"')) throw new Error("en.html: index.html no longer has the shape it is written from");
      await writeFile(join(OUT, "en.html"), en);
    },
  };
}

export default defineConfig({
  ...JSX,
  // Relative addresses: the site is served at /layla/ (and works at any other folder too).
  base: "./",
  plugins: [prerender()],
  server: { port: 5320, strictPort: true, host: "127.0.0.1" },
  build: { outDir: "../web", emptyOutDir: true, target: "es2022", assetsInlineLimit: 0 },
});
