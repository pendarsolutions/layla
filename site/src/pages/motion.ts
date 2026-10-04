import { ScrollTrigger, ease, gsap, past, q, qa, remeasure, smooth, type Lenis } from "../lib/motion.ts";

type Hooks = { setDay: (day: boolean) => void; setScrolled: (scrolled: boolean) => void };

/**
 * A page's motion, the landing's in short: the name rises word by word out of the night, what it
 * shows comes in from the forward side, the sky drifts and fades with the dawn, and the work in
 * the day rises into place once. Without motion, everything is simply there.
 */
export function setupPage(root: HTMLElement, { setDay, setScrolled }: Hooks): () => void {
  const rtl = document.documentElement.dir === "rtl";
  const forward = rtl ? 1 : -1;
  const cleanups: (() => void)[] = [];
  const day = q(root, ".p-day");

  const dayST = past({ trigger: day, start: "top 72px" }, setDay);
  const solidST = past({ start: 40 }, setScrolled);
  // What arrives later (the account, once it's loaded) is measured, and rises like the rest.
  let riseNew = () => {};
  cleanups.push(() => (dayST.kill(), solidST.kill()), remeasure(q(root, "main"), () => riseNew()));

  // In-page links (the docs' contents) glide there, clear of the top bar.
  let lenis: Lenis | null = null;
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[data-to]");
    if (!a) return;
    const el = document.getElementById(a.dataset.to!);
    if (!el) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(el, { offset: -96, duration: 1.1 });
    else el.scrollIntoView();
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };
  root.addEventListener("click", onClick);
  cleanups.push(() => root.removeEventListener("click", onClick));

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    document.documentElement.classList.replace("still", "motion");
    const enter = ease("enter");
    const s = smooth();
    lenis = s.lenis;

    gsap
      .timeline({ delay: 0.25 })
      .fromTo(qa(root, ".p-title .w:not(.w-late)"), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: enter, stagger: 0.06 })
      .fromTo(qa(root, ".p-head-copy > :not(.p-title, .p-late)"), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: enter, stagger: 0.1 }, "-=0.55")
      .fromTo(qa(root, ".p-head-side:not(.p-late)"), { x: () => -forward * 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9, ease: enter }, 0.15);

    // The sky: three depths over the night, gone by the end of the dawn.
    const night = () => Math.max(1, day.getBoundingClientRect().top + window.scrollY);
    qa(root, ".l-sky-layer").forEach((layer, i) => {
      const factor = [0.06, 0.16, 0.34][i];
      gsap.fromTo(
        layer,
        { y: 0 },
        {
          y: () => -factor * night(),
          ease: "none",
          scrollTrigger: { trigger: root, start: "top top", endTrigger: day, end: "top top", scrub: true, invalidateOnRefresh: true },
        },
      );
    });
    gsap.fromTo(q(root, ".l-sky"), { opacity: 1 }, { opacity: 0, ease: "none", scrollTrigger: { trigger: q(root, ".p-dawn"), start: "top 70%", end: "bottom top", scrub: true } });

    // The work in the day rises into place as it arrives, once.
    const seen = new WeakSet<Element>();
    const batches: ScrollTrigger[] = [];
    riseNew = () => {
      const fresh = qa(root, ".p-rise").filter((el) => !seen.has(el));
      fresh.forEach((el) => seen.add(el));
      if (!fresh.length) return;
      gsap.set(fresh, { opacity: 0, y: 36 });
      batches.push(...ScrollTrigger.batch(fresh, {
        start: "top 92%",
        once: true,
        onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, duration: 0.8, ease: enter, stagger: 0.08, overwrite: true }),
      }));
    };
    riseNew();

    ScrollTrigger.refresh();
    return () => {
      s.stop();
      lenis = null;
      riseNew = () => {};
      batches.forEach((st) => st.kill());
    };
  });
  cleanups.push(() => mm.revert());

  void document.fonts?.ready.then(() => ScrollTrigger.refresh());
  return () => cleanups.reverse().forEach((f) => f());
}
