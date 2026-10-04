import { useEffect, useState, type ReactNode } from "react";
import { CodeBlock, Icon } from "@pendar/ui";
import { CodeSample, OutputsTable } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { API, PUBLIC_API } from "../lib/api.ts";
import type { RouteName } from "../lib/router.ts";
import { Page, Words } from "../Shell.tsx";

const base = () => (typeof location === "undefined" ? PUBLIC_API : location.origin + API);
const C = ({ children }: { children: ReactNode }) => (
  <code dir="ltr" className="rounded-control bg-surface-sunken px-1.5 py-0.5 text-[0.9em]">
    {children}
  </code>
);

const REQUEST = `{
  "text": "سفارشم سه روز است نرسیده. لطفاً پولم را برگردانید.",
  "outputs": [
    {"id": "tone",   "preset": "sentiment"},
    {"id": "refund", "type": "yes_no", "question": "آیا مشتری پولش را پس می‌خواهد؟"},
    {"id": "team",   "type": "choice", "question": "به کدام واحد مربوط است؟", "options": ["فروش", "پشتیبانی", "مالی"]}
  ]
}`;
const RESPONSE = `{
  "request_id": "4aa274fc…",
  "model": "layla-1.0",
  "results": [
    {"id": "tone", "type": "choice", "answer": "منفی", "label": "منفی",
     "probability": 0.76, "options": [ … ], "confidence": 0.52}
  ],
  "truncated": false,
  "usage": {"input_tokens": 51}
}`;
const STREAM = `{"event": "start", "outputs": ["tone", "urgency"], …}
{"event": "result", "result": {"id": "tone", …}}
{"event": "result", "result": {"id": "urgency", …}}
{"event": "done", "usage": {"input_tokens": 51}}`;
const ERRORS: [string, string, string, string][] = [
  ["401", "invalid_key", "کلید نامعتبر است یا حذف شده.", "The key is wrong or was revoked."],
  ["402", "quota_exhausted", "درخواست‌های رایگان این حساب تمام شده.", "This account's free requests are used up."],
  ["413", "text_too_long", "متن از حد مجاز بلندتر است.", "The text is longer than allowed."],
  ["422", "invalid_request", "بدنهٔ درخواست درست نیست؛ پیام می‌گوید کجا.", "The request body is wrong; the message says where."],
  ["429", "rate_limited", "درخواست‌ها زیاد شده؛ سرآیند Retry-After می‌گوید کی دوباره بفرستید.", "Too many requests; the Retry-After header says when to send again."],
  ["503", "busy", "سرور مشغول است؛ کمی بعد دوباره بفرستید.", "The server is busy; send again a little later."],
];

export function Docs({ lang, onLang, route }: { lang: Lang; onLang: () => void; route: RouteName }) {
  const c = COPY[lang].pages.docs;
  const fa = lang === "fa";
  const t = (p: ReactNode, e: ReactNode) => (fa ? p : e);
  const toc: [string, string][] = fa
    ? [["start", "شروع سریع"], ["auth", "کلید و احراز هویت"], ["request", "درخواست"], ["response", "پاسخ"], ["stream", "پاسخ جریانی"], ["presets", "خروجی‌های آماده"], ["errors", "خطاها"], ["limits", "سهم و محدودیت‌ها"]]
    : [["start", "Quick start"], ["auth", "Keys and authentication"], ["request", "The request"], ["response", "The response"], ["stream", "Streaming"], ["presets", "Ready-made outputs"], ["errors", "Errors"], ["limits", "Quota and limits"]];
  const title = Object.fromEntries(toc);
  const S = ({ id, children }: { id: string; children: ReactNode }) => (
    <section id={`doc-${id}`} className="d-sec p-rise">
      <h2 className="d-h2">{title[id]}</h2>
      {children}
    </section>
  );

  // The contents mark the section being read.
  const [current, setCurrent] = useState("start");
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id.replace("doc-", ""), e.isIntersecting);
        const first = toc.find(([id]) => seen.get(id));
        if (first) setCurrent(first[0]);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const [id] of toc) {
      const el = document.getElementById(`doc-${id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // The samples show the canonical address first (as on the server), then this page's own.
  const [sampleBase, setSampleBase] = useState(PUBLIC_API);
  useEffect(() => setSampleBase(base()), []);

  const steps: ReactNode[] = [
    t(<>با حساب گوگل وارد شوید و یک <a href="#/keys">کلید API</a> بسازید.</>, <>Sign in with Google and create an <a href="#/keys">API key</a>.</>),
    t(<>متن را با پرسش‌هایتان به <C>POST /api/v1/decisions</C> بفرستید.</>, <>Send the text with your questions to <C>POST /api/v1/decisions</C>.</>),
    t("برای هر پرسش یک پاسخ با احتمالش برمی‌گردد.", "Each question comes back with an answer and its probability."),
  ];

  return (
    <Page
      lang={lang}
      onLang={onLang}
      route={route}
      head={
        <>
          <h1 className="p-title">
            <Words text={c.title} />
          </h1>
          <p className="l-p">{c.lead}</p>
          <div className="l-actions">
            <a className="l-btn l-btn-primary" href="#/keys">
              {c.key}
            </a>
            <a className="l-btn l-btn-ghost" href={`${API}/docs`} target="_blank" rel="noopener">
              {c.reference}
              <Icon name="external" size={18} />
            </a>
          </div>
        </>
      }
      side={
        <div className="l-code" data-theme="light">
          <CodeSample baseUrl={sampleBase} />
        </div>
      }
    >
      <div className="d-grid">
        <nav aria-label={fa ? "فهرست" : "Contents"} className="d-toc">
          <ol>
            {toc.map(([id, label]) => (
              <li key={id}>
                <a href="#/docs" data-to={`doc-${id}`} aria-current={current === id ? "true" : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="doc d-article">
          <S id="start">
            <ol className="d-steps">
              {steps.map((step, i) => (
                <li className="d-step" key={i}>
                  <span className="d-step-n" aria-hidden="true">{fa ? ["۱", "۲", "۳"][i] : i + 1}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </S>
          <S id="auth">
            <p>{t(<>کلید را در سرآیند <C>Authorization</C> بفرستید. کلید با <C>lyl_</C> شروع می‌شود و فقط یک بار، هنگام ساختن، نشان داده می‌شود.</>, <>Send the key in the <C>Authorization</C> header. It starts with <C>lyl_</C> and is shown only once, when it's created.</>)}</p>
            <CodeBlock code="Authorization: Bearer lyl_..." label="Authorization" />
            <p>{t("کلیدی که باطل شود بی‌درنگ از کار می‌افتد. هر حساب تا پنج کلید فعال دارد.", "A revoked key stops working at once. Each account can hold up to five active keys.")}</p>
          </S>
          <S id="request">
            <p>{t(<>بدنهٔ درخواست متن و فهرست خروجی‌هاست. هر خروجی یا یکی از خروجی‌های آماده است یا پرسش خود شما:</>, <>The body is the text and a list of outputs. Each output is either a ready-made one or a question of your own:</>)}</p>
            <ul>
              <li><C>choice</C>{t(": یکی از گزینه‌ها؛ دو تا دوازده گزینه.", ": one of the options; two to twelve options.")}</li>
              <li><C>yes_no</C>{t(": احتمال «بله»؛ گزینه نمی‌خواهد.", ": the probability of yes; no options needed.")}</li>
              <li><C>scale</C>{t(": جایگاه روی طیفی مرتب؛ دو تا ده سطح، از کم به زیاد.", ": a place on an ordered scale; two to ten levels, lowest first.")}</li>
            </ul>
            <CodeBlock code={REQUEST} label={t("بدنهٔ درخواست", "Request body") as string} />
            <p className="text-body-small text-ink-muted">{t("شناسهٔ هر خروجی (id) را خودتان می‌گذارید و پاسخ با همان شناسه برمی‌گردد.", "You choose each output's id, and its answer comes back under the same id.")}</p>
          </S>
          <S id="response">
            <p>{t(<>پاسخ‌ها به همان ترتیب درخواست برمی‌گردند. <C>label</C> پاسخ به زبان ساده است و <C>options</C> احتمال همهٔ گزینه‌ها را دارد.</>, <>Answers come back in the order asked. <C>label</C> is the answer in words and <C>options</C> holds every option's probability.</>)}</p>
            <CodeBlock code={RESPONSE} label={t("پاسخ", "Response") as string} />
            <p>{t(<>متن بلندتر از حد مدل کوتاه می‌شود: ابتدا و انتهایش خوانده می‌شود و <C>truncated</C> برابر true است.</>, <>A text longer than the model reads is shortened: its beginning and end are read, and <C>truncated</C> is true.</>)}</p>
          </S>
          <S id="stream">
            <p>{t(<>با <C>POST /api/v1/decisions/stream</C> هر پاسخ همان لحظه که آماده شد، در یک خط JSON می‌رسد. برای رابط‌هایی که می‌خواهند پاسخ‌ها را یکی‌یکی نشان دهند مناسب است.</>, <>With <C>POST /api/v1/decisions/stream</C> each answer arrives on its own JSON line the moment it's ready: right for screens that show answers one by one.</>)}</p>
            <CodeBlock code={STREAM} label="NDJSON" />
          </S>
          <S id="presets">
            <p>{t(<>این خروجی‌ها با همان عبارت‌هایی پرسیده می‌شوند که لیلا با آن‌ها آموزش دیده، پس دقیق‌ترین پاسخ را می‌دهند. فهرست کامل از <C>GET /api/v1/outputs</C> می‌آید.</>, <>These outputs are asked in the very words Layla was trained on, so they give its best answers. The full list comes from <C>GET /api/v1/outputs</C>.</>)}</p>
            <OutputsTable />
          </S>
          <S id="errors">
            <p>{t("هر خطا یک کد ثابت و یک پیام دارد:", "Every error has a fixed code and a message:")}</p>
            <CodeBlock code={`{"error": {"code": "quota_exhausted", "message": "…", "request_id": "…"}}`} label={t("خطا", "Error") as string} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-body-small">
                <tbody>
                  {ERRORS.map(([status, code, pfa, pen]) => (
                    <tr key={code} className="border-b border-line-default">
                      <td dir="ltr" className="py-2 pe-4 font-bold">{status}</td>
                      <td className="py-2 pe-4"><C>{code}</C></td>
                      <td className="py-2">{fa ? pfa : pen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </S>
          <S id="limits">
            <ul>
              <li>{t("هر حساب ۱۰۰ درخواست رایگان دارد. هر درخواست موفق، با هر تعداد خروجی، یکی حساب می‌شود؛ درخواستی که پاسخی نگیرد حساب نمی‌شود.", "Each account has 100 free requests. A successful request counts once, however many outputs it asks for; a request that gets no answer isn't counted.")}</li>
              <li>{t("نسخهٔ ویژه با سقف بیشتر به‌زودی می‌آید.", "A premium plan with a higher limit is coming.")}</li>
              <li>{t("هر درخواست حداکثر ۱۲ خروجی و ۲۰٬۰۰۰ نویسه متن.", "Each request takes at most 12 outputs and 20,000 characters of text.")}</li>
              <li>{t("هر خروجی یک بار خواندن متن است؛ خروجی کمتر یعنی پاسخ زودتر.", "Each output is one reading of the text; fewer outputs mean a faster answer.")}</li>
            </ul>
          </S>
        </article>
      </div>
    </Page>
  );
}
