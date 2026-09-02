import { redirect } from "next/navigation";
import { AlertTriangle, LockKeyhole, PencilLine } from "lucide-react";
import { CONFIG_GROUPS, formatAdminConfigValue } from "@/config/admin-config";
import { APP_CONFIG_REGISTRY, type AppConfigKey } from "@/config/app-config";
import { Badge } from "@/components/ui/badge";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ConfigEditor } from "./ConfigEditor";

type ConfigRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
};

export default async function AdminConfigPage() {
  let claims;
  try {
    claims = await requireRole(STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    }
    throw error;
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("app_config")
    .select("key, value, description, updated_by, updated_at")
    .order("key");
  const rows = (data ?? []) as ConfigRow[];
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const registryKeys = new Set(Object.keys(APP_CONFIG_REGISTRY));
  const unknownRows = rows.filter((row) => !registryKeys.has(row.key));
  const missingKeys = Object.keys(APP_CONFIG_REGISTRY).filter((key) => !rowByKey.has(key));
  const canEdit = claims.appRoles.includes("super_admin");

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Platform governance</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Configuration registry</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Review the operational values defined by the Phase 0 product contract. These settings control existing platform behavior; they do not activate deferred product features.
        </p>
      </header>

      <section aria-label="Registry access" className="grid gap-4 rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:grid-cols-[auto_1fr] sm:items-start sm:p-6">
        <span className={`grid h-11 w-11 place-items-center rounded-cta ${canEdit ? "bg-info-bg text-teal-dark" : "bg-neutral text-secondary"}`}>
          {canEdit ? <PencilLine aria-hidden="true" className="h-5 w-5" /> : <LockKeyhole aria-hidden="true" className="h-5 w-5" />}
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">{canEdit ? "Super-admin editing enabled" : "Read-only registry access"}</h2>
          <p className="mt-1 text-sm leading-6 text-secondary">
            {canEdit
              ? "Every save is schema-validated, attributed to your MFA-authenticated account, and written to the immutable audit log."
              : "All staff can inspect current policy. Only an MFA-authenticated super-admin can change values."}
          </p>
        </div>
      </section>

      {error ? (
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          Couldn&apos;t load the configuration registry. Please try again.
        </p>
      ) : null}

      {!error && (missingKeys.length > 0 || unknownRows.length > 0) ? (
        <section aria-labelledby="drift-heading" className="rounded-card border border-[#efd9a0] bg-warning-bg p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-terracotta-deep" />
            <div>
              <h2 id="drift-heading" className="font-bold text-ink">Registry drift detected</h2>
              {missingKeys.length > 0 ? <p className="mt-2 break-words text-sm text-secondary">Missing rows: {missingKeys.join(", ")}</p> : null}
              {unknownRows.length > 0 ? <p className="mt-2 break-words text-sm text-secondary">Unregistered rows: {unknownRows.map((row) => row.key).join(", ")}</p> : null}
              <p className="mt-2 text-sm text-secondary">Resolve this through a reviewed migration; this screen never creates or deletes registry keys.</p>
            </div>
          </div>
        </section>
      ) : null}

      {!error ? CONFIG_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`config-group-${group.id}`}>
          <div className="mb-4 max-w-3xl">
            <h2 id={`config-group-${group.id}`} className="text-xl font-bold text-ink">{group.label}</h2>
            <p className="mt-1 text-sm leading-6 text-secondary">{group.description}</p>
          </div>
          <div className="grid gap-5">
            {group.keys.map((key) => {
              const row = rowByKey.get(key);
              return <ConfigCard key={key} configKey={key} row={row} canEdit={canEdit} />;
            })}
          </div>
        </section>
      )) : null}
    </div>
  );
}
function ConfigCard({ configKey, row, canEdit }: { configKey: AppConfigKey; row?: ConfigRow; canEdit: boolean }) {
  const definition = APP_CONFIG_REGISTRY[configKey];
  const value = row ? formatAdminConfigValue(row.value) : "";

  return (
    <article className="overflow-hidden rounded-card border border-hairline-strong bg-white shadow-card">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-all font-mono text-base font-bold text-ink">{configKey}</h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-secondary">{definition.description}</p>
          </div>
          <Badge variant={definition.critical ? "stale" : "neutral"}>{definition.critical ? "Critical" : "Standard"}</Badge>
        </div>

        {row ? (
          <>
            {canEdit ? (
              <ConfigEditor configKey={configKey} value={value} />
            ) : (
              <div className="mt-5 border-t border-hairline pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Current JSON value</p>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-field border border-hairline-strong bg-field p-4 font-mono text-sm leading-6 text-ink">{value}</pre>
              </div>
            )}
            <p className="mt-4 break-words text-xs leading-5 text-muted">
              Updated <time dateTime={row.updated_at}>{formatDateTime(row.updated_at)}</time>{row.updated_by ? ` by staff ${row.updated_by.slice(0, 8)}` : " by migration or system"}.
            </p>
          </>
        ) : (
          <p role="alert" className="mt-5 rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">This required registry row is missing. Add it through a reviewed migration.</p>
        )}
      </div>
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}
