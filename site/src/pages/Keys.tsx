import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, CopyButton, Dialog, Icon, Loader, MONTHS, TextField, toJalali, toPersianDigits, useToast } from "@pendar/ui";
import { useWords, type ApiKey, type UsageDay } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { call, type Failure } from "../lib/api.ts";
import type { RouteName } from "../lib/router.ts";
import { loadGoogle, useSession } from "../lib/session.tsx";
import { Face, Page, Words } from "../Shell.tsx";

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

/**
 * The free requests as a wall of a hundred bricks: each request takes one from the top, so what's
 * still standing is what's left. Laid course by course from the ground when the page opens.
 */
function Wall({ used, limit, lang }: { used: number; limit: number; lang: Lang }) {
  const c = COPY[lang].pages.account;
  const nf = new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US");
  const spent = Math.min(used, limit);
  const per = 10;
  const courses = 10;
  const gone = Math.round((spent / Math.max(1, limit)) * per * courses);
  return (
    <figure className="a-quota">
      <div className="a-wall" role="img" aria-label={c.usedOf(nf.format(spent), nf.format(limit))}>
        {Array.from({ length: courses }, (_, row) => (
          <div className="a-course" key={row}>
            {Array.from({ length: per }, (_, i) => (
              // Laid from the ground up, the bottom course first; taken away from the top.
              <i key={i} className={row * per + i < gone ? "is-gone" : undefined} style={{ ["--i" as string]: (courses - 1 - row) * per + i }} />
            ))}
          </div>
        ))}
      </div>
      <figcaption className="a-quota-cap">
        <span className="a-quota-num">{nf.format(Math.max(0, limit - used))}</span>
        <span className="a-quota-what">{c.left}</span>
        <span className="a-quota-of">
          {c.usedOf(nf.format(spent), nf.format(limit))} · {c.premium}
        </span>
      </figcaption>
    </figure>
  );
}

const dayLabel = (iso: string, lang: Lang) => {
  const d = new Date(`${iso}T12:00:00`);
  if (lang === "en") return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const j = toJalali(d);
  return toPersianDigits(`${j.day} ${MONTHS[j.month - 1]}`);
};

/** The last 30 days, a column of lapis bricks a day, today at the end of reading. */
function Usage({ days, lang }: { days: UsageDay[]; lang: Lang }) {
  const c = COPY[lang].pages.account;
  const w = useWords();
  const nf = new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US");
  const total = days.reduce((a, d) => a + d.requests, 0);
  const top = Math.max(1, ...days.map((d) => d.requests));
  return (
    <section className="a-panel a-usage p-rise" aria-labelledby="a-usage-title">
      <header className="a-panel-head">
        <h2 id="a-usage-title" className="a-h3">
          {c.usage}
        </h2>
        <p className="a-total">
          <strong>{nf.format(total)}</strong> {c.requests}
        </p>
      </header>
      {total === 0 ? (
        <p className="a-muted">{w.usageEmpty}</p>
      ) : (
        <>
          <div className="a-chart" aria-hidden="true">
            {days.map((d, i) => (
              <span key={d.day} className={`a-bar ${d.requests === 0 ? "is-zero" : i === days.length - 1 ? "is-today" : ""}`} style={{ ["--h" as string]: d.requests / top, ["--i" as string]: i }} data-tip={`${dayLabel(d.day, lang)}: ${nf.format(d.requests)}`} />
            ))}
          </div>
          <div className="a-axis" aria-hidden="true">
            <span>{dayLabel(days[0]!.day, lang)}</span>
            <span>{c.today}</span>
          </div>
          {/* For screen readers. A table won't shrink to sr-only's 1px itself (it stretched the page): its box does. */}
          <div className="sr-only">
            <table>
              <caption>{w.usageChart}</caption>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{dayLabel(d.day, lang)}</th>
                    <td>{nf.format(d.requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

type KeyringProps = {
  keys: ApiKey[] | null;
  max: number;
  creating: boolean;
  setCreating: (on: boolean) => void;
  /** Creates a key; resolves with it and its secret, which is shown this once. */
  onCreate: (name: string) => Promise<{ key: ApiKey; secret: string }>;
  onRevoke: (id: number) => Promise<void>;
};

/**
 * The keys, a row each: its name, its first characters, when it was made and last used. A new
 * key's whole secret is shown once, with a copy button; revoking asks first (the kit's ApiKeys
 * rules, in the account's own design).
 */
function Keyring({ keys, max, creating, setCreating, onCreate, onRevoke }: KeyringProps) {
  const w = useWords();
  const toast = useToast();
  const [name, setName] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ key: ApiKey; secret: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const full = (keys?.length ?? 0) >= max;

  const close = () => {
    setCreating(false);
    setMade(null);
    setName("");
    setTried(false);
    setError(null);
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!name.trim()) return;
    setBusy(true);
    try {
      setMade(await onCreate(name.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await onRevoke(revoking.id);
      toast({ title: w.revoked(revoking.name), tone: "success" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : String(err), tone: "danger" });
    } finally {
      setBusy(false);
      setRevoking(null);
    }
  };

  return (
    <section className="a-keys" id="a-keys" aria-labelledby="a-keys-title">
      <header className="a-keys-head">
        <h2 id="a-keys-title" className="d-h2">
          {w.keys}
        </h2>
        {keys ? <span className="a-count">{w.keyCount(keys.length, max)}</span> : null}
        <Button variant="primary" icon="key" disabled={full || !keys} onClick={() => setCreating(true)} className="a-new">
          {w.newKey}
        </Button>
      </header>
      {full ? <p className="a-muted">{w.atMaxKeys(max)}</p> : null}
      {keys === null ? (
        <div className="a-panel a-wait">
          <Loader />
        </div>
      ) : keys.length === 0 ? (
        <div className="a-panel a-empty p-rise">
          <span className="a-key-icon" aria-hidden="true">
            <Icon name="key" size={24} />
          </span>
          <div>
            <p className="a-empty-title">{w.noKeys}</p>
            <p className="a-muted">{w.noKeysBody}</p>
          </div>
        </div>
      ) : (
        <ul className="a-list">
          {keys.map((k) => (
            <li className="a-key p-rise" key={k.id}>
              <span className="a-key-icon" aria-hidden="true">
                <Icon name="key" size={24} />
              </span>
              <div className="a-key-main">
                <strong className="a-key-name" dir="auto">
                  {k.name}
                </strong>
                <code dir="ltr" className="a-key-prefix">
                  {k.prefix}…
                </code>
              </div>
              <dl className="a-key-meta">
                <div>
                  <dt>{w.created}</dt>
                  <dd>{w.date(k.created_at)}</dd>
                </div>
                <div>
                  <dt>{w.lastUsed}</dt>
                  <dd>{k.last_used_at ? w.date(k.last_used_at) : w.never}</dd>
                </div>
              </dl>
              <Button size="sm" variant="quiet" aria-label={w.revokeKey(k.name)} onClick={() => setRevoking(k)} className="a-revoke">
                {w.revoke}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={creating}
        onClose={close}
        title={made ? w.keyCreated(made.key.name) : w.newKey}
        actions={
          made ? (
            <Button variant="primary" onClick={close}>
              {w.done}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>
                {w.cancel}
              </Button>
              <Button variant="primary" type="submit" form="a-new-key" loading={busy}>
                {w.create}
              </Button>
            </>
          )
        }
      >
        {made ? (
          <div className="grid gap-3">
            <p className="m-0 font-bold text-ink-default">{w.secretOnce}</p>
            <code dir="ltr" className="block overflow-x-auto rounded-control border border-line-default bg-surface-sunken px-3 py-2.5 text-start font-code text-[13.5px] text-ink-default">
              {made.secret}
            </code>
            <div>
              <CopyButton text={made.secret} label={w.copyKey} />
            </div>
          </div>
        ) : (
          <form id="a-new-key" onSubmit={create} noValidate className="grid gap-3">
            <TextField label={w.keyName} hint={w.keyNameHint} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" error={tried && !name.trim() ? w.needKeyName : (error ?? undefined)} />
          </form>
        )}
      </Dialog>
      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={revoking ? w.revokeTitle(revoking.name) : ""}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              {w.keep}
            </Button>
            <Button variant="danger" loading={busy} onClick={revoke}>
              {w.revokeConfirm}
            </Button>
          </>
        }
      >
        {w.revokeBody}
      </Dialog>
    </section>
  );
}

/**
 * Your account. Signed out: signing in with Google. Signed in: the night shows who you are and how
 * many free requests are still standing; the day holds the keys, the last month's use and the way
 * to the API.
 */
export function Keys({ lang, onLang, route }: { lang: Lang; onLang: () => void; route: RouteName }) {
  const c = COPY[lang].pages;
  const { me, refresh, signOut } = useSession();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [max, setMax] = useState(5);
  const [days, setDays] = useState<UsageDay[]>([]);
  const [creating, setCreating] = useState(false);
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

  if (!me) {
    return (
      <Page
        lang={lang}
        onLang={onLang}
        route={route}
        solo
        head={
          me === undefined ? (
            <div className="k-wait">
              <Loader size={32} />
            </div>
          ) : (
            <>
              <h1 className="p-title">
                <Words text={c.keys.title} late />
              </h1>
              <p className="l-p p-late">{c.keys.leadOut}</p>
              <SignIn lang={lang} />
            </>
          )
        }
      />
    );
  }

  return (
    <Page
      lang={lang}
      onLang={onLang}
      route={route}
      late
      head={
        <>
          <div className="a-id p-late">
            <Face me={me} />
          </div>
          <h1 className="p-title a-name">
            <bdi>
              <Words text={me.user.name || me.user.email || ""} late />
            </bdi>
          </h1>
          {me.user.name && me.user.email ? (
            <p className="a-email p-late">
              <bdi>{me.user.email}</bdi>
            </p>
          ) : null}
          <div className="l-actions p-late">
            <button type="button" className="l-btn l-btn-primary" onClick={() => setCreating(true)} disabled={!keys || keys.length >= max}>
              <Icon name="key" size={20} />
              {c.account.newKey}
            </button>
            <button type="button" className="l-btn l-btn-ghost" onClick={() => void signOut()}>
              {c.account.signOut}
            </button>
          </div>
        </>
      }
      side={<Wall used={me.quota.used} limit={me.quota.limit} lang={lang} />}
    >
      <div className="a-grid">
        <Keyring
          keys={keys}
          max={max}
          creating={creating}
          setCreating={setCreating}
          onCreate={async (n) => {
            const r = await call<{ key: ApiKey; secret: string }>("/api/v1/keys", { method: "POST", body: { name: n } });
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
        <div className="a-row">
          <Usage days={days} lang={lang} />
          <a className="a-panel a-next p-rise" href="#/api">
            <span className="a-next-icon" aria-hidden="true">
              <Icon name="code" size={24} />
            </span>
            <strong className="a-h3">{c.account.nextTitle}</strong>
            <span className="a-muted">{c.account.nextBody}</span>
            <span className="a-next-go">
              {c.account.nextGo}
              <Icon name="arrow-forward" size={18} />
            </span>
          </a>
        </div>
      </div>
    </Page>
  );
}
