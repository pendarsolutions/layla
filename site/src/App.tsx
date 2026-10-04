import { useEffect, useState } from "react";
import { LABELS_EN, LABELS_FA, LabelsProvider, ToastProvider } from "@pendar/ui";
import type { Lang } from "./copy.ts";
import { Landing } from "./landing/Landing.tsx";
import { applyLang, saveLang } from "./lib/lang.ts";
import { useRoute, type Route } from "./lib/router.ts";
import { SessionProvider } from "./lib/session.tsx";
import { Docs } from "./pages/Docs.tsx";
import { Keys } from "./pages/Keys.tsx";

/** Three pages: the landing (with the live chat at its end), the docs, and the API keys. */
export function App({ initialLang, initialRoute }: { initialLang: Lang; initialRoute?: Route }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const route = useRoute(initialRoute);
  const onLang = () => {
    const next = lang === "fa" ? "en" : "fa";
    saveLang(next);
    applyLang(next);
    setLang(next);
  };
  useEffect(() => applyLang(lang), [lang]);

  return (
    <LabelsProvider labels={lang === "en" ? LABELS_EN : LABELS_FA}>
      <ToastProvider>
        <SessionProvider>
          {route.name === "docs" ? (
            <Docs lang={lang} onLang={onLang} route={route.name} />
          ) : route.name === "keys" ? (
            <Keys lang={lang} onLang={onLang} route={route.name} />
          ) : (
            <Landing lang={lang} onLang={onLang} route={route} />
          )}
        </SessionProvider>
      </ToastProvider>
    </LabelsProvider>
  );
}
