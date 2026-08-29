/**
 * Editorial note (PRD §8). Rendered only when present in-locale (the page omits it when
 * absent — EN prose never renders on a JA page). Terracotta left rule per the design system.
 */
export function EditorialNote({ note, label }: { note: string; label: string }) {
  return (
    <aside className="border-l-[3px] border-terracotta bg-warning-bg/50 py-3 pl-4 pr-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-[#5B4636]">{note}</p>
    </aside>
  );
}
