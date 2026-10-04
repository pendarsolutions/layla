import type { Lang } from "../copy.ts";
import { COPY } from "../copy.ts";

const KEY = "layla:lang";

/** ?lang=en in the address wins, then the visitor's last choice, then Persian. */
export function detectLang(): Lang {
  if (typeof window === "undefined") return "fa";
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "fa") return q;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "fa") return saved;
  } catch {
    /* storage may be blocked */
  }
  return "fa";
}

export function applyLang(lang: Lang) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === "fa" ? "rtl" : "ltr";
  document.title = COPY[lang].title;
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* fine */
  }
  const url = new URL(location.href);
  if (lang === "fa") url.searchParams.delete("lang");
  else url.searchParams.set("lang", lang);
  history.replaceState(null, "", url);
}
