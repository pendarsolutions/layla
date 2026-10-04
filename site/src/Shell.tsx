import type { ReactNode } from "react";
import { Avatar, Stagger } from "@pendar/ui";
import { LaylaFooter, LaylaHeader, type LaylaLink } from "@pendar/layla";
import { COPY, type Lang } from "./copy.ts";
import type { RouteName } from "./lib/router.ts";
import { useSession } from "./lib/session.tsx";

export function navLinks(lang: Lang): LaylaLink[] {
  const n = COPY[lang].nav;
  return [
    { id: "play", href: "#/play", label: n.play },
    { id: "services", href: "#/services", label: n.services },
    { id: "docs", href: "#/docs", label: n.docs },
    { id: "keys", href: "#/keys", label: n.keys },
  ];
}

/** The end of the top bar: the other language, and the account (or «ورود»). */
export function HeaderEnd({ lang, onLang, className }: { lang: Lang; onLang: () => void; className?: string }) {
  const { me } = useSession();
  const n = COPY[lang].nav;
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <button type="button" onClick={onLang} lang={lang === "fa" ? "en" : "fa"} className="cursor-pointer rounded-control px-2 py-1 text-label text-ink-muted hover:text-ink-default">
        {n.lang}
      </button>
      {me ? (
        <a href="#/keys" className="flex items-center gap-2 rounded-control text-label text-ink-default no-underline" aria-label={me.user.name ?? me.user.email}>
          <Avatar name={me.user.name || me.user.email || "?"} src={me.user.picture} size="sm" />
        </a>
      ) : (
        <a href="#/login" className="rounded-control px-2 py-1 text-label font-bold text-ink-action no-underline hover:underline">
          {n.signIn}
        </a>
      )}
    </div>
  );
}

/** Every page but the landing: Layla's top bar, the page, and the footer with Pendar's credit. */
export function Shell({ lang, route, onLang, children }: { lang: Lang; route: RouteName; onLang: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="skip-link">
        {COPY[lang].nav.skip}
      </a>
      <LaylaHeader links={navLinks(lang)} current={route} homeHref="#/" end={<HeaderEnd lang={lang} onLang={onLang} />} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-20 sm:px-8">
        {children}
      </main>
      <LaylaFooter />
    </div>
  );
}

export function PageHead({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <Stagger className="mb-10 max-w-3xl">
      <h1 className="m-0 text-display">{title}</h1>
      {lead ? <p className="mt-3 mb-0 text-body-large text-ink-muted">{lead}</p> : <span />}
      {children ? <div className="mt-5">{children}</div> : <span />}
    </Stagger>
  );
}
