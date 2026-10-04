import { useCallback, useEffect, useState } from "react";
import { Button, Loader } from "@pendar/ui";
import { ApiKeys, CodeSample, QuotaCard, UsageChart, type ApiKey, type UsageDay } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { API, call, type Failure } from "../lib/api.ts";
import { useSession } from "../lib/session.tsx";
import { PageHead } from "../Shell.tsx";
import { SignIn } from "./Login.tsx";

const MESSAGES: Record<string, Record<Lang, string>> = {
  key_limit: { fa: "به سقف کلیدها رسیده‌اید. اول یکی را باطل کنید.", en: "You've reached the key limit. Revoke one first." },
  rate_limited: { fa: "درخواست‌ها زیاد شد. کمی بعد دوباره امتحان کنید.", en: "Too many requests. Try again a little later." },
};

export function Keys({ lang }: { lang: Lang }) {
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

  if (me === undefined) return <div className="grid min-h-[40svh] place-items-center"><Loader /></div>;
  if (me === null)
    return (
      <>
        <PageHead title={c.keys.title} lead={c.keys.lead} />
        <SignIn lang={lang} />
      </>
    );

  return (
    <>
      <PageHead title={c.keys.title} lead={c.keys.lead}>
        <Button variant="quiet" size="sm" onClick={() => void signOut()} icon="logout">
          {c.keys.signOut}
        </Button>
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-2">
        <QuotaCard used={me.quota.used} limit={me.quota.limit} premiumSoon />
        <UsageChart days={days} />
      </div>
      <div className="mt-6">
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
          <div className="grid min-h-40 place-items-center"><Loader /></div>
        )}
      </div>
      <section className="mt-10">
        <h2 className="mt-0 mb-4 text-heading-medium">{c.keys.sample}</h2>
        <CodeSample baseUrl={location.origin + API} />
      </section>
    </>
  );
}
