import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";
import { COPY, type Lang } from "./copy.ts";

const SITE = "https://pendarsolutions.ir/layla/";
const HEAD: Record<Lang, { url: string; locale: string; name: string; image: string; description: string; preview: string }> = {
  fa: {
    url: SITE,
    locale: "fa_IR",
    name: "لیلا",
    image: "og-fa.png",
    description:
      "لیلا متن فارسی را می‌خواند و به پرسش‌های شما درباره‌اش پاسخ می‌دهد: برای هر پرسش یکی از گزینه‌هایی را که خودتان داده‌اید برمی‌گزیند و می‌گوید چقدر مطمئن است. بی‌ثبت‌نام امتحان کنید.",
    preview: "لیلا متن فارسی را می‌خواند و به پرسش‌های شما درباره‌اش پاسخ می‌دهد.",
  },
  en: {
    url: `${SITE}?lang=en`,
    locale: "en_US",
    name: "Layla",
    image: "og-en.png",
    description:
      "Layla reads Persian text and answers your questions about it: for each question it picks one of the options you gave it, and says how sure it is. Try it without signing up.",
    preview: "Layla reads Persian text and answers your questions about it.",
  },
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The landing as HTML, at build time: Persian for index.html, English for en.html. */
export function render(lang: Lang = "fa"): string {
  return renderToString(<App initialLang={lang} initialRoute={{ name: "", params: new URLSearchParams() }} />);
}

/** The page's title and what search engines and link previews read, in one language; each page
 *  points at the other (the server sends en.html for ?lang=en). */
export function head(lang: Lang): string {
  const h = HEAD[lang];
  const other = HEAD[lang === "fa" ? "en" : "fa"];
  return [
    `<title>${esc(COPY[lang].title)}</title>`,
    `<meta name="description" content="${esc(h.description)}" />`,
    `<link rel="canonical" href="${h.url}" />`,
    `<link rel="alternate" hreflang="fa" href="${HEAD.fa.url}" />`,
    `<link rel="alternate" hreflang="en" href="${HEAD.en.url}" />`,
    `<link rel="alternate" hreflang="x-default" href="${HEAD.fa.url}" />`,
    `<meta property="og:site_name" content="${h.name}" />`,
    `<meta property="og:title" content="${esc(COPY[lang].title)}" />`,
    `<meta property="og:description" content="${esc(h.preview)}" />`,
    `<meta property="og:url" content="${h.url}" />`,
    `<meta property="og:image" content="${SITE}${h.image}" />`,
    `<meta property="og:locale" content="${h.locale}" />`,
    `<meta property="og:locale:alternate" content="${other.locale}" />`,
  ].join("\n    ");
}
