import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function PublicEmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section
      aria-labelledby="public-empty-title"
      className="rounded-card border border-dashed border-hairline-strong bg-field/45 px-5 py-10 text-center sm:px-8 sm:py-14"
    >
      <span
        aria-hidden="true"
        className="mx-auto grid size-12 place-items-center rounded-full border border-teal/15 bg-info-bg text-teal-dark"
      >
        <Compass className="size-5" />
      </span>
      <h2 id="public-empty-title" className="mt-5 font-serif text-2xl leading-tight text-ink sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-[14px] leading-[1.75] text-secondary">{body}</p>
      {actionHref && actionLabel ? (
        <a href={actionHref} className={`${buttonVariants({ variant: "outline", size: "md" })} mt-6`}>
          {actionLabel}
        </a>
      ) : null}
    </section>
  );
}
