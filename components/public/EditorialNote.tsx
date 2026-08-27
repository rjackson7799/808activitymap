/**
 * Editorial note (PRD §8). Rendered only when present in-locale (the page omits it when
 * absent — EN prose never renders on a JA page). Terracotta left rule per the design system.
 */
export function EditorialNote({ note }: { note: string }) {
  return (
    <blockquote className="border-l-2 border-terracotta pl-4 text-[15px] italic leading-relaxed text-body">
      {note}
    </blockquote>
  );
}
