import { Stagger } from "@pendar/ui";
import { SERVICES, ServiceCard } from "@pendar/layla";
import { COPY, type Lang } from "../copy.ts";
import { PageHead } from "../Shell.tsx";

export function Services({ lang }: { lang: Lang }) {
  const c = COPY[lang].pages.services;
  return (
    <>
      <PageHead title={c.title} lead={c.lead} />
      <Stagger className="grid gap-6 md:grid-cols-2">
        {SERVICES.map((s) => (
          <ServiceCard key={s.id} service={s} onTry={() => (location.hash = `#/play?service=${s.id}`)} />
        ))}
      </Stagger>
    </>
  );
}
