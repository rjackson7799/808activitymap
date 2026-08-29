/**
 * Breadcrumb trail (CP4). Pairs with the BreadcrumbList JSON-LD (/lib/schema). The last
 * item is the current page (no link, aria-current).
 */
export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12.5px] text-secondary">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-1.5">
            {item.href ? (
              <a href={item.href} className="hover:text-teal-dark">
                {item.name}
              </a>
            ) : (
              <span aria-current="page" className="text-ink">
                {item.name}
              </span>
            )}
            {index < items.length - 1 ? (
              <span aria-hidden className="text-disabled">
                ›
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
