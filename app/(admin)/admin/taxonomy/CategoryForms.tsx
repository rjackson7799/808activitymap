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
import { createCategory, setCategoryActive, type ActionState } from "./actions";

/**
 * Taxonomy client forms (CP3). Server actions self-guard; these only render
 * inputs + surface the typed ActionState (field-scoped errors near the field,
 * so "duplicate slug" lands on the slug input — the "clean surfaced validation
 * error" the slice requires). Native browser focus rings are kept for
 * keyboard/visible-focus a11y.
 */

export function NewCategoryForm({ parents }: { parents: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCategory, {});

  return (
    <form action={action} aria-label="Create category" className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6">
      <div className="mb-5">
        <p className="eyebrow mb-2">Create</p>
        <h2 className="text-xl font-bold text-ink">New category</h2>
        <p className="mt-1 text-sm leading-6 text-secondary">Start with the English public label and URL slug.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="new-category-label" className={adminLabelClassName}>Label (English)</label>
          <input id="new-category-label" name="label" required autoComplete="off" className={adminInputClassName} disabled={pending} />
        </div>
      {state.field === "label" && state.error ? (
          <p role="alert" className={adminErrorClassName}>{state.error}</p>
      ) : null}
        <div>
          <label htmlFor="new-category-slug" className={adminLabelClassName}>Slug (English)</label>
          <input id="new-category-slug" name="slug" required autoComplete="off" className={adminInputClassName} disabled={pending} />
          <p className="mt-2 text-xs leading-5 text-muted">Lowercase letters, numbers, and hyphens only.</p>
        </div>
      {state.field === "slug" && state.error ? (
          <p role="alert" className={adminErrorClassName}>{state.error}</p>
      ) : null}
        <div>
          <label htmlFor="new-category-parent" className={adminLabelClassName}>Parent category</label>
          <select id="new-category-parent" name="parent_id" defaultValue="" className={adminInputClassName} disabled={pending}>
            <option value="">Top level</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="max-w-32">
          <label htmlFor="new-category-sort" className={adminLabelClassName}>Sort order</label>
          <input id="new-category-sort" name="sort" type="number" defaultValue={0} className={adminInputClassName} disabled={pending} />
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-field bg-field px-3 py-2 text-sm font-semibold text-ink">
          <input name="publicly_visible" type="checkbox" defaultChecked className={adminCheckboxClassName} disabled={pending} />
          Publicly visible
        </label>
      {state.error && !state.field ? (
          <p role="alert" className={adminErrorClassName}>{state.error}</p>
      ) : null}
      {state.ok ? (
          <p role="status" className={adminSuccessClassName}>Category created.</p>
      ) : null}
        <Button type="submit" variant="cta" size="lg" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create category"}
        </Button>
      </div>
    </form>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setCategoryActive, {});

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="category_id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Saving…" : active ? "Deactivate" : "Activate"}
      </Button>
      {state.error ? (
        <span role="alert" className="text-xs font-medium text-error">{state.error}</span>
      ) : null}
    </form>
  );
}
