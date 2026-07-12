import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locales";
import { getHomeDTO } from "@/lib/public-read/server";
import { categoryPath } from "@/lib/public-read/paths";

/**
 * Public home = category browse (CP4). Minimal scaffold in Unit E; the designed layout,
 * language switcher, and hero land in Unit F. Data flows through the read model.
 */
export const dynamicParams = false;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const home = await getHomeDTO(locale);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Browse</h1>
      <ul className="mt-6 flex flex-col gap-2">
        {home.categories.map((category) => (
          <li key={category.slug}>
            <Link className="text-teal hover:text-teal-dark" href={categoryPath(locale, category.slug)}>
              {category.label} ({category.count})
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
