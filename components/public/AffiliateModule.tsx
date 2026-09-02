import { ArrowUpRight, Compass } from "lucide-react";
import type { AffiliateLinkDTO } from "@/lib/public-read/dto";
import type { Locale } from "@/lib/locales";

export function AffiliateModule({
  links, locale, title, intro, cta, disclosure,
}: {
  links: AffiliateLinkDTO[];
  locale: Locale;
  title: string;
  intro: string;
  cta: (partner: string) => string;
  disclosure: string;
}) {
  return (
    <section className="mt-10" aria-labelledby="affiliate-heading">
      <div className="rounded-card border border-hairline bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ocean text-white"><Compass size={17} aria-hidden /></span>
          <div><h2 id="affiliate-heading" className="font-serif text-[1.3125rem] text-ink">{title}</h2><p className="mt-1 text-sm leading-6 text-secondary">{intro}</p></div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <a
              key={link.id}
              href={`/api/out/${link.id}?locale=${locale}`}
              rel="sponsored"
              className="group flex min-h-12 items-center justify-between gap-3 rounded-field border border-hairline-strong bg-white px-4 py-3 text-sm font-bold text-ink transition hover:border-ocean hover:text-ocean focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean focus-visible:ring-offset-2"
            >
              <span>{cta(link.partnerName)}</span><ArrowUpRight size={16} className="shrink-0" aria-hidden />
            </a>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">{disclosure}</p>
      </div>
    </section>
  );
}
