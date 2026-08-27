"use client";

import { useActionState } from "react";
import { updateCategoryFlags, upsertCategoryLocale, type ActionState } from "../actions";

/** Structure flags (parent/sort/visibility). Active is toggled separately. */
export function FlagsForm({
  category,
}: {
  category: { id: string; parent_id: string | null; sort: number; publicly_visible: boolean };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCategoryFlags, {});

  return (
    <form action={action} aria-label="Category settings" style={{ display: "grid", gap: "0.5rem", maxWidth: 420 }}>
      <h2>Settings</h2>
      <input type="hidden" name="category_id" value={category.id} />
      <label>
        Parent category id
        <input
          name="parent_id"
          defaultValue={category.parent_id ?? ""}
          autoComplete="off"
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label>
        Sort order
        <input name="sort" type="number" defaultValue={category.sort} style={{ display: "block", width: "6rem" }} />
      </label>
      <label>
        <input name="publicly_visible" type="checkbox" defaultChecked={category.publicly_visible} /> Publicly visible
      </label>
      {state.error ? <p role="alert" style={{ color: "#b00020", margin: 0 }}>{state.error}</p> : null}
      {state.ok ? <p role="status" style={{ color: "#166534", margin: 0 }}>Saved.</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
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
    <form action={action} aria-label={`${locale} label and slug`} style={{ display: "grid", gap: "0.4rem", maxWidth: 420 }}>
      <input type="hidden" name="category_id" value={categoryId} />
      <input type="hidden" name="locale" value={locale} />
      <label>
        Label ({locale})
        <input name="label" defaultValue={label} autoComplete="off" lang={locale} style={{ display: "block", width: "100%" }} />
      </label>
      {state.field === "label" && state.error ? (
        <p role="alert" style={{ color: "#b00020", margin: 0 }}>{state.error}</p>
      ) : null}
      <label>
        Slug ({locale})
        <input name="slug" defaultValue={slug} autoComplete="off" lang={locale} style={{ display: "block", width: "100%" }} />
      </label>
      {state.field === "slug" && state.error ? (
        <p role="alert" style={{ color: "#b00020", margin: 0 }}>{state.error}</p>
      ) : null}
      {state.error && !state.field ? <p role="alert" style={{ color: "#b00020", margin: 0 }}>{state.error}</p> : null}
      {state.ok ? <p role="status" style={{ color: "#166534", margin: 0 }}>Saved {locale}.</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Saving…" : `Save ${locale}`}</button>
    </form>
  );
}
