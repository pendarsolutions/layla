import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { call } from "./api.ts";

export type Account = {
  user: { name?: string; email?: string; picture?: string };
  quota: { limit: number; used: number; remaining: number };
  premium: Record<string, unknown>;
  keys: Record<string, unknown>;
};
type Session = {
  /** undefined while it isn't known yet, null when signed out. */
  me: Account | null | undefined;
  refresh: () => Promise<Account | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Session>({ me: undefined, refresh: async () => null, signOut: async () => {} });
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Account | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    const r = await call<Account>("/api/v1/account");
    const next = r.ok ? r.data : null;
    setMe(next);
    return next;
  }, []);
  const signOut = useCallback(async () => {
    await call("/api/v1/auth/logout", { method: "POST" });
    setMe(null);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ me, refresh, signOut }}>{children}</Ctx.Provider>;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; ux_mode?: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gsi: Promise<void> | null = null;
/** Google Identity Services, loaded once, the first time a sign-in button is needed. */
export function loadGoogle(): Promise<void> {
  gsi ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gsi"));
    document.head.append(s);
  });
  return gsi;
}
