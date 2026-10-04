import { defineConfig, runnerImport, type Plugin, type ViteDevServer } from "vite";

type Prerender = typeof import("./src/prerender.tsx");
const PRERENDER = "/src/prerender.tsx";
const JSX = { oxc: { jsx: { runtime: "automatic" as const, importSource: "react" } } };

/**
 * The Persian landing is rendered once at build time into index.html (<!--app-->), so it reads
 * before any JavaScript runs and search engines see it; the browser then takes it over.
 */
function prerender(): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: "layla-prerender",
    configureServer(s) {
      server = s;
    },
    async transformIndexHtml(html) {
      const mod = server
        ? ((await server.ssrLoadModule(PRERENDER)) as Prerender)
        : (await runnerImport<Prerender>(PRERENDER, { configFile: false, root: import.meta.dirname, ...JSX, logLevel: "error" })).module;
      return html.replace("<!--app-->", mod.render());
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
