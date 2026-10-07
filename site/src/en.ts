/**
 * Layla in English. Layla reads Persian and is asked best in Persian (an English question about the
 * same text gets a weaker answer), so what goes to the API stays Persian; this is what an English
 * reader sees instead: the kit's sectors and examples (Persian only in @pendar/layla), the questions
 * they ask, the labels the API answers with, and a translation of each example text.
 */
import type { OutputSpec, Result } from "@pendar/layla";
import type { Lang } from "./copy.ts";

/** The sectors (kit SERVICES, by id): who each is for and what it does, and its example in English. */
export const SERVICES_EN: Record<string, { title: string; for: string; what: string; gloss: string }> = {
  support: {
    title: "Sorting support messages",
    for: "For support teams and contact centres",
    what: "Tells each message's purpose, urgency and the customer's tone, so it reaches the right person sooner.",
    gloss: "Hi, I placed my order three days ago and still haven't heard anything. If it doesn't arrive by tomorrow I'll cancel it, and I want my money back.",
  },
  reviews: {
    title: "Reading shoppers' reviews",
    for: "For online shops and brands",
    what: "Takes the star rating, the tone and whether the buyer recommends it from every review, without anyone reading them all.",
    gloss: "The headphones sound great, but after two weeks one side keeps cutting out. At this price I expected more.",
  },
  filter: {
    title: "Filtering texts and email",
    for: "For banks, operators and inboxes",
    what: "Sets ads and scams apart, and points out messages that ask for a password or a verification code.",
    gloss: "Congratulations! You've won a car. To claim your prize, tap the link right now and enter the verification code.",
  },
  moderation: {
    title: "Moderating comments",
    for: "For social networks, forums and comment sections",
    what: "Weighs insults and the mood of a post, so hurtful comments are seen before they're published.",
    gloss: "What kind of support is this? Every time I call you give the same answer. Shameful, really.",
  },
  news: {
    title: "Sorting the news",
    for: "For news agencies and media monitoring",
    what: "Puts each story in the right section and says whether it's written formally or casually.",
    gloss: "The central bank reported a drop in monthly inflation in Shahrivar and said its tight policies will continue.",
  },
  routing: {
    title: "Routing requests to the right team",
    for: "For organisations with a shared inbox",
    what: "With a question of your own, sends each request to the team responsible; define the options however you like.",
    gloss: "Hello, last month's invoice was charged to our account twice. Please look into it and refund the extra amount.",
  },
};

/** The chat's examples (kit EXAMPLES, by id). */
export const EXAMPLES_EN: Record<string, string> = {
  support: "Support message",
  review: "Shopper's review",
  news: "News headline",
  sms: "Unknown text message",
};

/** The Persian questions the sectors and the story ask, in English. */
const QUESTIONS_EN: Record<string, string> = {
  "آیا مشتری می‌خواهد سفارش را لغو کند؟": "Does the customer want to cancel the order?",
  "آیا از خواننده رمز یا کد تأیید می‌خواهد؟": "Does it ask the reader for a password or a code?",
  "این درخواست به کدام واحد مربوط است؟": "Which team is this request for?",
  "این پیام به کدام واحد مربوط است؟": "Which team is this message for?",
  "رسیدگی به این پیام چقدر عجله دارد؟": "How urgent is this message?",
};

/**
 * The labels the API answers with, in English: the ready-made outputs' options (app/catalog.py),
 * yes or no, and the options the sectors and the story give.
 */
const LABELS_EN: Record<string, string> = {
  مثبت: "Positive",
  منفی: "Negative",
  خنثی: "Neutral",
  دوگانه: "Mixed",
  شادی: "Joy",
  غم: "Sadness",
  خشم: "Anger",
  ترس: "Fear",
  شگفتی: "Surprise",
  انزجار: "Disgust",
  "بدون احساس خاص": "No particular feeling",
  خودمانی: "Casual",
  "نیمه‌رسمی": "Semi-formal",
  رسمی: "Formal",
  پرسش: "Question",
  درخواست: "Request",
  "گزارش مشکل": "Problem report",
  شکایت: "Complaint",
  تشکر: "Thanks",
  پیشنهاد: "Suggestion",
  عادی: "Normal",
  مهم: "Important",
  فوری: "Urgent",
  تبلیغاتی: "Advertising",
  "کلاه‌برداری": "Scam",
  "توهین ندارد": "No insult",
  "توهین دارد": "Insulting",
  "۱ ستاره": "1 star",
  "۲ ستاره": "2 stars",
  "۳ ستاره": "3 stars",
  "۴ ستاره": "4 stars",
  "۵ ستاره": "5 stars",
  "پیشنهاد می‌کند": "Recommends it",
  "پیشنهاد نمی‌کند": "Doesn't recommend it",
  "نظری ندارد": "No opinion",
  سیاست: "Politics",
  اقتصاد: "Economy",
  ورزش: "Sport",
  اجتماعی: "Society",
  "بین‌الملل": "International",
  "علم و فناوری": "Science and technology",
  "فرهنگ و هنر": "Culture and art",
  بله: "Yes",
  خیر: "No",
  نه: "No",
  فروش: "Sales",
  پشتیبانی: "Support",
  "پشتیبانی فنی": "Technical support",
  مالی: "Billing",
  "منابع انسانی": "Human resources",
};

/** A label in the reader's language; anything not in the table (the reader's own options) as written. */
export const labelIn = (label: string, lang: Lang) => (lang === "en" ? (LABELS_EN[label] ?? label) : label);

/** A question of the sectors' or the story's in the reader's language; the reader's own as written. */
export const questionIn = (q: string, lang: Lang) => (lang === "en" ? (QUESTIONS_EN[q] ?? q) : q);

/** A result shown in English: its label and every option's label, nothing else changed. */
export const resultIn = (r: Result, lang: Lang): Result =>
  lang === "en" ? { ...r, label: labelIn(r.label, lang), options: r.options.map((o) => ({ ...o, label: labelIn(o.label, lang) })) } : r;

/** Whether a question is one of the page's own (so its title can be shown in English). */
export const titleIn = (o: OutputSpec, lang: Lang) => (o.question ? questionIn(o.question, lang) : undefined);
