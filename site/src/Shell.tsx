import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { LaylaFooter, LaylaWordmark } from "@pendar/layla";
import { COPY, type Lang } from "./copy.ts";
import { Sky } from "./landing/Sky.tsx";
import type { RouteName } from "./lib/router.ts";
import { useSession, type Account } from "./lib/session.tsx";
import { setupPage } from "./pages/motion.ts";

/**
 * Text as words, one span each, for word-by-word motion; Persian letters join, so never letters.
 * `late`: the words rise by themselves (CSS), for text that arrives after the page has opened.
 */
export function Words({ text, late }: { text: string; late?: boolean }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className={late ? "w w-late" : "w"} style={late ? { ["--i" as string]: i } : undefined}>
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

/** The account's face: the Google picture, or the initials on a lapis tile. */
export function Face({ me }: { me: Account }) {
  const name = me.user.name || me.user.email || "?";
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return me.user.picture && !broken ? (
    <img className="a-face" src={me.user.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span className="a-face" aria-hidden="true">
      {initials}
    </span>
  );
}

/** The end of the top bar: the other language, and the account (or «ورود»). */
function HeaderEnd({ lang, onLang, route }: { lang: Lang; onLang: () => void; route: RouteName }) {
  const { me } = useSession();
  const n = COPY[lang].nav;
  return (
    <div className="l-top-end">
      <button type="button" onClick={onLang} lang={lang === "fa" ? "en" : "fa"} className="l-top-lang">
        <span className="l-long">{n.lang}</span>
        <span className="l-short" aria-hidden="true">{n.langShort}</span>
      </button>
      {me ? (
        <a href="#/keys" className="l-top-me" aria-label={n.account} aria-current={route === "keys" ? "page" : undefined}>
          <Face me={me} />
        </a>
      ) : (
        <a href="#/keys" className="l-top-in" aria-current={route === "keys" ? "page" : undefined}>
          {n.signIn}
        </a>
      )}
    </div>
  );
}

/**
 * The top bar on every page: Layla's wordmark (home), «امتحان کنید» (the live chat at the end of
 * the landing), «مستندات», and the language and account. A night bar over the night; a day bar
 * once the day comes up under it. On the landing its links move along the page instead of leaving it.
 */
export function TopBar({ lang, onLang, route, day, scrolled }: { lang: Lang; onLang: () => void; route: RouteName; day: boolean; scrolled: boolean }) {
  const n = COPY[lang].nav;
  const here = route === "";
  return (
    <header className={`l-top ${day ? "is-day" : ""} ${scrolled ? "is-scrolled" : ""}`} data-theme={day ? "light" : "dark"}>
      <a href="#/" className="l-top-mark" aria-label={n.home} data-scroll={here ? "top" : undefined}>
        <LaylaWordmark tone={day ? "color" : "reverse"} height={36} />
      </a>
      <nav className="l-top-nav" aria-label={n.label}>
        <a href="#/play" data-scroll={here ? "try" : undefined}>
          {n.try}
        </a>
        <a href="#/api" aria-current={route === "docs" ? "page" : undefined}>
          {n.api}
        </a>
      </nav>
      <HeaderEnd lang={lang} onLang={onLang} route={route} />
    </header>
  );
}

/**
 * Every page but the landing, told the landing's way: it opens in the night (the same sky, the
 * same top bar) with the page's name and what it's for, and dawns into the day, where the work is.
 */
export function Page({ lang, onLang, route, head, side, solo, late, children }: {
  lang: Lang;
  onLang: () => void;
  route: RouteName;
  head: ReactNode;
  side?: ReactNode;
  /** The head alone, without a side. */
  solo?: boolean;
  /** The side arrives after the page has opened (once the account is known): it rises in by itself. */
  late?: boolean;
  children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [day, setDay] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    return setupPage(root.current, { setDay, setScrolled });
  }, [lang, route]);
  return (
    <div ref={root} className="landing l-page">
      <a href="#main" className="skip-link">
        {COPY[lang].nav.skip}
      </a>
      <Sky />
      <TopBar lang={lang} onLang={onLang} route={route} day={day} scrolled={scrolled} />
      <main id="main" tabIndex={-1}>
        <section className={`p-head ${solo ? "is-solo" : ""}`}>
          <div className="p-head-copy">{head}</div>
          {solo ? null : <div className={`p-head-side ${late ? "p-late" : ""}`}>{side}</div>}
        </section>
        <div className="p-dawn" aria-hidden="true" />
        <div className="l-day p-day" data-theme="light">
          {children ? <div className="p-body">{children}</div> : null}
          <LaylaFooter />
        </div>
      </main>
    </div>
  );
}
