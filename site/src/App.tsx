import { useEffect, useState } from "react";
import { LABELS_EN, LABELS_FA, LabelsProvider, ToastProvider } from "@pendar/ui";
import type { Lang } from "./copy.ts";
import { Landing } from "./landing/Landing.tsx";
import { applyLang, saveLang } from "./lib/lang.ts";
import { useRoute, type Route } from "./lib/router.ts";
import { SessionProvider } from "./lib/session.tsx";
import { Docs } from "./pages/Docs.tsx";
import { Keys } from "./pages/Keys.tsx";
import { Login } from "./pages/Login.tsx";
import { Play } from "./pages/Play.tsx";
import { Services } from "./pages/Services.tsx";
import { Shell } from "./Shell.tsx";

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

  const page =
    route.name === "play" ? <Play lang={lang} params={route.params} />
    : route.name === "services" ? <Services lang={lang} />
    : route.name === "docs" ? <Docs lang={lang} />
    : route.name === "keys" ? <Keys lang={lang} />
    : route.name === "login" ? <Login lang={lang} />
    : null;

  return (
    <LabelsProvider labels={lang === "en" ? LABELS_EN : LABELS_FA}>
      <ToastProvider>
        <SessionProvider>
          {page ? (
            <Shell lang={lang} route={route.name} onLang={onLang}>
              {page}
            </Shell>
          ) : (
            <Landing lang={lang} onLang={onLang} />
          )}
        </SessionProvider>
      </ToastProvider>
    </LabelsProvider>
  );
}
