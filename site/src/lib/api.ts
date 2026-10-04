/**
 * Talking to Layla's API. The site is served by the API itself, so the API is wherever this page
 * is: "/layla" for https://pendarsolutions.ir/layla/. ?api=URL overrides it for a visit.
 */
export const API: string =
  typeof location === "undefined"
    ? ""
    : (new URLSearchParams(location.search).get("api") ?? location.pathname.replace(/\/[^/]*$/, "")).replace(/\/$/, "");

/** The canonical address of the API, for code samples (the same on the server and in the browser's first render). */
export const PUBLIC_API = "https://pendarsolutions.ir/layla";

export type Failure = { code: string; message?: string };
export type Reply<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: Failure };

/** An account call: the session cookie goes along, and the header the API asks of every change. */
export async function call<T>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<Reply<T>> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      credentials: "include",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), "X-Requested-With": "layla" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: { code: "network" } };
  }
  let data: unknown = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      /* empty */
    }
  }
  if (res.ok) return { ok: true, status: res.status, data: data as T };
  return { ok: false, status: res.status, error: ((data as { error?: Failure } | null)?.error ?? { code: "http_" + res.status }) as Failure };
}
