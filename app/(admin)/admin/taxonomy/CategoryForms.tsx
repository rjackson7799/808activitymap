"use client";

import { useActionState } from "react";
import { createCategory, setCategoryActive, type ActionState } from "./actions";

/**
 * Taxonomy client forms (CP3). Server actions self-guard; these only render
 * inputs + surface the typed ActionState (field-scoped errors near the field,
 * so "duplicate slug" lands on the slug input — the "clean surfaced validation
 * error" the slice requires). Native browser focus rings are kept for
 * keyboard/visible-focus a11y; design tokens arrive in CP4.
 */

export function NewCategoryForm({ parents }: { parents: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCategory, {});

  return (
    <form action={action} aria-label="Create category" style={{ display: "grid", gap: "0.5rem", maxWidth: 420 }}>
      <h2>New category</h2>
      <label>
        Label (English)
        <input name="label" required autoComplete="off" style={{ display: "block", width: "100%" }} />
      </label>
      {state.field === "label" && state.error ? (
        <p role="alert" style={{ color: "#b00020", margin: 0 }}>{state.error}</p>
      ) : null}
      <label>
        Slug (English)
        <input name="slug" required autoComplete="off" style={{ display: "block", width: "100%" }} />
      </label>
      {state.field === "slug" && state.error ? (
        <p role="alert" style={{ color: "#b00020", margin: 0 }}>{state.error}</p>
      ) : null}
      <label>
        Parent category
        <select name="parent_id" defaultValue="" style={{ display: "block", width: "100%" }}>
          <option value="">(top level)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label>
        Sort order
        <input name="sort" type="number" defaultValue={0} style={{ display: "block", width: "6rem" }} />
      </label>
      <label>
        <input name="publicly_visible" type="checkbox" defaultChecked /> Publicly visible
      </label>
      {state.error && !state.field ? (
        <p role="alert" style={{ color: "#b00020", margin: 0 }}>{state.error}</p>
      ) : null}
      {state.ok ? (
        <p role="status" style={{ color: "#166534", margin: 0 }}>Category created.</p>
      ) : null}
      <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create category"}</button>
    </form>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setCategoryActive, {});

  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="category_id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button type="submit" disabled={pending}>{active ? "Deactivate" : "Activate"}</button>
      {state.error ? (
        <span role="alert" style={{ color: "#b00020", marginLeft: "0.5rem" }}>{state.error}</span>
      ) : null}
    </form>
  );
}
