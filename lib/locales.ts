/**
 * The single locale allowlist (PRD D3: EN at root, /ja, /ko).
 *
 * Every layer that enumerates locales derives from this module: the config
 * loader, route params, schema.org generation, and analytics. The DB mirrors
 * it in named CHECK constraints (`*_locale_check`); a db-suite test asserts
 * the two stay in agreement, so a new locale is a deliberate two-sided change.
 *
 * Note: which locales are *publicly served* per market is runtime config
 * (`locale_availability` in app_config — KO ships in Slice 2); this list is
 * the schema-level universe, which already includes `ko`.
 */
export const LOCALES = ["en", "ja", "ko"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
