import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "@pendar/ui";
import { CodeSample, Decision, LaylaFooter, LaylaWordmark, QUESTION_TYPES, SERVICES, type DecisionStatus } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { API, PUBLIC_API } from "../lib/api.ts";
import type { Route } from "../lib/router.ts";
import { Chat, type Ask } from "../chat/Chat.tsx";
import { TopBar, Words } from "../Shell.tsx";
import { setupLanding, type LandingControl } from "./motion.ts";
import { Sky } from "./Sky.tsx";

/** The message, word by word, with the phrases Layla's questions turn on marked. */
function Message({ text, marks }: { text: string; marks: string[] }) {
  const parts: { t: string; mark: boolean }[] = [];
  let rest = text;
  while (rest) {
    const hit = marks.map((m) => ({ m, i: rest.indexOf(m) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
    if (!hit) {
      parts.push({ t: rest, mark: false });
      break;
    }
    if (hit.i > 0) parts.push({ t: rest.slice(0, hit.i), mark: false });
    parts.push({ t: hit.m, mark: true });
    rest = rest.slice(hit.i + hit.m.length);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.mark ? (
          <mark className="l-mark" key={i}>
            <Words text={p.t} />
          </mark>
        ) : (
          <Fragment key={i}>
            <Words text={p.t} />
          </Fragment>
        ),
      )}
    </>
  );
}


/** A sector's example, sent to the live chat by its «امتحان کنید». */
const askFor = (id: string | null | undefined): Ask | undefined => {
  const s = SERVICES.find((x) => x.id === id);
  return s ? { id: Date.now(), text: s.text, outputs: s.outputs } : undefined;
};

export function Landing({ lang, onLang, route }: { lang: Lang; onLang: () => void; route: Route }) {
  const c = COPY[lang];
  const root = useRef<HTMLDivElement>(null);
  // How many sample answers have arrived (3 = all: what shows without motion, and on the server).
  const [step, setStep] = useState(3);
  const [day, setDay] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [ask, setAsk] = useState<Ask>();
  // The samples show the canonical address first (as rendered at build time), then this page's own.
  const [base, setBase] = useState(PUBLIC_API);
  useEffect(() => setBase(location.origin + API), []);

  const control = useRef<LandingControl | null>(null);
  useEffect(() => {
    if (!root.current) return;
    const ctl = setupLanding(root.current, { setStep, setDay, setScrolled, ask: (id) => setAsk(askFor(id)) });
    control.current = ctl;
    return () => {
      ctl.destroy();
      control.current = null;
    };
  }, [lang]);

  // An old address (#/play, #/services) lands here: go to its part of the page, then tidy the address.
  useEffect(() => {
    if (!route.section) return;
    control.current?.go(route.section, { service: route.params.get("service") });
    history.replaceState(null, "", location.pathname + location.search + "#/");
  }, [route]);

  const status = (i: number): DecisionStatus => (i < step ? "done" : i === step ? "reading" : "queued");

  return (
    <div ref={root} className="landing">
      <a href="#main" className="skip-link">
        {c.nav.skip}
      </a>
      <Sky />
      <TopBar lang={lang} onLang={onLang} route="" day={day} scrolled={scrolled} />

      <main id="main">
        <section className="l-hero l-night" aria-labelledby="l-hero-title">
          <div className="l-hero-inner">
            <div className="l-hero-mark">
              <LaylaWordmark tone="reverse" height={243} animate />
            </div>
            <div className="l-hero-copy">
              <h1 id="l-hero-title" className="l-hero-title">
                <Words text={c.hero.title} />
              </h1>
              <p className="l-hero-lead">{c.hero.lead}</p>
              <div className="l-actions">
                <a className="l-btn l-btn-primary" href="#/play" data-scroll="try">
                  {c.hero.try}
                  <Icon name="arrow-down" size={20} />
                </a>
                <a className="l-btn l-btn-ghost" href="#/keys">
                  {c.hero.key}
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="l-scene l-message l-night" aria-labelledby="l-message-title">
          <div className="l-scene-copy">
            <h2 id="l-message-title" className="l-h2">{c.message.title}</h2>
            <p className="l-p">{c.message.body}</p>
          </div>
          <figure className="l-card l-message-card" data-theme="light" lang="fa" dir="rtl">
            <figcaption className="l-card-label">
              <Icon name="chat" size={18} />
              {lang === "fa" ? c.message.label : "پیام مشتری"}
            </figcaption>
            <p className="l-message-text">
              <Message text={c.message.text} marks={c.message.marks} />
            </p>
          </figure>
        </section>

        <section className="l-scene l-questions l-night" aria-labelledby="l-questions-title">
          <div className="l-scene-copy">
            <h2 id="l-questions-title" className="l-h2">{c.questions.title}</h2>
            <p className="l-p">{c.questions.body}</p>
          </div>
          <ol className="l-qs" lang="fa" dir="rtl">
            {c.questions.list.map((q) => (
              <li className="l-q" key={q.id}>
                <p className="l-q-kind">
                  <Icon name={QUESTION_TYPES[q.type].icon} size={16} />
                  {q.kind}
                </p>
                <p className="l-q-text">{q.question}</p>
                <ul className="l-opts" aria-label={lang === "fa" ? "گزینه‌ها" : "Options"}>
                  {q.options.map((o) => (
                    <li className="l-opt" key={o}>
                      {o}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <section className="l-rule l-night" aria-label={c.rule}>
          <p className="l-rule-text" aria-hidden="true">
            <Words text={c.rule} />
          </p>
        </section>

        <section className="l-scene l-answers l-night" aria-labelledby="l-answers-title">
          <div className="l-scene-copy">
            <h2 id="l-answers-title" className="l-h2">{c.answers.title}</h2>
            <p className="l-p">{c.answers.body}</p>
          </div>
          <div className="l-decisions" data-theme="light" lang="fa" dir="rtl">
            <span className="l-sample">{c.answers.sample}</span>
            {c.questions.list.map((q, i) => (
              <Decision key={q.id} title={q.question} icon={QUESTION_TYPES[q.type].icon} type={q.type} status={status(i)} result={i < step ? c.answers.results[i] : undefined} />
            ))}
          </div>
        </section>

        <section className="l-speed l-night" aria-labelledby="l-speed-title">
          <div className="l-speed-inner">
            <p className="l-speed-figure" aria-hidden="true">
              <span className="l-speed-under">{c.speed.under}</span>
              <span className="l-speed-num" data-to={c.speed.number}>
                {lang === "fa" ? "۵۰" : "50"}
              </span>
              <span className="l-speed-unit">{c.speed.unit}</span>
            </p>
            <div className="l-speed-copy">
              <h2 id="l-speed-title" className="l-h2">{c.speed.title}</h2>
              <p className="l-p">{c.speed.body}</p>
            </div>
            <ol className="l-stream" dir="ltr" aria-hidden="true">
              <li><span className="l-ms">0 ms</span>{`{"event": "start", "outputs": ["team", "cancel", "urgency"]}`}</li>
              <li><span className="l-ms">31 ms</span>{`{"event": "result", "result": {"id": "team", "label": "پشتیبانی", "probability": 0.81}}`}</li>
              <li><span className="l-ms">63 ms</span>{`{"event": "result", "result": {"id": "cancel", "label": "بله", "probability": 0.79}}`}</li>
              <li><span className="l-ms">94 ms</span>{`{"event": "result", "result": {"id": "urgency", "label": "مهم", "probability": 0.58}}`}</li>
              <li><span className="l-ms">95 ms</span>{`{"event": "done", "usage": {"input_tokens": 51}}`}</li>
            </ol>
          </div>
        </section>

        <section className="l-sectors l-night" aria-labelledby="l-sectors-title">
          <div className="l-sectors-head">
            <h2 id="l-sectors-title" className="l-h2">{c.sectors.title}</h2>
            <p className="l-p">{c.sectors.body}</p>
          </div>
          <div className="l-track">
            {SERVICES.map((s) => (
              <article className="l-sector" key={s.id} lang="fa" dir="rtl">
                <span className="l-sector-icon" aria-hidden="true">
                  <Icon name={s.icon} size={28} />
                </span>
                <h3 className="l-sector-title">{s.title}</h3>
                <p className="l-sector-for">{s.for}</p>
                <p className="l-sector-what">{s.what}</p>
                <blockquote className="l-sector-text">«{s.text}»</blockquote>
                <a className="l-sector-try" href={`#/play?service=${s.id}`} data-scroll="try" data-service={s.id} lang={lang} dir={lang === "fa" ? "rtl" : "ltr"}>
                  {c.sectors.try}
                  <Icon name="arrow-forward" size={18} />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="l-scene l-dev l-night" aria-labelledby="l-dev-title">
          <div className="l-scene-copy">
            <h2 id="l-dev-title" className="l-h2">{c.dev.title}</h2>
            <p className="l-p">{c.dev.body}</p>
            <div className="l-actions">
              <a className="l-btn l-btn-primary" href="#/keys">
                {c.dev.key}
              </a>
              <a className="l-btn l-btn-ghost" href="#/api">
                {c.dev.docs}
              </a>
            </div>
          </div>
          <div className="l-code" data-theme="light">
            <CodeSample baseUrl={base} />
          </div>
        </section>

        <div className="l-dawn" aria-hidden="true" />
        {/* Day: the live box and the footer keep the light colours (the dawn ends in plaster). */}
        <div className="l-day" data-theme="light">
        <section className="l-live" id="try" aria-label={c.live.label}>
          <div className="l-live-inner">
            <Chat lang={lang} ask={ask} />
          </div>
        </section>
        <LaylaFooter />
        </div>
      </main>
    </div>
  );
}
