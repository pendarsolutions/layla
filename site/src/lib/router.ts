import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { wipe } from "./motion.ts";

/**
 * The pages, by their address after #/: "" is the landing (the story, and the live chat at its
 * end), "docs" the API docs, "keys" the account's API keys (and signing in). Old addresses keep
 * working: the playground and the services now live on the landing, signing in on the keys page.
 */
export type RouteName = "" | "docs" | "keys";
export type Section = "try" | "sectors";
export type Route = { name: RouteName; params: URLSearchParams; section?: Section };
const NAMES: RouteName[] = ["", "docs", "keys"];
const ALIASES: Record<string, { name: RouteName; section?: Section }> = {
  api: { name: "docs" },
  login: { name: "keys" },
  play: { name: "", section: "try" },
  services: { name: "", section: "sectors" },
};

export function parse(hash: string = typeof location === "undefined" ? "" : location.hash): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  if ((NAMES as string[]).includes(path)) return { name: path as RouteName, params };
  return { ...(ALIASES[path] ?? { name: "" }), params };
}

/** The current page. Moving between pages closes the brick wall over the screen and opens it on the new one. */
export function useRoute(initial?: Route): Route {
  const [route, setRoute] = useState<Route>(() => initial ?? parse());
  const current = useRef(route);
  current.current = route;
  useEffect(() => {
    const onChange = () => {
      const next = parse();
      if (current.current.name === next.name) return setRoute(next);
      wipe(() => {
        flushSync(() => setRoute(next));
        window.scrollTo(0, 0);
      });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
