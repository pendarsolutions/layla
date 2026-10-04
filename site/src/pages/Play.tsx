import { Playground, SERVICES, streamDecisions, type OutputSpec } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { API } from "../lib/api.ts";
import { PageHead } from "../Shell.tsx";

/** Answers from the real model, through the public demo (no key, the anonymous limits). */
export const runLayla = (text: string, outputs: OutputSpec[], signal: AbortSignal) => streamDecisions({ baseUrl: API, text, outputs, signal });

export function Play({ lang, params }: { lang: Lang; params: URLSearchParams }) {
  const c = COPY[lang].pages.play;
  // From a service's «امتحان کنید»: its example, sent at once.
  const service = SERVICES.find((s) => s.id === params.get("service"));
  return (
    <>
      <PageHead title={c.title} lead={c.lead} />
      <Playground
        key={service?.id ?? "free"}
        run={runLayla}
        maxChars={4000}
        defaultText={service?.text}
        defaultOutputs={service?.outputs}
        autoRun={Boolean(service)}
      />
    </>
  );
}
