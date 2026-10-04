import "@pendar/ui/fonts/estedad.css";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyLang, detectLang } from "./lib/lang.ts";
import { parse } from "./lib/router.ts";

declare global {
  interface Window {
    __layla?: boolean;
  }
}
// The app has started: the safety timer in <head> may stand down.
window.__layla = true;

const root = document.getElementById("root")!;
const lang = detectLang();
const route = parse();
applyLang(lang);
// The Persian landing was rendered at build time: take it over. Anything else starts afresh.
if (root.firstElementChild && route.name === "" && lang === "fa") hydrateRoot(root, <App initialLang="fa" initialRoute={route} />);
else {
  root.replaceChildren();
  createRoot(root).render(<App initialLang={lang} initialRoute={route} />);
}
