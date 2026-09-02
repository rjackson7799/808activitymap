"use client";

import { useActionState } from "react";
import {
  adminErrorClassName,
  adminInputClassName,
  adminSuccessClassName,
} from "@/components/admin/formStyles";
import { Button } from "@/components/ui/button";
import { updateConfigValue, type ConfigActionState } from "./actions";

export function ConfigEditor({ configKey, value }: { configKey: string; value: string }) {
  const [state, action, pending] = useActionState<ConfigActionState, FormData>(updateConfigValue, {});
  const fieldId = `config-value-${configKey}`;
  const rows = Math.min(18, Math.max(4, value.split("\n").length + 1));

  return (
    <form action={action} aria-label={`Edit ${configKey}`} className="mt-5 border-t border-hairline pt-5">
      <input type="hidden" name="key" value={configKey} />
      <label htmlFor={fieldId} className="block text-sm font-semibold text-ink">
        JSON value
      </label>
      <textarea
        id={fieldId}
        name="value"
        required
        rows={rows}
        defaultValue={value}
        disabled={pending}
        spellCheck={false}
        className={`${adminInputClassName} resize-y font-mono leading-6`}
      />
      <p className="mt-2 text-xs leading-5 text-muted">
        Use JSON syntax. Strings require quotes; booleans and numbers do not.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Validating…" : "Validate and save"}
        </Button>
        <span className="text-xs text-muted">Your account and the before/after values are audit-logged.</span>
      </div>

      {state.error ? <p role="alert" className={`${adminErrorClassName} mt-4`}>{state.error}</p> : null}
      {state.ok ? <p role="status" className={`${adminSuccessClassName} mt-4`}>Setting saved and public caches refreshed.</p> : null}
    </form>
  );
}
