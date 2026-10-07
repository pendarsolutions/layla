/**
 * The site's own words, Persian and English. Layla's voice (guidelines «لحن»): plain, formal with
 * «شما», Layla always in the third person, never "writes", "understands" or "summarises": it picks
 * one of your options and says how sure it is. The kit's components bring their own words.
 */
import type { QuestionType, Result } from "@pendar/layla";
import { resultIn } from "./en.ts";

export type Lang = "fa" | "en";

type Q = { id: string; type: QuestionType; kind: string; question: string; options: string[] };

export interface Copy {
  title: string;
  nav: { try: string; api: string; signIn: string; account: string; lang: string; langShort: string; skip: string; home: string; label: string };
  hero: { title: string; lead: string; try: string; key: string };
  /** `gloss`: the message in the reader's language when that isn't Persian (Layla reads the Persian). */
  message: { title: string; body: string; label: string; text: string; marks: string[]; gloss?: string };
  questions: { title: string; body: string; list: Q[] };
  rule: string;
  answers: { title: string; body: string; sample: string; results: Result[] };
  speed: { title: string; body: string; under: string; number: number; unit: string };
  sectors: { title: string; body: string; try: string };
  dev: { title: string; body: string; key: string; docs: string };
  live: { label: string };
  chat: {
    empty: string;
    placeholder: string;
    send: string;
    stop: string;
    questions: (n: number) => string;
    questionsTitle: string;
    yours: string;
    done: string;
    meta: (n: number, ms: number) => string;
    left: (n: number) => string;
    retry: string;
    restart: string;
    you: string;
    layla: string;
    errors: Record<string, string>;
  };
  pages: {
    docs: {
      title: string;
      lead: string;
      key: string;
      yourKeys: string;
      reference: string;
      start: string;
      answers: string;
      step1: string;
      step1Out: string;
      step1In: string;
      step2: string;
      step3: string;
    };
    keys: { title: string; leadOut: string; noSignIn: string; try: string };
    account: {
      newKey: string;
      signOut: string;
      left: string;
      usedOf: (used: string, limit: string) => string;
      premium: string;
      usage: string;
      requests: string;
      today: string;
      nextTitle: string;
      nextBody: string;
      nextGo: string;
    };
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

/** What a page in English shows for the same three questions; they still go to Layla in Persian. */
const QUESTIONS_EN: Q[] = [
  { id: "team", type: "choice", kind: "One of several", question: "Which team is this message for?", options: ["Sales", "Support", "Billing"] },
  { id: "cancel", type: "yes_no", kind: "Yes or no", question: "Does the customer want to cancel the order?", options: ["Yes", "No"] },
  { id: "urgency", type: "scale", kind: "A level", question: "How urgent is this message?", options: ["Normal", "Important", "Urgent"] },
];

/**
 * The story's answers, marked as an example: Layla's own for this message and these questions
 * (asked live on 2026-10-07; the live chat below answers for real).
 */
const opt = (key: string, label: string, probability: number) => ({ key, label, probability });
const result = (r: Pick<Result, "id" | "type" | "answer" | "label" | "probability" | "options"> & { level?: number }): Result => ({
  confidence: r.probability,
  duration_ms: 31,
  cached: false,
  level: r.level ?? null,
  ...r,
});
const RESULTS: Result[] = [
  result({ id: "team", type: "choice", answer: "مالی", label: "مالی", probability: 0.85, options: [opt("مالی", "مالی", 0.85), opt("پشتیبانی", "پشتیبانی", 0.08), opt("فروش", "فروش", 0.07)] }),
  result({ id: "cancel", type: "yes_no", answer: "yes", label: "بله", probability: 0.86, options: [opt("yes", "بله", 0.86), opt("no", "خیر", 0.14)] }),
  result({ id: "urgency", type: "scale", answer: "1", label: "مهم", probability: 0.75, level: 1, options: [opt("0", "عادی", 0.04), opt("1", "مهم", 0.75), opt("2", "فوری", 0.21)] }),
];

const faNum = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

const SUPPORT_TEXT = "سلام، سه روز است سفارشم را ثبت کرده‌ام و هنوز خبری نیست. اگر تا فردا نرسد لغوش می‌کنم و پولم را می‌خواهم.";

const fa: Copy = {
  title: "لیلا: متن فارسی را می‌خواند و به پرسش‌های شما پاسخ می‌دهد",
  nav: { try: "امتحان کنید", api: "API", signIn: "ورود", account: "حساب شما", lang: "English", langShort: "EN", skip: "رفتن به محتوا", home: "لیلا، صفحهٔ اول", label: "صفحه‌ها" },
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
    docs: "API",
  },
  live: { label: "امتحان لیلا" },
  chat: {
    empty: "متنی بفرستید تا لیلا بخواند.",
    placeholder: "متنی فارسی بنویسید یا بچسبانید…",
    send: "بفرستید",
    stop: "بس کنید",
    questions: (n) => `${faNum(n)} پرسش`,
    questionsTitle: "پرسش‌ها",
    yours: "پرسش خودتان",
    done: "انجام شد",
    meta: (n, ms) => `${faNum(n)} پاسخ در ${faNum(Math.max(0.1, Math.round(ms / 100) / 10))} ثانیه`,
    left: (n) => `${faNum(n)} نویسه مانده`,
    retry: "دوباره بفرستید",
    restart: "گفت‌وگوی تازه",
    you: "شما",
    layla: "لیلا",
    errors: {
      network: "به لیلا وصل نشد. اتصال را بررسی کنید.",
      rate_limited: "درخواست‌ها زیاد شد. کمی بعد دوباره بفرستید.",
      busy: "لیلا الان مشغول است. کمی بعد دوباره بفرستید.",
      text_too_long: "متن بلندتر از حد این صفحه است.",
      default: "این بار پاسخی نرسید.",
    },
  },
  pages: {
    docs: {
      title: "API لیلا",
      lead: "متن و پرسش‌هایتان را بفرستید؛ برای هر پرسش یکی از گزینه‌هایتان با احتمالش برمی‌گردد.",
      key: "کلید بسازید",
      yourKeys: "کلیدهای شما",
      reference: "مرجع فنی کامل",
      start: "شروع کنید",
      answers: "پاسخ",
      step1: "کلید بسازید",
      step1Out: "با حساب گوگل وارد شوید و یک کلید API بسازید. هر حساب ۱۰۰ درخواست رایگان دارد.",
      step1In: "وارد شده‌اید. در صفحهٔ حسابتان کلیدی بسازید و همان لحظه کپی کنید؛ فقط یک بار نشان داده می‌شود.",
      step2: "درخواست بفرستید",
      step3: "پاسخ‌ها را بخوانید",
    },
    keys: {
      title: "کلیدهای API",
      leadOut: "لیلا را به برنامهٔ خودتان وصل کنید. با حساب گوگل وارد شوید؛ هر حساب ۱۰۰ درخواست رایگان دارد.",
      noSignIn: "امتحان کردن لیلا ورود نمی‌خواهد.",
      try: "امتحان کنید",
    },
    account: {
      newKey: "کلید بسازید",
      signOut: "خروج",
      left: "درخواست رایگان مانده",
      usedOf: (used, limit) => `${used} از ${limit} به کار رفته`,
      premium: "نسخهٔ ویژه به‌زودی",
      usage: "مصرف ۳۰ روز گذشته",
      requests: "درخواست",
      today: "امروز",
      nextTitle: "اولین درخواست را بفرستید",
      nextBody: "نمونهٔ کد، شکل پاسخ و همهٔ جزئیات در صفحهٔ API.",
      nextGo: "API",
    },
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
  nav: { try: "Try it", api: "API", signIn: "Sign in", account: "Your account", lang: "فارسی", langShort: "فا", skip: "Skip to content", home: "Layla, home", label: "Pages" },
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
    gloss: "Hi, I placed my order three days ago and still haven't heard anything. If it doesn't arrive by tomorrow I'll cancel it, and I want my money back.",
  },
  questions: {
    title: "You ask your questions",
    body: "Each question brings its own options: one of several, yes or no, or a level. Layla answers best when they're asked in Persian; here they're shown in English.",
    list: QUESTIONS_EN,
  },
  rule: "Layla never writes text of its own. Every answer is one of the options you gave it, with its probability.",
  answers: {
    title: "Layla picks one and says how sure it is",
    body: "When the options are close, the answer is marked unsure: pass that message to a person.",
    sample: "Example",
    results: RESULTS.map((r) => resultIn(r, "en")),
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
    docs: "API",
  },
  live: { label: "Try Layla" },
  chat: {
    empty: "Send a Persian text for Layla to read.",
    placeholder: "Write or paste a Persian text…",
    send: "Send",
    stop: "Stop",
    questions: (n) => `${n} question${n === 1 ? "" : "s"}`,
    questionsTitle: "Questions",
    yours: "Your own question",
    done: "Done",
    meta: (n, ms) => `${n} answer${n === 1 ? "" : "s"} in ${Math.max(0.1, Math.round(ms / 100) / 10)} s`,
    left: (n) => `${n} characters left`,
    retry: "Send again",
    restart: "New chat",
    you: "You",
    layla: "Layla",
    errors: {
      network: "Couldn't reach Layla. Check your connection.",
      rate_limited: "Too many requests. Send again in a little while.",
      busy: "Layla is busy right now. Send again in a little while.",
      text_too_long: "The text is longer than this page allows.",
      default: "No answer came this time.",
    },
  },
  pages: {
    docs: {
      title: "The Layla API",
      lead: "Send a text and your questions; each question comes back with one of your options and its probability.",
      key: "Create a key",
      yourKeys: "Your keys",
      reference: "Full technical reference",
      start: "Start here",
      answers: "answers",
      step1: "Create a key",
      step1Out: "Sign in with Google and create an API key. Every account gets 100 free requests.",
      step1In: "You're signed in. Create a key on your account page and copy it right away: it's shown only once.",
      step2: "Send a request",
      step3: "Read the answers",
    },
    keys: {
      title: "API keys",
      leadOut: "Connect Layla to your own program. Sign in with Google; every account gets 100 free requests.",
      noSignIn: "Trying Layla needs no sign-in.",
      try: "Try it",
    },
    account: {
      newKey: "Create a key",
      signOut: "Sign out",
      left: "free requests left",
      usedOf: (used, limit) => `${used} of ${limit} used`,
      premium: "Premium coming soon",
      usage: "Last 30 days",
      requests: "requests",
      today: "Today",
      nextTitle: "Send your first request",
      nextBody: "Code samples, the shape of the answer and every detail are on the API page.",
      nextGo: "API",
    },
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
