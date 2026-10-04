/**
 * The site's own words, Persian and English. Layla's voice (guidelines «لحن»): plain, formal with
 * «شما», Layla always in the third person, never "writes", "understands" or "summarises": it picks
 * one of your options and says how sure it is. The kit's components bring their own words.
 */
import type { QuestionType, Result } from "@pendar/layla";

export type Lang = "fa" | "en";

type Q = { id: string; type: QuestionType; kind: string; question: string; options: string[] };

export interface Copy {
  title: string;
  nav: { play: string; services: string; docs: string; keys: string; signIn: string; lang: string; skip: string };
  hero: { title: string; lead: string; try: string; key: string };
  message: { title: string; body: string; label: string; text: string; marks: string[] };
  questions: { title: string; body: string; list: Q[] };
  rule: string;
  answers: { title: string; body: string; sample: string; results: Result[] };
  speed: { title: string; body: string; under: string; number: number; unit: string };
  sectors: { title: string; body: string; try: string };
  dev: { title: string; body: string; key: string; docs: string };
  live: { title: string; body: string; limits: string };
  pages: {
    play: { title: string; lead: string };
    services: { title: string; lead: string };
    docs: { title: string; lead: string };
    keys: { title: string; lead: string; signOut: string; sample: string };
    login: { notSetUp: string; failed: string; devEmail: string; devButton: string };
    error: string;
    network: string;
  };
}

const QUESTIONS_FA: Q[] = [
  { id: "team", type: "choice", kind: "یکی از چند گزینه", question: "این پیام به کدام واحد مربوط است؟", options: ["فروش", "پشتیبانی", "مالی"] },
  { id: "cancel", type: "yes_no", kind: "بله یا نه", question: "آیا مشتری می‌خواهد سفارش را لغو کند؟", options: ["بله", "نه"] },
  { id: "urgency", type: "scale", kind: "یک سطح", question: "رسیدگی به این پیام چقدر عجله دارد؟", options: ["عادی", "مهم", "فوری"] },
];

/** Answers to show in the story, marked as an example: Layla's real ones come from the live box below. */
const opt = (key: string, label: string, probability: number) => ({ key, label, probability });
const result = (r: Pick<Result, "id" | "type" | "answer" | "label" | "probability" | "options"> & { level?: number }): Result => ({
  confidence: r.probability,
  duration_ms: 31,
  cached: false,
  level: r.level ?? null,
  ...r,
});
const RESULTS: Result[] = [
  result({ id: "team", type: "choice", answer: "پشتیبانی", label: "پشتیبانی", probability: 0.81, options: [opt("پشتیبانی", "پشتیبانی", 0.81), opt("فروش", "فروش", 0.12), opt("مالی", "مالی", 0.07)] }),
  result({ id: "cancel", type: "yes_no", answer: "yes", label: "بله", probability: 0.79, options: [opt("yes", "بله", 0.79), opt("no", "نه", 0.21)] }),
  result({ id: "urgency", type: "scale", answer: "1", label: "مهم", probability: 0.58, level: 1, options: [opt("0", "عادی", 0.12), opt("1", "مهم", 0.58), opt("2", "فوری", 0.3)] }),
];

const SUPPORT_TEXT = "سلام، سه روز است سفارشم را ثبت کرده‌ام و هنوز خبری نیست. اگر تا فردا نرسد لغوش می‌کنم و پولم را می‌خواهم.";

const fa: Copy = {
  title: "لیلا: متن فارسی را می‌خواند و به پرسش‌های شما پاسخ می‌دهد",
  nav: { play: "آزمایش", services: "خدمات", docs: "مستندات", keys: "کلیدها", signIn: "ورود", lang: "English", skip: "رفتن به محتوا" },
  hero: {
    title: "لیلا متن فارسی را می‌خواند و به پرسش‌های شما درباره‌اش پاسخ می‌دهد.",
    lead: "برای هر پرسش، یکی از گزینه‌هایی را که خودتان داده‌اید برمی‌گزیند و می‌گوید چقدر مطمئن است.",
    try: "امتحان کنید",
    key: "کلید بسازید",
  },
  message: {
    title: "یک متن می‌فرستید",
    body: "یک پیام پشتیبانی، نظر یک خریدار، یک تیتر خبر یا یک پیامک.",
    label: "پیام مشتری",
    text: SUPPORT_TEXT,
    marks: ["هنوز خبری نیست", "لغوش می‌کنم", "پولم را می‌خواهم"],
  },
  questions: {
    title: "پرسش‌هایتان را می‌پرسید",
    body: "هر پرسش گزینه‌های خودش را دارد: یکی از چند گزینه، بله یا نه، یا یک سطح.",
    list: QUESTIONS_FA,
  },
  rule: "لیلا هرگز متنی از خودش نمی‌نویسد. هر پاسخ یکی از گزینه‌هایی است که خودتان داده‌اید، با احتمالش.",
  answers: {
    title: "لیلا یکی را برمی‌گزیند و می‌گوید چقدر مطمئن است",
    body: "وقتی گزینه‌ها به هم نزدیک‌اند، پاسخ برچسب «نامطمئن» می‌گیرد؛ آن پیام را به یک نفر بسپارید.",
    sample: "نمونه",
    results: RESULTS,
  },
  speed: {
    title: "پاسخ‌ها یکی‌یکی می‌رسند",
    body: "لیلا برای هر پرسش یک بار متن را می‌خواند و هر پاسخ همان لحظه که آماده شد می‌رسد. روی کارت گرافیک یک لپ‌تاپ معمولی، هر پاسخ کمتر از ۵۰ میلی‌ثانیه طول می‌کشد.",
    under: "کمتر از",
    number: 50,
    unit: "میلی‌ثانیه",
  },
  sectors: {
    title: "برای تیم‌هایی که متن زیادی می‌خوانند",
    body: "پشتیبانی، فروشگاه، بانک و اپراتور، شبکهٔ اجتماعی، خبرگزاری و هر صندوق پیام مشترک.",
    try: "امتحان کنید",
  },
  dev: {
    title: "در محصول خودتان",
    body: "با یک کلید API، لیلا را به سامانهٔ پشتیبانی، فروشگاه یا هر برنامهٔ دیگری وصل کنید. هر حساب ۱۰۰ درخواست رایگان دارد.",
    key: "کلید بسازید",
    docs: "مستندات",
  },
  live: {
    title: "خودتان امتحان کنید",
    body: "بی‌ثبت‌نام. متنی بنویسید یا یکی از نمونه‌ها را بردارید.",
    limits: "در این صفحه، هر متن تا ۴٬۰۰۰ نویسه و هر دقیقه تا ۳۰ درخواست.",
  },
  pages: {
    play: { title: "صفحهٔ آزمایش", lead: "متنی بنویسید، پرسش‌هایتان را انتخاب کنید و بفرستید؛ پاسخ‌ها همان لحظه که آماده شوند می‌رسند." },
    services: { title: "خدمات", lead: "شش بخشی که لیلا برایشان کار می‌کند، هر کدام با نمونه‌ای که همان‌جا امتحان می‌شود." },
    docs: { title: "مستندات", lead: "هر آنچه برای فرستادن اولین درخواست به لیلا لازم دارید." },
    keys: { title: "کلیدها", lead: "کلیدهای API، درخواست‌های رایگان و مصرف ۳۰ روز گذشته.", signOut: "خروج", sample: "نمونهٔ درخواست" },
    login: {
      notSetUp: "ورود با گوگل هنوز روی این سرور راه نیفتاده است.",
      failed: "ورود با گوگل تأیید نشد. دوباره امتحان کنید.",
      devEmail: "ایمیل (فقط در محیط آزمایشی)",
      devButton: "وارد شوید",
    },
    error: "کار انجام نشد. دوباره امتحان کنید.",
    network: "به سرور لیلا وصل نشد. اتصال را بررسی کنید.",
  },
};

const en: Copy = {
  title: "Layla: reads Persian text and answers your questions about it",
  nav: { play: "Try it", services: "Services", docs: "Docs", keys: "Keys", signIn: "Sign in", lang: "فارسی", skip: "Skip to content" },
  hero: {
    title: "Layla reads Persian text and answers your questions about it.",
    lead: "For each question it picks one of the options you gave it, and says how sure it is.",
    try: "Try it",
    key: "Create a key",
  },
  message: {
    title: "You send a text",
    body: "A support message, a shopper's review, a news headline or a text message. Layla reads Persian.",
    label: "Customer message",
    text: SUPPORT_TEXT,
    marks: fa.message.marks,
  },
  questions: {
    title: "You ask your questions",
    body: "Each question brings its own options: one of several, yes or no, or a level. They can be asked in Persian.",
    list: QUESTIONS_FA,
  },
  rule: "Layla never writes text of its own. Every answer is one of the options you gave it, with its probability.",
  answers: {
    title: "Layla picks one and says how sure it is",
    body: "When the options are close, the answer is marked unsure: pass that message to a person.",
    sample: "Example",
    results: RESULTS,
  },
  speed: {
    title: "Answers arrive one by one",
    body: "Layla reads the text once for each question, and each answer arrives the moment it's ready. On a standard laptop GPU, each answer takes under 50 milliseconds.",
    under: "under",
    number: 50,
    unit: "milliseconds",
  },
  sectors: {
    title: "For teams that read a lot of text",
    body: "Support, shops, banks and operators, social networks, newsrooms and every shared inbox.",
    try: "Try it",
  },
  dev: {
    title: "In your own product",
    body: "With an API key, connect Layla to your support desk, your shop or any other program. Every account gets 100 free requests.",
    key: "Create a key",
    docs: "Docs",
  },
  live: {
    title: "Try it yourself",
    body: "No sign-up. Write a Persian text, or pick one of the examples.",
    limits: "On this page, each text up to 4,000 characters and up to 30 requests a minute.",
  },
  pages: {
    play: { title: "Playground", lead: "Write a text, choose your questions and send; each answer arrives the moment it's ready." },
    services: { title: "Services", lead: "Six sectors Layla works for, each with an example you can try right there." },
    docs: { title: "Docs", lead: "Everything you need to send Layla your first request." },
    keys: { title: "Keys", lead: "Your API keys, free requests and the last 30 days of use.", signOut: "Sign out", sample: "A sample request" },
    login: {
      notSetUp: "Google sign-in isn't set up on this server yet.",
      failed: "Google couldn't confirm the sign-in. Try again.",
      devEmail: "Email (test environment only)",
      devButton: "Sign in",
    },
    error: "That didn't work. Try again.",
    network: "Couldn't reach Layla's server. Check your connection.",
  },
};

export const COPY: Record<Lang, Copy> = { fa, en };
