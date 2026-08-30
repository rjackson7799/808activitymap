"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  adminCheckboxClassName,
  adminErrorClassName,
  adminInputClassName,
  adminLabelClassName,
  adminSuccessClassName,
} from "@/components/admin/formStyles";
import { updateCategoryFlags, upsertCategoryLocale, type ActionState } from "../actions";

/** Structure flags (parent/sort/visibility). Active is toggled separately. */
export function FlagsForm({
  category,
}: {
  category: { id: string; parent_id: string | null; sort: number; publicly_visible: boolean };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCategoryFlags, {});

  return (
    <form action={action} aria-label="Category settings" className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6">
      <h2 className="text-xl font-bold text-ink">Settings</h2>
      <p className="mt-1 text-sm leading-6 text-secondary">Control hierarchy, display order, and public visibility.</p>
      <input type="hidden" name="category_id" value={category.id} />
      <div className="mt-5 space-y-4">
      <div>
        <label htmlFor="category-parent" className={adminLabelClassName}>Parent category ID</label>
        <input
          id="category-parent"
          name="parent_id"
          defaultValue={category.parent_id ?? ""}
          autoComplete="off"
          className={adminInputClassName}
          disabled={pending}
        />
        <p className="mt-2 text-xs leading-5 text-muted">Leave blank for a top-level category.</p>
      </div>
      <div className="max-w-32">
        <label htmlFor="category-sort" className={adminLabelClassName}>Sort order</label>
        <input id="category-sort" name="sort" type="number" defaultValue={category.sort} className={adminInputClassName} disabled={pending} />
      </div>
      <label className="flex min-h-11 items-center gap-3 rounded-field bg-field px-3 py-2 text-sm font-semibold text-ink">
        <input name="publicly_visible" type="checkbox" defaultChecked={category.publicly_visible} className={adminCheckboxClassName} disabled={pending} />
        Publicly visible
      </label>
      {state.error ? <p role="alert" className={adminErrorClassName}>{state.error}</p> : null}
      {state.ok ? <p role="status" className={adminSuccessClassName}>Saved.</p> : null}
      <Button type="submit" variant="cta" size="lg" disabled={pending} className="w-full">{pending ? "Saving…" : "Save settings"}</Button>
      </div>
    </form>
  );
}

/** Per-locale label + slug upsert. */
export function LocaleForm({
  categoryId,
  locale,
  label,
  slug,
}: {
  categoryId: string;
  locale: string;
  label: string;
  slug: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(upsertCategoryLocale, {});

  return (
    <form action={action} aria-label={`${locale} label and slug`} className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6">
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">{localeName(locale)}</p>
          <h3 className="text-lg font-bold text-ink">Label and slug</h3>
        </div>
        <span className={`rounded-chip px-2.5 py-1 text-xs font-bold ${label && slug ? "bg-success-bg text-success" : "bg-warning-bg text-terracotta-deep"}`}>
          {label && slug ? "Complete" : "Needs content"}
        </span>
      </div>
      <div className="space-y-4">
      <div>
        <label htmlFor={`label-${locale}`} className={adminLabelClassName}>Label ({locale})</label>
        <input id={`label-${locale}`} name="label" defaultValue={label} autoComplete="off" lang={locale} className={adminInputClassName} disabled={pending} />
      </div>
      {state.field === "label" && state.error ? (
        <p role="alert" className={adminErrorClassName}>{state.error}</p>
      ) : null}
      <div>
        <label htmlFor={`slug-${locale}`} className={adminLabelClassName}>Slug ({locale})</label>
        <input id={`slug-${locale}`} name="slug" defaultValue={slug} autoComplete="off" lang={locale} className={adminInputClassName} disabled={pending} />
      </div>
      {state.field === "slug" && state.error ? (
        <p role="alert" className={adminErrorClassName}>{state.error}</p>
      ) : null}
      {state.error && !state.field ? <p role="alert" className={adminErrorClassName}>{state.error}</p> : null}
      {state.ok ? <p role="status" className={adminSuccessClassName}>Saved {localeName(locale)}.</p> : null}
      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">{pending ? "Saving…" : `Save ${localeName(locale)}`}</Button>
      </div>
    </form>
  );
}

function localeName(locale: string) {
  return { en: "English", ja: "Japanese", ko: "Korean" }[locale] ?? locale.toUpperCase();
}
