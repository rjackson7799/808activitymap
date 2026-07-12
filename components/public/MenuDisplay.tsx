import type { MenuDTO } from "@/lib/public-read/dto";
import type { UiStrings } from "@/lib/i18n/ui";

/**
 * Menu display (CP4). Marcellus section headers, per-locale item name + description,
 * right-aligned price. Prices are language-neutral amounts with localized chrome (the read
 * model guarantees a locale's menu renders only from that locale's approved version — no
 * cross-locale money fallback). Allergen disclaimer always present.
 */
export function MenuDisplay({ menu, strings }: { menu: MenuDTO; strings: UiStrings }) {
  return (
    <div className="flex flex-col gap-6">
      {menu.sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          <h3 className="font-serif text-lg text-ink">{section.name}</h3>
          <ul className="mt-2 divide-y divide-hairline">
            {section.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">
                    {item.name}
                    {item.ownerPick ? (
                      <span className="ml-2 rounded-badge bg-warning-bg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-terracotta-deep">
                        {strings.ownerPick}
                      </span>
                    ) : null}
                  </p>
                  {item.description ? (
                    <p className="mt-0.5 text-[13px] leading-relaxed text-secondary">{item.description}</p>
                  ) : null}
                </div>
                {item.price ? (
                  <span className="shrink-0 font-serif text-[15px] tabular-nums text-ink">{item.price}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-[12px] text-muted">{strings.allergenNote}</p>
    </div>
  );
}
