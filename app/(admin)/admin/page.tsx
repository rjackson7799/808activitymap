import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, ClipboardCheck, Clock3, History, Languages, MapPinned, MessageSquareText, Settings2, ShieldCheck, Tags, Ticket } from "lucide-react";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { canManageBusinessInquiries } from "@/lib/business-inquiries/admin";

/**
 * Admin dashboard. Self-guards (the layout also guards — defense in depth;
 * neither is the boundary: server actions + RLS + guarded fns are, ADR-001).
 * The shell (nav, sign-out, <main> landmark) lives in the admin layout.
 */
export default async function AdminPage() {
  let claims;
  try {
    claims = await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) {
      redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    }
    throw e;
  }

  const primaryRole = claims.appRoles[0]?.replaceAll("_", " ") ?? "staff";

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Dashboard</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Admin workspace</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Manage the structured information that powers the public discovery experience.
        </p>
      </header>

      <section aria-labelledby="workspace-heading">
        <div className="mb-4">
          <h2 id="workspace-heading" className="text-xl font-bold text-ink">
            Workspace
          </h2>
          <p className="mt-1 text-sm text-secondary">Choose an area to review or update.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <WorkspaceCard
            href="/admin/taxonomy"
            title="Taxonomy"
            description="Manage categories and localized labels."
            icon={<Tags aria-hidden="true" className="h-5 w-5" />}
          />
          <WorkspaceCard
            href="/admin/listings"
            title="Listings"
            description="Review publication status and locale readiness."
            icon={<MapPinned aria-hidden="true" className="h-5 w-5" />}
          />
          <WorkspaceCard
            href="/admin/freshness"
            title="Freshness"
            description="Monitor approved facts against their review windows."
            icon={<Clock3 aria-hidden="true" className="h-5 w-5" />}
          />
          <WorkspaceCard
            href="/admin/qa/ja"
            title="Language QA"
            description="Review Japanese and Korean listing and menu translations."
            icon={<Languages aria-hidden="true" className="h-5 w-5" />}
          />
          <WorkspaceCard
            href="/admin/approvals"
            title="Menu approvals"
            description="Track written vendor sign-off and evidence by locale."
            icon={<ClipboardCheck aria-hidden="true" className="h-5 w-5" />}
          />
          <WorkspaceCard
            href="/admin/change-requests"
            title="Corrections"
            description="Process community-submitted listing corrections."
            icon={<MessageSquareText aria-hidden="true" className="h-5 w-5" />}
          />
          <WorkspaceCard
            href="/admin/deals"
            title="Deals"
            description="Prepare localized offers and manage disclosed, tracked partner links."
            icon={<Ticket aria-hidden="true" className="h-5 w-5" />}
          />
          {canManageBusinessInquiries(claims.appRoles) ? (
            <WorkspaceCard
              href="/admin/business-inquiries"
              title="Business inquiries"
              description="Follow up on interest from the public business page."
              icon={<BriefcaseBusiness aria-hidden="true" className="h-5 w-5" />}
            />
          ) : null}
          <WorkspaceCard
            href="/admin/audit"
            title="Audit log"
            description="Review immutable staff and system activity."
            icon={<History aria-hidden="true" className="h-5 w-5" />}
          />
          <WorkspaceCard
            href="/admin/config"
            title="Configuration"
            description="Review operational policy and runtime settings."
            icon={<Settings2 aria-hidden="true" className="h-5 w-5" />}
          />
        </div>
      </section>

      <section
        aria-labelledby="session-heading"
        className="grid gap-5 rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-success">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
            <h2 id="session-heading" className="text-sm font-bold uppercase tracking-wider">
              Secure session
            </h2>
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-ink" title={claims.email ?? claims.sub}>
            {claims.email ?? claims.sub}
          </p>
          <p className="mt-1 text-sm text-secondary">Two-factor authentication verified for this session.</p>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm sm:min-w-64">
          <div className="rounded-field bg-field px-3 py-2.5">
            <dt className="text-xs font-semibold text-muted">Role</dt>
            <dd className="mt-1 capitalize text-ink">{primaryRole}</dd>
          </div>
          <div className="rounded-field bg-success-bg px-3 py-2.5">
            <dt className="text-xs font-semibold text-success">Assurance</dt>
            <dd className="mt-1 font-bold uppercase text-success">{claims.aal}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function WorkspaceCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-44 flex-col rounded-card border border-hairline-strong bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-teal/30 hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-10 w-10 place-items-center rounded-cta bg-info-bg text-teal-dark">{icon}</span>
        <ArrowUpRight
          aria-hidden="true"
          className="h-5 w-5 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal-dark"
        />
      </div>
      <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-secondary">{description}</p>
    </Link>
  );
}
