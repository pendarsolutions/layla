import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, CustomEase);

export { gsap, ScrollTrigger, Lenis };

export const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)!;
export const qa = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => [...root.querySelectorAll<T>(sel)];
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Pendar's ease tokens (--ease-*) as GSAP eases. */
export function ease(name: "enter" | "settle" | "standard"): string {
  const id = `layla-${name}`;
  if (!CustomEase.get(id)) {
    const [a, b, c, d] = (css(`--ease-${name}`).match(/cubic-bezier\(([^)]+)\)/)?.[1] ?? "0.2,0,0,1").split(",").map(Number);
    CustomEase.create(id, `M0,0 C${a},${b} ${c},${d} 1,1`);
  }
  return id;
}

/** The smooth scroll every page shares, driven by GSAP's clock so the scrubbed scenes stay in step. */
export function smooth(): { lenis: Lenis; stop: () => void } {
  const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, autoRaf: false });
  lenis.on("scroll", ScrollTrigger.update);
  const raf = (t: number) => lenis.raf(t * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);
  return {
    lenis,
    stop: () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    },
  };
}

/** Move at once, and let every scrubbed scene arrive there too instead of catching up on screen. */
export function arrive(lenis: Lenis | null, y: number) {
  // The page may have just grown (a page arriving, its pins added): let the smooth scroll measure it first.
  if (lenis) (lenis.resize(), lenis.scrollTo(y, { immediate: true, force: true }));
  else window.scrollTo(0, y);
  ScrollTrigger.update();
  for (const st of ScrollTrigger.getAll()) {
    if (!st.vars.scrub) continue;
    const tween = st.getTween() as gsap.core.Tween | undefined;
    if (tween && typeof tween.progress === "function") tween.progress(1);
  }
}

/*
 * The wall: a long jump, on a page or between pages, closes a wall of night-lapis bricks over the
 * screen, moves behind it, and opens it again, course by course in the reading direction.
 */
let wall: HTMLDivElement | null = null;
let walling = false;
export function wipe(during: () => void) {
  if (still() || walling) return during();
  if (!wall) {
    wall = document.createElement("div");
    wall.className = "l-wipe";
    wall.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 6; i++) wall.append(document.createElement("i"));
    document.body.append(wall);
  }
  walling = true;
  const rtl = document.documentElement.dir === "rtl";
  const courses = [...wall.children];
  gsap
    .timeline({ onComplete: () => ((walling = false), gsap.set(wall, { visibility: "hidden" })) })
    .set(wall, { visibility: "visible" })
    .fromTo(courses, { scaleX: 0, transformOrigin: rtl ? "right center" : "left center" }, { scaleX: 1, duration: 0.3, ease: ease("enter"), stagger: { each: 0.04, from: "end" } })
    .add(during)
    .to(courses, { scaleX: 0, transformOrigin: rtl ? "left center" : "right center", duration: 0.3, ease: ease("enter"), stagger: { each: 0.04, from: "start" } }, "+=0.12");
}

/** Measure the scenes again whenever the page's height changes (an answer arrives, the account loads). */
export function remeasure(el: Element, then?: () => void): () => void {
  let timer = 0;
  let last = 0;
  const ro = new ResizeObserver(([entry]) => {
    const h = Math.round(entry.contentRect.height);
    if (h === last) return;
    last = h;
    clearTimeout(timer);
    timer = window.setTimeout(() => (ScrollTrigger.refresh(), then?.()), 150);
  });
  ro.observe(el);
  return () => (clearTimeout(timer), ro.disconnect());
}
