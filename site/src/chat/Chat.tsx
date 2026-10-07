import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BrickMeter, Button, Dialog, Icon, IconButton, Loader, RemovableChip } from "@pendar/ui";
import {
  CATALOG,
  CATALOG_EN,
  EXAMPLES,
  OutputPicker,
  QuestionBuilder,
  iconOf,
  isUnsure,
  streamDecisions,
  useWords,
  type CustomQuestion,
  type OutputSpec,
  type Result,
} from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { EXAMPLES_EN, resultIn, titleIn } from "../en.ts";
import { API } from "../lib/api.ts";

/**
 * Layla as a chat: you send a text, Layla answers each question with one of its options and how
 * sure it is. The reply is never prose (Layla writes no text of its own): it is the answers, a
 * compact row each, arriving one by one as Layla reads.
 */

const MAX_CHARS = 4000;
const MAX_OUTPUTS = 5;
const DEFAULT_OUTPUTS: OutputSpec[] = [
  { id: "message_act", preset: "message_act" },
  { id: "urgency", preset: "urgency" },
  { id: "sentiment", preset: "sentiment" },
];

type Turn = {
  id: number;
  text: string;
  outputs: OutputSpec[];
  results: Record<string, Result>;
  status: "reading" | "done" | "error";
  error?: string;
  ms?: number;
  truncated?: boolean;
};

function titleOf(o: OutputSpec, lang: Lang): string {
  if (o.preset) return (lang === "en" ? CATALOG_EN[o.preset]?.title : undefined) ?? CATALOG.find((c) => c.id === o.preset)?.title ?? o.preset;
  return titleIn(o, lang) ?? o.id;
}

/** One answer: the question's name, the option Layla picked and how sure it is; open it for every option. */
function Answer({ o, result: sent, state, lang }: { o: OutputSpec; result?: Result; state: "queued" | "reading" | "done" | "failed"; lang: Lang }) {
  const w = useWords();
  // The API answers in the options' own words; the page's own options are shown in the reader's language.
  const result = sent && resultIn(sent, lang);
  const [open, setOpen] = useState(false);
  const unsure = result ? isUnsure(result) : false;
  return (
    <li className="c-ans" data-state={state}>
      <button type="button" className="c-ans-head" onClick={() => result && setOpen(!open)} aria-expanded={result ? open : undefined} disabled={!result}>
        <span className="c-ans-icon" aria-hidden="true">
          <Icon name={iconOf(o)} size={18} />
        </span>
        <span className="c-ans-title" dir="auto">
          {titleOf(o, lang)}
        </span>
        <span className="c-ans-value">
          {result ? (
            <>
              <strong className="c-ans-label" dir="auto">
                {result.label}
              </strong>
              {unsure ? <span className="c-unsure">{w.unsure}</span> : null}
              <BrickMeter value={result.probability} label={w.probabilityOf(result.label)} size="sm" className="c-ans-meter" />
            </>
          ) : state === "reading" ? (
            <Loader size={24} label={w.reading} />
          ) : state === "failed" ? (
            <span className="c-none" aria-label={w.failed}>—</span>
          ) : (
            <span className="c-wait" aria-label={w.queued} />
          )}
        </span>
      </button>
      {open && result ? (
        <ul className="c-opts" aria-label={w.allOptions}>
          {result.options.map((op) => (
            <li key={op.key}>
              <span dir="auto">{op.label}</span>
              <BrickMeter value={op.probability} label={w.probabilityOf(op.label)} size="sm" tone="muted" />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Which questions to ask: the ready-made ones, or your own. At most five a text. */
function Questions({ open, onClose, outputs, setOutputs, lang }: { open: boolean; onClose: () => void; outputs: OutputSpec[]; setOutputs: (o: OutputSpec[]) => void; lang: Lang }) {
  const c = COPY[lang].chat;
  const presets = outputs.filter((o) => o.preset).map((o) => o.preset!);
  const customs = outputs.filter((o) => !o.preset);
  const setPresets = (ids: string[]) => setOutputs([...ids.map((id) => ({ id, preset: id })), ...customs]);
  const add = (q: CustomQuestion) => {
    if (outputs.length >= MAX_OUTPUTS) return;
    setOutputs([...outputs, { id: `q${Date.now().toString(36)}`, type: q.type, question: q.question, ...(q.options ? { options: q.options } : {}) }]);
  };
  return (
    <Dialog open={open} onClose={onClose} title={c.questionsTitle} actions={<Button onClick={onClose}>{c.done}</Button>}>
      <div className="grid gap-6">
        <OutputPicker value={presets} onChange={setPresets} max={MAX_OUTPUTS - customs.length} />
        <div className="grid gap-3">
          <p className="m-0 text-label font-bold">{c.yours}</p>
          {customs.length ? (
            <div className="flex flex-wrap gap-2">
              {customs.map((q) => (
                <RemovableChip key={q.id} onRemove={() => setOutputs(outputs.filter((o) => o.id !== q.id))}>
                  {titleIn(q, lang) ?? q.question}
                </RemovableChip>
              ))}
            </div>
          ) : null}
          {outputs.length < MAX_OUTPUTS ? <QuestionBuilder onAdd={add} /> : null}
        </div>
      </div>
    </Dialog>
  );
}

/** A text to send from outside the chat (a sector's example); a new id sends it again. */
export type Ask = { id: number; text: string; outputs: OutputSpec[] };

export function Chat({ lang, ask }: { lang: Lang; ask?: Ask }) {
  const c = COPY[lang].chat;
  const w = useWords();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [outputs, setOutputs] = useState<OutputSpec[]>(DEFAULT_OUTPUTS);
  const [picking, setPicking] = useState(false);
  const busy = turns.some((t) => t.status === "reading");
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const next = useRef(1);

  const update = (id: number, change: (t: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === id ? change(t) : t)));

  const send = useCallback(
    async (body: string, asked: OutputSpec[]) => {
      const value = body.trim();
      if (!value || !asked.length || busy) return;
      const id = next.current++;
      setTurns((all) => [...all, { id, text: value, outputs: asked, results: {}, status: "reading" }]);
      setText("");
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        for await (const e of streamDecisions({ baseUrl: API, text: value, outputs: asked, signal: ctrl.signal })) {
          if (e.event === "start") update(id, (t) => ({ ...t, truncated: e.truncated }));
          else if (e.event === "result") update(id, (t) => ({ ...t, results: { ...t.results, [e.result.id]: e.result } }));
          else if (e.event === "error") update(id, (t) => ({ ...t, status: "error", error: c.errors[e.error.code] ?? e.error.message }));
          else if (e.event === "done") update(id, (t) => ({ ...t, status: t.status === "error" ? "error" : "done", ms: e.duration_ms }));
        }
        update(id, (t) => (t.status === "reading" ? { ...t, status: "done" } : t));
      } catch (err) {
        if (ctrl.signal.aborted) return update(id, (t) => ({ ...t, status: "done" }));
        const code = (err as { code?: string }).code ?? "network";
        update(id, (t) => ({ ...t, status: "error", error: c.errors[code] ?? c.errors.default }));
      } finally {
        abort.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, lang],
  );

  // A sector's «امتحان کنید» arrives with its example: send it at once.
  const asked = useRef(0);
  useEffect(() => {
    if (ask && ask.id !== asked.current) {
      asked.current = ask.id;
      setOutputs(ask.outputs);
      void send(ask.text, ask.outputs);
    }
  }, [ask, send]);

  // Keep the newest answers in view (the log scrolls inside the panel, not the page).
  useEffect(() => {
    if (turns.length && log.current) log.current.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // The box grows with the text, up to a few lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text, outputs);
    }
  };

  const composer = (
    <form
      className="c-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send(text, outputs);
      }}
    >
      <textarea
        ref={box}
        className="c-input"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={onKey}
        placeholder={c.placeholder}
        aria-label={w.text}
        rows={1}
        dir="auto"
        lang="fa"
      />
      <div className="c-bar">
        <button type="button" className="c-questions" onClick={() => setPicking(true)}>
          <Icon name="list" size={16} />
          {c.questions(outputs.length)}
        </button>
        {MAX_CHARS - text.length < 400 ? <span className="c-left">{c.left(MAX_CHARS - text.length)}</span> : null}
        {busy ? (
          <IconButton icon="close" label={c.stop} variant="secondary" size="sm" onClick={() => abort.current?.abort()} className="c-send" />
        ) : (
          <IconButton icon="arrow-up" label={c.send} variant="primary" size="sm" type="submit" disabled={!text.trim() || !outputs.length} className="c-send" />
        )}
      </div>
    </form>
  );

  return (
    <div className={`c-chat ${turns.length ? "has-turns" : "is-empty"}`}>
      <div className="c-log" ref={log} data-lenis-prevent="">
        {turns.length === 0 ? (
          <div className="c-empty">
            <p className="c-empty-title">{c.empty}</p>
          </div>
        ) : (
          <ol className="c-turns">
            {turns.map((t) => {
              const done = Object.keys(t.results).length;
              const reading = t.outputs.findIndex((o) => !t.results[o.id]);
              return (
                <li key={t.id} className="c-turn">
                  <div className="c-user">
                    <span className="sr-only">{c.you}: </span>
                    <p dir="auto" lang="fa">
                      {t.text}
                    </p>
                  </div>
                  <div className="c-reply" aria-live="polite" aria-busy={t.status === "reading"}>
                    <span className="c-avatar" aria-hidden="true">
                      <i />
                      <i />
                    </span>
                    <span className="sr-only">{c.layla}: </span>
                    <div className="c-reply-body">
                      <ul className="c-answers">
                        {t.outputs.map((o, i) => (
                          <Answer
                            key={o.id}
                            o={o}
                            lang={lang}
                            result={t.results[o.id]}
                            state={t.results[o.id] ? "done" : t.status === "error" ? "failed" : t.status === "reading" && i === reading ? "reading" : "queued"}
                          />
                        ))}
                      </ul>
                      {t.truncated ? <p className="c-note">{w.truncated}</p> : null}
                      {t.status === "error" ? (
                        <p className="c-error">
                          {t.error}{" "}
                          <button type="button" className="c-retry" onClick={() => void send(t.text, t.outputs)}>
                            {c.retry}
                          </button>
                        </p>
                      ) : t.status === "done" && t.ms !== undefined ? (
                        <p className="c-meta">{c.meta(done, t.ms)}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="c-dock">
        {composer}
        {turns.length === 0 ? (
          <div className="c-suggest" aria-label={w.examples}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="c-chip"
                onClick={() => {
                  setOutputs(ex.outputs);
                  void send(ex.text, ex.outputs);
                }}
              >
                {lang === "en" ? (EXAMPLES_EN[ex.id] ?? ex.title) : ex.title}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="c-restart" onClick={() => (abort.current?.abort(), setTurns([]))}>
            <Icon name="refresh" size={16} />
            {c.restart}
          </button>
        )}
      </div>
      <Questions open={picking} onClose={() => setPicking(false)} outputs={outputs} setOutputs={setOutputs} lang={lang} />
    </div>
  );
}
