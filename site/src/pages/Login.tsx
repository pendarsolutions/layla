import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, TextField } from "@pendar/ui";
import { SignInCard } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { call } from "../lib/api.ts";
import { loadGoogle, useSession } from "../lib/session.tsx";

type AuthConfig = { google_client_id: string; dev_login: boolean };

/** Signing in, which only keys need: Google's own button inside Layla's sign-in card. */
export function SignIn({ lang, then = "#/keys" }: { lang: Lang; then?: string }) {
  const c = COPY[lang].pages;
  const { refresh } = useSession();
  const box = useRef<HTMLDivElement>(null);
  const [conf, setConf] = useState<AuthConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const done = async (ok: boolean, code?: string) => {
    if (!ok) return setError(code === "network" ? c.network : c.login.failed);
    await refresh();
    location.hash = then;
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
        window.google.accounts.id.renderButton(box.current, { theme: "outline", size: "large", shape: "rectangular", text: "signin_with", locale: lang, width: 280 });
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
    <div className="mx-auto max-w-lg">
      <SignInCard tryHref="#/play">
        <div className="grid justify-items-center gap-4">
          <div ref={box} className="min-h-11" />
          {conf && !conf.google_client_id ? <Alert tone="info">{c.login.notSetUp}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {conf?.dev_login ? (
            <form onSubmit={dev} className="grid w-full gap-3">
              <TextField label={c.login.devEmail} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Button type="submit" variant="secondary">{c.login.devButton}</Button>
            </form>
          ) : null}
        </div>
      </SignInCard>
    </div>
  );
}

export function Login({ lang }: { lang: Lang }) {
  const { me } = useSession();
  useEffect(() => {
    if (me) location.hash = "#/keys";
  }, [me]);
  return <SignIn lang={lang} />;
}
