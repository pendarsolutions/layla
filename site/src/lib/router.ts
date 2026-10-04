import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { transition } from "@pendar/ui";

/** The pages, by their address after #/: "" is the landing. Old addresses keep working. */
export type RouteName = "" | "play" | "services" | "docs" | "keys" | "login";
export type Route = { name: RouteName; params: URLSearchParams };
const ORDER: RouteName[] = ["", "play", "services", "docs", "keys", "login"];
const ALIASES: Record<string, RouteName> = { api: "docs" };

export function parse(hash: string = typeof location === "undefined" ? "" : location.hash): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const name = (ORDER as string[]).includes(path) ? (path as RouteName) : (ALIASES[path] ?? "");
  return { name, params: new URLSearchParams(query) };
}

/**
 * The current page. Moving between pages slides the new one in from the side you're going
 * towards (Pendar's page transition: from the left in Persian), unless the visitor asked for less
 * motion.
 */
export function useRoute(initial?: Route): Route {
  const [route, setRoute] = useState<Route>(() => initial ?? parse());
  const current = useRef(route);
  current.current = route;
  useEffect(() => {
    const onChange = () => {
      const next = parse();
      const prev = current.current;
      if (prev.name === next.name) return setRoute(next);
      const dir = ORDER.indexOf(next.name) >= ORDER.indexOf(prev.name) ? "forward" : "back";
      transition(dir, () => {
        flushSync(() => setRoute(next));
        window.scrollTo(0, 0);
      });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
