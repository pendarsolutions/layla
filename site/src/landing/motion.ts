import { flushSync } from "react-dom";
import { ScrollTrigger, arrive, ease, gsap, q, qa, smooth, wipe, type Lenis } from "../lib/motion.ts";

type Hooks = {
  setStep: (n: number) => void;
  setDay: (day: boolean) => void;
  setScrolled: (scrolled: boolean) => void;
  /** A sector's «امتحان کنید»: send its example to the live chat. */
  ask: (service: string) => void;
};
type Target = "try" | "sectors" | "top";
export type LandingControl = {
  destroy: () => void;
  /** Go to a part of the page at once (arriving from another page or an old address). */
  go: (target: Target, opts?: { service?: string | null }) => void;
};

/**
 * The landing's story, told by the scroll. Without motion (or before the script runs) every scene
 * is simply there in its finished state; this adds the pins, the scrubbing and the smooth scroll.
 * Returns its own cleanup (the page leaves, or the language changes).
 */
export function setupLanding(root: HTMLElement, { setStep, setDay, setScrolled, ask }: Hooks): LandingControl {
  const rtl = document.documentElement.dir === "rtl";
  const forward = rtl ? 1 : -1; // the next thing arrives from the left in Persian
  const cleanups: (() => void)[] = [];

  // The top bar is a night bar over the night, and a day bar from the live box down.
  // refreshPriority -1: measured after the pinned scenes above it have added their length.
  const dayST = ScrollTrigger.create({ trigger: q(root, ".l-live"), start: "top 72px", end: "max", refreshPriority: -1, onToggle: (st) => setDay(st.isActive) });
  cleanups.push(() => dayST.kill());
  // Once the page moves, the night bar gets a faint ground of its own, so text passing under it stays clear.
  const solidST = ScrollTrigger.create({ start: 80, end: "max", onToggle: (st) => setScrolled(st.isActive) });
  cleanups.push(() => solidST.kill());

  // The links that stay on this page: «امتحان کنید» goes to the live chat (with a sector's example,
  // sent at once), the wordmark to the top. A long way closes the brick wall over the screen first.
  let lenis: Lenis | null = null;
  const places: Record<Target, () => HTMLElement> = { try: () => q(root, "#try"), sectors: () => q(root, ".l-sectors"), top: () => q(root, "#main") };
  // How many sample answers have arrived, as last told to the page.
  let step = 3;
  const showStep = (n: number) => n !== step && setStep((step = n));
  function land(target: Target, service?: string | null) {
    const el = places[target]();
    // Going past the answers: they're all in first (on a phone they're taller then), so the page
    // is measured as it will be.
    if (target !== "top") flushSync(() => showStep(3));
    arrive(lenis, target === "top" ? 0 : el.getBoundingClientRect().top + window.scrollY);
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    if (service) ask(service);
  }
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[data-scroll]");
    if (!a) return;
    e.preventDefault();
    const target = a.dataset.scroll as Target;
    const service = a.dataset.service;
    if (lenis) wipe(() => land(target, service));
    else land(target, service);
  };
  root.addEventListener("click", onClick);
  cleanups.push(() => root.removeEventListener("click", onClick));

  const mm = gsap.matchMedia();
  mm.add({ motion: "(prefers-reduced-motion: no-preference)", wide: "(min-width: 900px) and (min-height: 600px)" }, (ctx) => {
    const { motion, wide } = ctx.conditions as Record<string, boolean>;
    if (!motion) {
      document.documentElement.classList.replace("motion", "still");
      showStep(3);
      return;
    }
    document.documentElement.classList.replace("still", "motion");
    const enter = ease("enter");
    const settle = ease("settle");
    const N = { immediateRender: false };

    const s = smooth();
    lenis = s.lenis;

    /* ---- The hero: words come in; the scroll lifts the wordmark into the top bar ---- */
    const hero = q(root, ".l-hero");
    const markBox = q(root, ".l-hero-mark");
    const mark = markBox.firstElementChild as HTMLElement;
    const topMark = q(root, ".l-top-mark");
    const copy = q(root, ".l-hero-copy");
    gsap
      .timeline({ delay: 0.5 })
      .fromTo(qa(root, ".l-hero-title .w"), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: enter, stagger: 0.05 })
      .fromTo(qa(root, ".l-hero-lead, .l-hero .l-actions"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: enter, stagger: 0.12 }, "-=0.5")
      .fromTo(q(root, ".l-top"), { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.6, ease: enter }, "-=0.4");
    gsap.set(topMark, { opacity: 0 });
    const handoff = () => {
      const a = markBox.getBoundingClientRect();
      const b = topMark.getBoundingClientRect();
      return { x: b.left - a.left, y: b.top - a.top, s: b.height / a.height };
    };
    gsap
      .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: hero, start: "top top", end: "+=70%", pin: true, scrub: 0.6, invalidateOnRefresh: true } })
      .fromTo(copy, { y: 0, opacity: 1 }, { y: -80, opacity: 0, duration: 0.45, ease: "power1.in" }, 0)
      .fromTo(mark, { x: 0, y: 0, scale: 1, transformOrigin: "0 0" }, { x: () => handoff().x, y: () => handoff().y, scale: () => handoff().s, duration: 0.85, ease: "power2.inOut" }, 0)
      .fromTo(topMark, { opacity: 0 }, { opacity: 1, duration: 0.05, ...N }, 0.85)
      .fromTo(mark, { opacity: 1 }, { opacity: 0, duration: 0.05, ...N }, 0.86)
      .to({}, { duration: 0.1 }, 0.9);

    /* ---- The sky: three depths, moving at three speeds over the whole night ---- */
    const live = q(root, ".l-live");
    const layers = qa(root, ".l-sky-layer");
    const night = () => Math.max(1, live.getBoundingClientRect().top + window.scrollY);
    layers.forEach((layer, i) => {
      const factor = [0.06, 0.16, 0.34][i];
      gsap.fromTo(
        layer,
        { y: 0 },
        {
          y: () => {
            const travel = factor * night();
            layer.style.height = `${window.innerHeight + travel + 200}px`;
            return -travel;
          },
          ease: "none",
          scrollTrigger: { trigger: root, start: "top top", endTrigger: live, end: "top top", scrub: true, invalidateOnRefresh: true, refreshPriority: -1 },
        },
      );
    });
    gsap.fromTo(q(root, ".l-sky"), { opacity: 1 }, { opacity: 0, ease: "none", scrollTrigger: { trigger: q(root, ".l-dawn"), start: "top bottom", end: "bottom center", scrub: true, refreshPriority: -1 } });

    /*
     * Each scene arrives in two parts: its words and frame come in while it scrolls into view
     * (so no screen of empty sky passes between scenes), then it's held while its own story plays.
     */
    const entry = (section: HTMLElement, targets: gsap.TweenTarget, from: gsap.TweenVars, stagger = 0.05) =>
      gsap.fromTo(targets, from, {
        x: 0,
        y: 0,
        opacity: 1,
        ease: "none",
        stagger,
        scrollTrigger: { trigger: section, start: "top 85%", end: "top 20%", scrub: 0.6, invalidateOnRefresh: true },
      });

    /* ---- A message arrives, word by word; the phrases that matter light up ---- */
    const msg = q(root, ".l-message");
    const msgWords = qa(msg, ".l-message-text .w");
    const marks = qa(msg, ".l-mark");
    entry(msg, qa(msg, ".l-scene-copy > *"), { y: 40, opacity: 0 });
    entry(msg, q(msg, ".l-message-card"), { x: () => -forward * 80, opacity: 0 });
    gsap
      .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: msg, start: wide ? "top top" : "top 60%", end: wide ? "+=110%" : "bottom 40%", pin: wide, scrub: 0.6 } })
      .fromTo(msgWords, { opacity: 0.1 }, { opacity: 1, duration: 0.02, stagger: 0.55 / msgWords.length }, 0)
      .fromTo(marks, { "--hl": "0%" }, { "--hl": "100%", duration: 0.1, stagger: 0.08 }, 0.62)
      .to({}, { duration: 0.1 }, 0.9);

    /* ---- The questions drop in; their options are laid like bricks ---- */
    const qs = q(root, ".l-questions");
    entry(qs, qa(qs, ".l-scene-copy > *"), { y: 40, opacity: 0 });
    const qtl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: qs, start: wide ? "top 30%" : "top 70%", end: wide ? "+=130%" : "bottom 50%", pin: false, scrub: 0.6 } });
    if (wide) ScrollTrigger.create({ trigger: qs, start: "top top", end: "+=100%", pin: true });
    qa(qs, ".l-q").forEach((row, i) => {
      const at = i * 0.3;
      qtl
        .fromTo(row, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.12 }, at)
        .fromTo(qa(row, ".l-opt"), { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.07, stagger: 0.035, ease: settle }, at + 0.1);
    });
    qtl.to({}, { duration: 0.1 }, 0.9);

    /* ---- The rule, held while its words light up ---- */
    const rule = q(root, ".l-rule");
    gsap
      .timeline({ scrollTrigger: { trigger: rule, start: "top 60%", end: () => `+=${window.innerHeight * 1.4}`, scrub: 0.6 } })
      .fromTo(qa(rule, ".w"), { opacity: 0.12 }, { opacity: 1, duration: 0.25, stagger: 0.06, ease: "none" })
      .to({}, { duration: 0.3 });
    ScrollTrigger.create({ trigger: rule, start: "top top", end: "+=60%", pin: true });

    /* ---- The answers arrive one by one, in the kit's own answer cards ---- */
    const ans = q(root, ".l-answers");
    entry(ans, qa(ans, ".l-scene-copy > *"), { y: 40, opacity: 0 });
    entry(ans, qa(ans, ".l-decisions > *"), { y: 50, opacity: 0 }, 0.08);
    showStep(-1);
    ScrollTrigger.create({
      trigger: ans,
      start: wide ? "top top" : "top 55%",
      end: wide ? "+=130%" : "bottom 40%",
      pin: wide,
      onUpdate: (st) => {
        const p = st.progress;
        const next = p < 0.08 ? -1 : p < 0.3 ? 0 : p < 0.52 ? 1 : p < 0.74 ? 2 : 3;
        showStep(next);
      },
    });

    /* ---- Speed: the stream, line by line, timed ---- */
    const speed = q(root, ".l-speed");
    const num = q(speed, ".l-speed-num");
    const to = Number(num.dataset.to);
    const nf = new Intl.NumberFormat(rtl ? "fa-IR" : "en-US");
    const count = { v: 0 };
    entry(speed, q(speed, ".l-speed-figure"), { y: 60, opacity: 0 });
    entry(speed, qa(speed, ".l-speed-copy > *"), { y: 40, opacity: 0 });
    gsap
      .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: speed, start: wide ? "top top" : "top 60%", end: wide ? "+=100%" : "bottom 40%", pin: wide, scrub: 0.6 } })
      .fromTo(count, { v: 0 }, { v: to, duration: 0.3, onUpdate: () => void (num.textContent = nf.format(Math.round(count.v))) }, 0)
      .fromTo(qa(speed, ".l-stream li"), { x: () => -forward * 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.08, stagger: 0.12 }, 0.2)
      .to({}, { duration: 0.12 }, 0.88);

    /* ---- The sectors: a walk along them, in the reading direction ---- */
    const sectors = q(root, ".l-sectors");
    const track = q(sectors, ".l-track");
    entry(sectors, qa(sectors, ".l-sectors-head > *"), { y: 40, opacity: 0 });
    if (wide) {
      entry(sectors, track, { x: () => -forward * 120, opacity: 0 });
      const distance = () => Math.max(0, track.scrollWidth - sectors.clientWidth);
      gsap
        .timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: sectors, start: "top top", end: () => `+=${distance() + window.innerHeight * 0.3}`, pin: true, scrub: 0.6, invalidateOnRefresh: true } })
        .fromTo(track, { x: 0 }, { x: () => forward * distance(), duration: 1, ...N }, 0.05)
        .fromTo(qa(sectors, ".l-sector-icon"), { scale: 0.6 }, { scale: 1, duration: 0.15, stagger: 0.14 }, 0);
    } else {
      gsap.fromTo(qa(sectors, ".l-sector"), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: enter, stagger: 0.1, scrollTrigger: { trigger: track, start: "top 80%" } });
    }

    /* ---- For developers: the code arrives from the forward side ---- */
    const dev = q(root, ".l-dev");
    gsap
      .timeline({ scrollTrigger: { trigger: dev, start: "top 70%", refreshPriority: -1 } })
      .fromTo(qa(dev, ".l-scene-copy > *"), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: enter, stagger: 0.1 })
      .fromTo(q(dev, ".l-code"), { x: () => -forward * 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: enter }, 0.1);

    /* ---- Dawn, and the live chat rising into the day ---- */
    gsap.fromTo(q(root, ".l-live .c-chat"), { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: enter, scrollTrigger: { trigger: live, start: "top 80%", refreshPriority: -1 } });

    ScrollTrigger.refresh();
    return () => {
      s.stop();
      lenis = null;
    };
  });
  cleanups.push(() => mm.revert());

  // Estedad arrives after the first layout: measure again once it has (and only then go anywhere).
  let alive = true;
  const fonts = document.fonts?.ready.then(() => alive && ScrollTrigger.refresh()) ?? Promise.resolve();
  cleanups.push(() => (alive = false));
  return {
    destroy: () => cleanups.reverse().forEach((f) => f()),
    go: (target, { service } = {}) => void fonts.then(() => alive && land(target, service)),
  };
}
