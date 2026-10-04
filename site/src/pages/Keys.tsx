import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Loader, TextField } from "@pendar/ui";
import { ApiKeys, UsageChart, type ApiKey, type UsageDay } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { call, type Failure } from "../lib/api.ts";
import { ease, gsap, still } from "../lib/motion.ts";
import type { RouteName } from "../lib/router.ts";
import { loadGoogle, useSession } from "../lib/session.tsx";
import { Page, Words } from "../Shell.tsx";

type AuthConfig = { google_client_id: string; dev_login: boolean };

const MESSAGES: Record<string, Record<Lang, string>> = {
  key_limit: { fa: "به سقف کلیدها رسیده‌اید. اول یکی را باطل کنید.", en: "You've reached the key limit. Revoke one first." },
  rate_limited: { fa: "درخواست‌ها زیاد شد. کمی بعد دوباره امتحان کنید.", en: "Too many requests. Try again a little later." },
};

/** Signing in, which only keys need: Google's own button, on the night. */
function SignIn({ lang }: { lang: Lang }) {
  const c = COPY[lang].pages;
  const { refresh } = useSession();
  const box = useRef<HTMLDivElement>(null);
  const [conf, setConf] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const done = async (ok: boolean, code?: string) => {
    if (!ok) return setError(code === "network" ? c.network : c.login.failed);
    setError(null);
    await refresh();
  };

  useEffect(() => {
    void call<AuthConfig>("/api/v1/auth/config").then((r) => setConf(r.ok ? r.data : { google_client_id: "", dev_login: false }));
  }, []);

  useEffect(() => {
    if (!conf?.google_client_id || !box.current) return;
    let live = true;
    loadGoogle()
      .then(() => {
        if (!live || !box.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: conf.google_client_id,
          ux_mode: "popup",
          callback: async ({ credential }) => {
            const r = await call("/api/v1/auth/google", { method: "POST", body: { credential } });
            void done(r.ok, r.ok ? undefined : r.error.code);
          },
        });
        window.google.accounts.id.renderButton(box.current, { theme: "outline", size: "large", shape: "rectangular", text: "continue_with", locale: lang, width: 300 });
      })
      .catch(() => live && setError(c.network));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf, lang]);

  const dev = async (e: FormEvent) => {
    e.preventDefault();
    const r = await call("/api/v1/auth/dev", { method: "POST", body: { email: email.trim() } });
    void done(r.ok, r.ok ? undefined : r.error.code);
  };

  return (
    <div className="k-signin p-late">
      <div ref={box} className="k-google" />
      {conf && !conf.google_client_id ? <p className="k-note">{c.login.notSetUp}</p> : null}
      {error ? <p className="k-error" role="alert">{error}</p> : null}
      {conf?.dev_login ? (
        <form onSubmit={dev} className="k-dev" data-theme="light">
          <TextField label={c.login.devEmail} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" variant="secondary">{c.login.devButton}</Button>
        </form>
      ) : null}
      <p className="k-note">
        {c.keys.noSignIn} <a href="#/play">{c.keys.try}</a>
      </p>
    </div>
  );
}

/** What's left of the free requests, counted up like the landing's speed. */
function Left({ left, limit, lang }: { left: number; limit: number; lang: Lang }) {
  const c = COPY[lang].pages.keys;
  const num = useRef<HTMLSpanElement>(null);
  const nf = new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US");
  useEffect(() => {
    const el = num.current;
    if (!el || still()) return;
    const n = { v: 0 };
    const tw = gsap.fromTo(n, { v: 0 }, { v: left, duration: 1.4, delay: 0.3, ease: ease("enter"), onUpdate: () => void (el.textContent = nf.format(Math.round(n.v))) });
    return () => void tw.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, lang]);
  return (
    <p className="l-speed-figure k-left">
      <span className="l-speed-num" ref={num}>
        {nf.format(left)}
      </span>
      <span className="l-speed-unit">{c.left}</span>
      <span className="k-of">{c.of(nf.format(limit))}</span>
    </p>
  );
}

/** The account's API keys: signing in when signed out; the free requests, the keys and the use when signed in. */
export function Keys({ lang, onLang, route }: { lang: Lang; onLang: () => void; route: RouteName }) {
  const c = COPY[lang].pages;
  const { me, refresh, signOut } = useSession();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [max, setMax] = useState(5);
  const [days, setDays] = useState<UsageDay[]>([]);
  const say = (e: Failure) => MESSAGES[e.code]?.[lang] ?? (e.code === "network" ? c.network : (e.message ?? c.error));

  const load = useCallback(async () => {
    const [k, u] = await Promise.all([call<{ keys: ApiKey[]; max: number }>("/api/v1/keys"), call<{ days: UsageDay[] }>("/api/v1/account/usage?days=30")]);
    if (k.ok) {
      setKeys(k.data.keys);
      setMax(k.data.max);
    } else setKeys([]);
    if (u.ok) setDays(u.data.days);
  }, []);
  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  const who = me ? me.user.email || me.user.name : "";
  const head = (
    <>
      <h1 className="p-title">
        <Words text={c.keys.title} />
      </h1>
      {me === undefined ? (
        <div className="k-wait">
          <Loader size={32} />
        </div>
      ) : me === null ? (
        <>
          <p className="l-p p-late">{c.keys.leadOut}</p>
          <SignIn lang={lang} />
        </>
      ) : (
        <>
          <p className="l-p p-late">{c.keys.leadIn}</p>
          <div className="k-who p-late">
            <span dir="auto">{who}</span>
            <button type="button" className="k-out" onClick={() => void signOut()}>
              {c.keys.signOut}
            </button>
          </div>
        </>
      )}
    </>
  );

  return (
    <Page lang={lang} onLang={onLang} route={route} head={head} side={me ? <Left left={me.quota.remaining} limit={me.quota.limit} lang={lang} /> : null} solo={!me} late>
      {me ? (
        <div className="k-grid">
          <div className="p-rise">
            {keys ? (
              <ApiKeys
                keys={keys}
                max={max}
                onCreate={async (name) => {
                  const r = await call<{ key: ApiKey; secret: string }>("/api/v1/keys", { method: "POST", body: { name } });
                  if (!r.ok) throw new Error(say(r.error));
                  setKeys((list) => [r.data.key, ...(list ?? [])]);
                  void refresh();
                  return r.data;
                }}
                onRevoke={async (id) => {
                  const r = await call(`/api/v1/keys/${id}`, { method: "DELETE" });
                  if (!r.ok) throw new Error(say(r.error));
                  setKeys((list) => (list ?? []).filter((k) => k.id !== id));
                }}
              />
            ) : (
              <div className="grid min-h-40 place-items-center">
                <Loader />
              </div>
            )}
          </div>
          <UsageChart days={days} className="p-rise" />
          <p className="k-next p-rise">
            {c.keys.next} <a href="#/docs">{c.keys.docs}</a>
          </p>
        </div>
      ) : null}
    </Page>
  );
}

