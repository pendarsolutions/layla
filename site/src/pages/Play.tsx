import { SERVICES } from "@pendar/layla";
import { Chat } from "../chat/Chat.tsx";
import { COPY, type Lang } from "../copy.ts";

/** The playground: Layla as a chat. From a service's «امتحان کنید», its example is sent at once. */
export function Play({ lang, params }: { lang: Lang; params: URLSearchParams }) {
  const service = SERVICES.find((s) => s.id === params.get("service"));
  return (
    <>
      <h1 className="sr-only">{COPY[lang].pages.play.title}</h1>
      <Chat key={service?.id ?? "free"} lang={lang} variant="page" autoSend={service ? { text: service.text, outputs: service.outputs } : undefined} />
    </>
  );
}
