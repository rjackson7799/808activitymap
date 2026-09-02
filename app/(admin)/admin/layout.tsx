import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/config/env";
import { AdminNav } from "@/components/admin/AdminNav";
import { Button } from "@/components/ui/button";
import { signOut } from "../login/actions";

/**
 * Admin shell (CP3). Wraps ONLY `/admin/*` — `/login` and `/login/mfa` are
 * siblings under the (admin) route group, not children of `admin/`, so this
 * guard cannot deadlock sign-in. NEVER move this to `app/(admin)/layout.tsx`:
 * that would wrap the login flow and self-lock staff out.
 *
 * The layout guard is redirect ergonomics; it is NOT the security boundary —
 * every page and every server action self-guards with requireRole, and RLS +
 * the guarded SECURITY DEFINER fns back it at the DB (ADR-001).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let claims;
  try {
    claims = await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) {
      redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    }
    throw e;
  }

  const brand = env().BRAND_NAME;

  return (
    <div className="min-h-dvh bg-shell text-body">
      <a
        href="#admin-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-field bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift focus:translate-y-0"
      >
        Skip to content
      </a>

      <header className="border-b border-hairline-strong bg-shell/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:flex-nowrap">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-3 text-ink">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-cta bg-ink font-serif text-lg text-gold-light shadow-card"
            >
              808
            </span>
            <span>
              <span className="block text-sm font-bold leading-tight">{brand}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Staff workspace
              </span>
            </span>
          </Link>

          <div className="order-3 w-full lg:order-none lg:w-auto">
            <AdminNav roles={claims.appRoles} />
          </div>

          <form action={signOut}>
            <Button type="submit" variant="outline" size="md">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main id="admin-content" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
