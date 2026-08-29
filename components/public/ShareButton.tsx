/**
 * Server-rendered share control. The dependency-free public enhancement script
 * adds native-share/clipboard behavior and analytics; with JS off it remains a
 * harmless inert button because sharing is not core content.
 */
export function ShareButton({
  title,
  listingId,
  locale,
  label,
  copiedLabel,
}: {
  title: string;
  listingId: string;
  locale: string;
  label: string;
  copiedLabel: string;
}) {
  return (
    <button
      type="button"
      data-public-share
      data-title={title}
      data-listing-id={listingId}
      data-locale={locale}
      data-label={label}
      data-copied-label={copiedLabel}
      className="min-h-9 rounded-cta border border-hairline px-3 text-[12px] font-semibold text-ink hover:bg-neutral"
    >
      {label}
    </button>
  );
}
